import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { Badge } from "../../components/Badge";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { LoadingState, ErrorState } from "../../components/States";
import { RecentActivityCard } from "../../components/RecentActivityCard";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "../../hooks/useResponsive";
import { formatRupiah } from "../../lib/formatters";
import {
  applySalesSummaryToDashboard,
  calculateTodayDashboardMetrics,
  getRecentOrders,
  TodayDashboardMetrics,
  DashboardOrder,
} from "../../lib/dashboard-logic";
import { getBusinessDateString, getBusinessDayRangeISO } from "../../lib/timezone";
import { getOrderStatusBadgeTone } from "../../lib/order-logic";
import { mapSalesSummary, SalesSummaryRpc } from "../../lib/report-logic";

interface MasterDataStats {
  totalEmployees: number;
  activeEmployees: number;
  totalUsers: number;
  adminUsers: number;
  kasirUsers: number;
  customerUsers: number;
  totalProducts: number;
  availableProducts: number;
  unavailableProducts: number;
  totalCategories: number;
  totalInventoryItems: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { openSidebar } = useAdminSidebar();
  const { isTablet, isLandscape } = useResponsive();

  const [masterStats, setMasterStats] = useState<MasterDataStats>({
    totalEmployees: 0,
    activeEmployees: 0,
    totalUsers: 0,
    adminUsers: 0,
    kasirUsers: 0,
    customerUsers: 0,
    totalProducts: 0,
    availableProducts: 0,
    unavailableProducts: 0,
    totalCategories: 0,
    totalInventoryItems: 0,
  });

  const [todayMetrics, setTodayMetrics] = useState<TodayDashboardMetrics>({
    todayOrderCount: 0,
    todayPaidOrderCount: 0,
    todayInProgressCount: 0,
    todayAwaitingPaymentCount: 0,
    todaySales: 0,
    todayExpenses: 0,
    todayNetResult: 0,
    topProductToday: null,
    safeStockCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });

  const [recentOrders, setRecentOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Error ditampilkan apa adanya (bukan angka 0 yang terlihat seperti "tidak ada penjualan").
  const [errorMessage, setErrorMessage] = useState("");
  // Waktu data terakhir berhasil dimuat; null = belum pernah, jadi kartu angka tidak ditampilkan.
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  // Memicu muat ulang kartu aktivitas setiap kali dashboard dimuat ulang.
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    setActivityRefreshKey((k) => k + 1);
    try {
      setErrorMessage("");
      // Pesanan customer yang lewat batas bayar dibatalkan dulu agar angka "menunggu bayar" akurat.
      await supabase.rpc("expire_unpaid_orders");

      const today = getBusinessDateString();
      const { startISO, endISO } = getBusinessDayRangeISO(today, today);
      const orderColumns =
        "id, order_number, order_status, payment_status, total_amount, customer_name, payment_method, created_at, paid_at";

      const [
        employeesRes,
        usersRes,
        categoriesRes,
        productsRes,
        inventoryRes,
        todayOrdersRes,
        recentRes,
        summaryRes,
        awaitingRes,
      ] = await Promise.all([
        supabase.from("employees").select("id, status"),
        supabase.from("users").select("id, role"),
        supabase.from("categories").select("id, status"),
        supabase.from("products").select("id, is_active, status"),
        // Hanya bahan aktif
        supabase
          .from("inventory_items")
          .select("id, name, is_active, current_stock, min_stock")
          .eq("is_active", true),
        // Order yang dibuat hari ini (zona waktu bisnis) untuk jumlah order & yang sedang berjalan
        supabase
          .from("orders")
          .select(orderColumns)
          .gte("created_at", startISO)
          .lt("created_at", endISO)
          .order("created_at", { ascending: false }),
        supabase.from("orders").select(orderColumns).order("created_at", { ascending: false }).limit(5),
        // Omzet, biaya & produk terlaris dihitung database — sama persis dengan halaman Laporan
        supabase.rpc("get_sales_summary", { p_from: today, p_to: today }),
        // Semua pesanan customer yang masih menunggu dibayar (bukan hanya hari ini)
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("order_status", "Pending")
          .eq("payment_status", "Pending")
          .eq("payment_channel", "Kasir"),
      ]);
      for (const res of [
        employeesRes,
        usersRes,
        categoriesRes,
        productsRes,
        inventoryRes,
        todayOrdersRes,
        recentRes,
        summaryRes,
        awaitingRes,
      ]) {
        if (res.error) throw res.error;
      }

      const empList = employeesRes.data || [];
      const activeEmp = empList.filter((e) => e.status === "Aktif").length;
      const userList = usersRes.data || [];
      const adminCount = userList.filter((u) => u.role === "Admin").length;
      const kasirCount = userList.filter((u) => u.role === "Kasir").length;
      const customerCount = userList.filter((u) => u.role === "Customer").length;
      const activeCats = (categoriesRes.data || []).filter((c) => c.status === "Aktif").length;
      const prodList = (productsRes.data || []).filter((p) => p.is_active);
      const availCount = prodList.filter((p) => p.status === "Tersedia").length;
      const unavailCount = prodList.filter((p) => p.status === "Tidak Tersedia").length;
      const invList = inventoryRes.data || [];
      const ordersList = (todayOrdersRes.data as unknown as DashboardOrder[]) || [];

      // Metrik lokal (jumlah order, status stok), lalu angka keuangan dari database (PRD 27).
      const metrics = applySalesSummaryToDashboard(
        calculateTodayDashboardMetrics(ordersList, [], invList, new Date()),
        mapSalesSummary(summaryRes.data as unknown as SalesSummaryRpc | null),
        { awaitingPaymentCount: awaitingRes.count ?? 0 }
      );

      const latestOrders = getRecentOrders((recentRes.data as unknown as DashboardOrder[]) || [], 5);

      setMasterStats({
        totalEmployees: empList.length,
        activeEmployees: activeEmp,
        totalUsers: userList.length,
        adminUsers: adminCount,
        kasirUsers: kasirCount,
        customerUsers: customerCount,
        totalProducts: prodList.length,
        availableProducts: availCount,
        unavailableProducts: unavailCount,
        totalCategories: activeCats,
        totalInventoryItems: invList.length,
      });

      setTodayMetrics(metrics);
      setRecentOrders(latestOrders);
      setLastLoadedAt(new Date());
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      setErrorMessage(err?.message || "Gagal memuat data dashboard. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Muat ulang setiap kali dashboard dibuka kembali.
  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatOrderTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Dashboard Admin"
        subtitle={user?.email ?? undefined}
        onOpenSidebar={openSidebar}
      />

      <ScrollView
        contentContainerStyle={{
          padding: isTablet ? 28 : 20,
          paddingBottom: 110,
          maxWidth: 1200,
          alignSelf: "center",
          width: "100%",
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#D1001F"]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? (
          <ErrorState
            message={
              lastLoadedAt
                ? `${errorMessage} Angka di bawah dari pembaruan terakhir pukul ${formatOrderTime(lastLoadedAt.toISOString())}.`
                : errorMessage
            }
            onRetry={onRefresh}
          />
        ) : null}

        {/* Stock Alert Warning Banner */}
        {(todayMetrics.lowStockCount > 0 ||
          todayMetrics.outOfStockCount > 0) && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Lihat bahan baku yang stoknya menipis atau habis"
            onPress={() => router.replace("/(admin)/inventory")}
            activeOpacity={0.8}
            className="bg-warning-soft rounded-card p-4 border border-warning/30 mb-5"
          >
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center">
                <Ionicons name="warning" size={20} color="#B45309" />
                <Text className="font-heading-semibold text-warning text-sm ml-2">
                  Peringatan Stok Bahan Baku
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#B45309" />
            </View>
            <Text className="font-body text-warning text-xs leading-4">
              {todayMetrics.outOfStockCount > 0 &&
                `${todayMetrics.outOfStockCount} bahan baku HABIS. `}
              {todayMetrics.lowStockCount > 0 &&
                `${todayMetrics.lowStockCount} bahan baku MENIPIS di bawah batas minimum.`}
            </Text>
            <Text className="font-body-medium text-warning text-xs mt-2 underline">
              Ketuk untuk buka modul inventaris dan catat stok masuk
            </Text>
          </TouchableOpacity>
        )}

        {/* SECTION 1: METRIK HARI INI (PRD Section 27 - Live Sales & Financial) */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Ionicons name="today-outline" size={20} color="#D1001F" />
            <Text className="font-heading-semibold text-text text-lg ml-2">
              Kondisi Operasional Hari Ini
            </Text>
          </View>
          {lastLoadedAt && !errorMessage ? (
            <Badge
              label={`Diperbarui ${formatOrderTime(lastLoadedAt.toISOString())}`}
              tone="neutral"
            />
          ) : null}
        </View>

        {loading && !lastLoadedAt ? (
          <View className="bg-surface rounded-card p-6 border border-line mb-6">
            <LoadingState label="Memuat ringkasan hari ini..." />
          </View>
        ) : !lastLoadedAt ? null : (
          <View
            className={
              isTablet ? "flex-row flex-wrap justify-between mb-6" : "mb-6"
            }
          >
            {/* Card 1: Omzet Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line mb-3.5"
              style={
                isTablet
                  ? { width: isLandscape ? "23.5%" : "48.5%" }
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-body-medium text-muted text-xs">
                  Omzet Penjualan
                </Text>
                <View className="w-8 h-8 rounded-full bg-success-soft items-center justify-center">
                  <Ionicons name="cash-outline" size={16} color="#166534" />
                </View>
              </View>
              <Text className="font-heading text-text text-xl">
                {formatRupiah(todayMetrics.todaySales)}
              </Text>
              <Text className="font-body text-success text-xs mt-1">
                {todayMetrics.todayPaidOrderCount} order lunas
              </Text>
              {todayMetrics.todayAwaitingPaymentCount > 0 && (
                <Text className="font-body text-warning text-xs mt-0.5">
                  {todayMetrics.todayAwaitingPaymentCount} menunggu pembayaran
                </Text>
              )}
            </View>

            {/* Card 2: Jumlah Order Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line mb-3.5"
              style={
                isTablet
                  ? { width: isLandscape ? "23.5%" : "48.5%" }
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-body-medium text-muted text-xs">
                  Pesanan Masuk
                </Text>
                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
                  <Ionicons name="receipt-outline" size={16} color="#D1001F" />
                </View>
              </View>
              <Text className="font-heading text-text text-xl">
                {todayMetrics.todayOrderCount}
              </Text>
              <Text className="font-body text-muted text-xs mt-1">
                Total semua pesanan hari ini
              </Text>
            </View>

            {/* Card 3: Produk Terlaris Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line mb-3.5"
              style={
                isTablet
                  ? { width: isLandscape ? "23.5%" : "48.5%" }
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-body-medium text-muted text-xs">
                  Produk Terlaris
                </Text>
                <View className="w-8 h-8 rounded-full bg-warning-soft items-center justify-center">
                  <Ionicons name="trophy-outline" size={16} color="#B45309" />
                </View>
              </View>
              <Text
                className="font-heading text-text text-base"
                numberOfLines={1}
              >
                {todayMetrics.topProductToday?.name || "-"}
              </Text>
              <Text className="font-body text-warning text-xs mt-1">
                {todayMetrics.topProductToday
                  ? `${todayMetrics.topProductToday.quantity} terjual`
                  : "Belum ada pesanan lunas"}
              </Text>
            </View>

            {/* Card 4: Net Result Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line mb-3.5"
              style={
                isTablet
                  ? { width: isLandscape ? "23.5%" : "48.5%" }
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-body-medium text-muted text-xs">
                  Laba Bersih (Net)
                </Text>
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center ${
                    todayMetrics.todayNetResult >= 0
                      ? "bg-success-soft"
                      : "bg-danger-soft"
                  }`}
                >
                  <Ionicons
                    name={
                      todayMetrics.todayNetResult >= 0
                        ? "trending-up"
                        : "trending-down"
                    }
                    size={16}
                    color={
                      todayMetrics.todayNetResult >= 0 ? "#166534" : "#991B1B"
                    }
                  />
                </View>
              </View>
              <Text
                className={`font-heading text-xl ${
                  todayMetrics.todayNetResult >= 0
                    ? "text-success"
                    : "text-danger"
                }`}
              >
                {formatRupiah(todayMetrics.todayNetResult)}
              </Text>
              <Text className="font-body text-muted text-xs mt-1">
                Biaya: {formatRupiah(todayMetrics.todayExpenses)}
              </Text>
            </View>
          </View>
        )}

        {/* SECTION 2: 5 RECENT ORDERS (PRD Section 27) */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={18} color="#1F2937" />
            <Text className="font-heading-semibold text-text text-lg ml-2">
              Pesanan Terbaru
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka semua pesanan"
            onPress={() => router.replace("/(admin)/orders")}
            className="flex-row items-center min-h-11"
          >
            <Text className="text-primary font-heading-semibold text-xs mr-1">
              Semua Pesanan
            </Text>
            <Ionicons name="arrow-forward" size={12} color="#D1001F" />
          </TouchableOpacity>
        </View>

        <View className="bg-surface rounded-card border border-line p-3 mb-6 divide-y divide-line">
          {recentOrders.length === 0 ? (
            <Text className="text-muted text-xs text-center py-4 italic">
              Belum ada riwayat pesanan tercatat di sistem.
            </Text>
          ) : (
            recentOrders.map((ord) => (
              <View
                key={ord.id}
                className="py-2.5 flex-row justify-between items-center"
              >
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center">
                    <Text className="font-heading text-text text-xs mr-2">
                      {ord.order_number}
                    </Text>
                    <Badge
                      label={ord.order_status}
                      tone={getOrderStatusBadgeTone(ord.order_status)}
                    />
                  </View>
                  <Text className="font-body text-muted text-xs mt-0.5">
                    {ord.customer_name || "Pelanggan"} •{" "}
                    {formatOrderTime(ord.created_at)} •{" "}
                    {ord.payment_method || "-"}
                  </Text>
                </View>

                <Text className="font-heading text-primary text-sm">
                  {formatRupiah(ord.total_amount)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* SECTION 2b: AKTIVITAS OPERASIONAL PENTING (PRD Section 27) */}
        <RecentActivityCard refreshKey={activityRefreshKey} />

        {/* Data master: angka nyata + pintasan. Navigasi lengkap tetap di sidebar. */}
        <Text className="font-heading-semibold text-text text-lg mb-3">Data Master</Text>
        <View className="bg-surface rounded-card border border-line mb-6">
          {[
            {
              route: "/(admin)/product",
              icon: "cafe-outline",
              title: "Produk",
              detail: `${masterStats.availableProducts} tersedia, ${masterStats.unavailableProducts} habis`,
            },
            {
              route: "/(admin)/category",
              icon: "layers-outline",
              title: "Kategori",
              detail: `${masterStats.totalCategories} kategori aktif`,
            },
            {
              route: "/(admin)/inventory",
              icon: "cube-outline",
              title: "Bahan baku",
              detail: `${todayMetrics.safeStockCount} aman, ${todayMetrics.lowStockCount} menipis, ${todayMetrics.outOfStockCount} habis`,
            },
            {
              route: "/(admin)/expense",
              icon: "wallet-outline",
              title: "Biaya operasional",
              detail: `Hari ini ${formatRupiah(todayMetrics.todayExpenses)}`,
            },
            {
              route: "/(admin)/report",
              icon: "trending-up-outline",
              title: "Laporan & finansial",
              detail: "Omzet, menu terlaris, dan laba bersih per periode",
            },
            {
              route: "/(admin)/employee",
              icon: "people-outline",
              title: "Karyawan",
              detail: `${masterStats.activeEmployees} dari ${masterStats.totalEmployees} aktif`,
            },
            {
              route: "/(admin)/user",
              icon: "key-outline",
              title: "Akun pengguna",
              detail: `${masterStats.kasirUsers} kasir, ${masterStats.customerUsers} customer`,
            },
          ].map((row, idx) => {
            // Angka hanya ditampilkan setelah data berhasil dimuat (bukan 0 bawaan state).
            const detail = lastLoadedAt || row.route === "/(admin)/report" ? row.detail : "Belum dimuat";
            return (
              <TouchableOpacity
                key={row.route}
                accessibilityRole="button"
                accessibilityLabel={`Buka ${row.title}. ${detail}`}
                onPress={() => router.replace(row.route as never)}
                className={`flex-row items-center px-4 py-2.5 min-h-14 ${idx > 0 ? "border-t border-line" : ""}`}
              >
                <Ionicons name={row.icon as keyof typeof Ionicons.glyphMap} size={20} color="#4B5563" />
                <View className="flex-1 ml-3 mr-2">
                  <Text className="font-heading-semibold text-text text-sm">{row.title}</Text>
                  <Text className="font-body text-muted text-xs mt-0.5" numberOfLines={1}>
                    {detail}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
