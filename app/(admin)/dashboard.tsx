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
        subtitle="Pusat Kendali Operasional Kedai Kopi"
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
        {/* User Profile Card */}
        <View className="bg-surface rounded-card p-5 border border-line shadow-sm mb-5 flex-row items-center">
          <View className="w-12 h-12 rounded-chip bg-primary/10 items-center justify-center mr-3.5 border border-primary/20">
            <Ionicons name="person-circle-outline" size={32} color="#D1001F" />
          </View>
          <View className="flex-1 mr-2">
            <Text className="font-body text-muted text-xs">
              Akun Administrator
            </Text>
            <Text
              className="font-heading-semibold text-text text-base"
              numberOfLines={1}
            >
              {user?.email}
            </Text>
            <View className="mt-1.5 self-start">
              <Badge
                label="Role: Administrator"
                tone="accent"
                icon={
                  <Ionicons name="shield-checkmark" size={12} color="#D1001F" />
                }
              />
            </View>
          </View>
        </View>

        {errorMessage ? (
          <ErrorState
            message={`${errorMessage} Angka di bawah mungkin belum terbaru.`}
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
            className="bg-amber-50 rounded-card p-4 border border-amber-200 mb-5 shadow-sm"
          >
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center">
                <Ionicons name="warning" size={20} color="#D97706" />
                <Text className="font-heading-semibold text-amber-900 text-sm ml-2">
                  Peringatan Stok Bahan Baku
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D97706" />
            </View>
            <Text className="font-body text-amber-800 text-xs leading-4">
              {todayMetrics.outOfStockCount > 0 &&
                `${todayMetrics.outOfStockCount} bahan baku HABIS. `}
              {todayMetrics.lowStockCount > 0 &&
                `${todayMetrics.lowStockCount} bahan baku MENIPIS di bawah batas minimum.`}
            </Text>
            <Text className="font-body-medium text-amber-900 text-xs mt-2 underline">
              Ketuk untuk buka modul inventaris dan catat stok masuk
            </Text>
          </TouchableOpacity>
        )}

        {/* SECTION 1: METRIK HARI INI (PRD Section 27 - Live Sales & Financial) */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Ionicons name="flash-outline" size={20} color="#D1001F" />
            <Text className="font-heading-semibold text-text text-lg ml-2">
              Kondisi Operasional Hari Ini
            </Text>
          </View>
          <Badge label="Data Aktual" tone="success" />
        </View>

        {loading ? (
          <View className="bg-surface rounded-card p-6 border border-line mb-6">
            <LoadingState label="Memuat ringkasan live..." />
          </View>
        ) : (
          <View
            className={
              isTablet ? "flex-row flex-wrap justify-between mb-6" : "mb-6"
            }
          >
            {/* Card 1: Omzet Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line shadow-sm mb-3.5"
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
                <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center">
                  <Ionicons name="cash-outline" size={16} color="#047857" />
                </View>
              </View>
              <Text className="font-heading-bold text-text text-xl">
                {formatRupiah(todayMetrics.todaySales)}
              </Text>
              <Text className="font-body text-success text-[11px] mt-1">
                {todayMetrics.todayPaidOrderCount} order lunas
              </Text>
              {todayMetrics.todayAwaitingPaymentCount > 0 && (
                <Text className="font-body text-amber-700 text-[11px] mt-0.5">
                  {todayMetrics.todayAwaitingPaymentCount} menunggu pembayaran
                </Text>
              )}
            </View>

            {/* Card 2: Jumlah Order Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line shadow-sm mb-3.5"
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
              <Text className="font-heading-bold text-text text-xl">
                {todayMetrics.todayOrderCount}
              </Text>
              <Text className="font-body text-muted text-[11px] mt-1">
                Total semua pesanan hari ini
              </Text>
            </View>

            {/* Card 3: Produk Terlaris Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line shadow-sm mb-3.5"
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
                <View className="w-8 h-8 rounded-full bg-amber-50 items-center justify-center">
                  <Ionicons name="trophy-outline" size={16} color="#B45309" />
                </View>
              </View>
              <Text
                className="font-heading-bold text-text text-base"
                numberOfLines={1}
              >
                {todayMetrics.topProductToday?.name || "-"}
              </Text>
              <Text className="font-body text-amber-700 text-[11px] mt-1">
                {todayMetrics.topProductToday
                  ? `${todayMetrics.topProductToday.quantity} cup terjual`
                  : "Belum ada pesanan lunas"}
              </Text>
            </View>

            {/* Card 4: Net Result Hari Ini */}
            <View
              className="bg-surface rounded-card p-4 border border-line shadow-sm mb-3.5"
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
                      ? "bg-emerald-50"
                      : "bg-red-50"
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
                      todayMetrics.todayNetResult >= 0 ? "#047857" : "#DC2626"
                    }
                  />
                </View>
              </View>
              <Text
                className={`font-heading-bold text-xl ${
                  todayMetrics.todayNetResult >= 0
                    ? "text-emerald-700"
                    : "text-danger"
                }`}
              >
                {formatRupiah(todayMetrics.todayNetResult)}
              </Text>
              <Text className="font-body text-muted text-[11px] mt-1">
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
            accessibilityLabel="Buka laporan lengkap"
            onPress={() => router.replace("/(admin)/report")}
            className="flex-row items-center min-h-11"
          >
            <Text className="text-primary font-heading-semibold text-xs mr-1">
              Semua Transaksi
            </Text>
            <Ionicons name="arrow-forward" size={12} color="#D1001F" />
          </TouchableOpacity>
        </View>

        <View className="bg-surface rounded-card border border-line p-3 mb-6 shadow-sm divide-y divide-line">
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
                    <Text className="font-heading-bold text-text text-xs mr-2">
                      {ord.order_number}
                    </Text>
                    <Badge
                      label={ord.order_status}
                      tone={getOrderStatusBadgeTone(ord.order_status)}
                    />
                  </View>
                  <Text className="font-body text-muted text-[11px] mt-0.5">
                    {ord.customer_name || "Pelanggan"} •{" "}
                    {formatOrderTime(ord.created_at)} •{" "}
                    {ord.payment_method || "QRIS"}
                  </Text>
                </View>

                <Text className="font-heading-bold text-primary text-sm">
                  {formatRupiah(ord.total_amount)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* SECTION 2b: AKTIVITAS OPERASIONAL PENTING (PRD Section 27) */}
        <RecentActivityCard refreshKey={activityRefreshKey} />

        {/* SECTION 3: MODUL OPERASIONAL KEDAI */}
        <Text className="font-heading-semibold text-text text-lg mb-3">
          Produk & Inventaris
        </Text>

        <View className={isTablet ? "flex-row flex-wrap justify-between" : ""}>
          {/* Card 1: Product Management */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka menu produk"
            onPress={() => router.replace("/(admin)/product")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-3.5"
            style={
              isTablet ? { width: isLandscape ? "31.8%" : "48.5%" } : undefined
            }
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-primary/10 items-center justify-center mr-3.5 border border-primary/20">
                <Ionicons name="cafe-outline" size={24} color="#D1001F" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Katalog Produk
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Kelola menu minuman & makanan, penetapan harga, kategori, dan
                  status ketersediaan.
                </Text>
              </View>
              <Badge
                label={`${masterStats.totalProducts} Item`}
                tone="neutral"
              />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Text className="font-body text-muted text-xs">
                  Tersedia:{" "}
                  <Text className="font-heading-semibold text-success">
                    {masterStats.availableProducts}
                  </Text>{" "}
                  | Tidak Tersedia:{" "}
                  <Text className="font-heading-semibold text-danger">
                    {masterStats.unavailableProducts}
                  </Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Card 2: Category Management */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka kategori menu"
            onPress={() => router.replace("/(admin)/category")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-3.5"
            style={
              isTablet ? { width: isLandscape ? "31.8%" : "48.5%" } : undefined
            }
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-amber-500/10 items-center justify-center mr-3.5 border border-amber-500/20">
                <Ionicons name="pricetags-outline" size={24} color="#B45309" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Kategori Produk
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Pengelompokan menu (Espresso Based, Manual Brew, Tea &
                  Artisanal, dll).
                </Text>
              </View>
              <Badge
                label={`${masterStats.totalCategories} Kategori`}
                tone="warning"
              />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Mencegah penghapusan kategori
              </Text>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Card 3: Raw Material Inventory & Movements */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka bahan baku"
            onPress={() => router.replace("/(admin)/inventory")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-6"
            style={
              isTablet ? { width: isLandscape ? "31.8%" : "100%" } : undefined
            }
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-emerald-500/10 items-center justify-center mr-3.5 border border-emerald-500/20">
                <Ionicons name="cube-outline" size={24} color="#047857" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Inventaris Bahan Baku
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Pencatatan stok fisik, batas minimum, mutasi stok
                  masuk/keluar, dan penyesuaian opname.
                </Text>
              </View>
              <Badge
                label={`${masterStats.totalInventoryItems} Bahan`}
                tone="success"
              />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Text className="font-body text-muted text-xs">
                  Aman:{" "}
                  <Text className="font-heading-semibold text-success">
                    {todayMetrics.safeStockCount}
                  </Text>{" "}
                  | Menipis:{" "}
                  <Text className="font-heading-semibold text-warning">
                    {todayMetrics.lowStockCount}
                  </Text>{" "}
                  | Habis:{" "}
                  <Text className="font-heading-semibold text-danger">
                    {todayMetrics.outOfStockCount}
                  </Text>
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* SECTION 4: KEUANGAN & LAPORAN */}
        <Text className="font-heading-semibold text-text text-lg mb-3">
          Keuangan & Laporan
        </Text>

        <View className={isTablet ? "flex-row justify-between mb-6" : ""}>
          {/* Menu: Expense Management */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka biaya operasional"
            onPress={() => router.replace("/(admin)/expense")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? "mb-0" : "mb-3.5"}`}
            style={isTablet ? { width: "48.5%" } : undefined}
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-primary/10 items-center justify-center mr-3.5 border border-primary/20">
                <Ionicons name="wallet-outline" size={24} color="#D1001F" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Biaya Operasional
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Pencatatan pengeluaran bahan baku, utilitas kedai, dan aset
                  peralatan.
                </Text>
              </View>
              <Badge label="Pengeluaran" tone="accent" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Kategori: Raw Material, Utilitas, Alat
              </Text>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Menu: Sales & Financial Report */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka laporan dan finansial"
            onPress={() => router.replace("/(admin)/report")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? "mb-0" : "mb-6"}`}
            style={isTablet ? { width: "48.5%" } : undefined}
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-emerald-500/10 items-center justify-center mr-3.5 border border-emerald-500/20">
                <Ionicons
                  name="trending-up-outline"
                  size={24}
                  color="#047857"
                />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Laporan & Finansial
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Analisis omzet penjualan, top menu terlaris, dan kalkulasi
                  laba bersih.
                </Text>
              </View>
              <Badge label="Laba Bersih" tone="success" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Net Result = Penjualan - Biaya
              </Text>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* SECTION 5: PENGGUNA & KARYAWAN */}
        <Text className="font-heading-semibold text-text text-lg mb-3">
          Pengguna & Karyawan
        </Text>

        <View className={isTablet ? "flex-row justify-between mb-6" : ""}>
          {/* Menu: Employee Management */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Buka data karyawan"
            onPress={() => router.replace("/(admin)/employee")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? "mb-0" : "mb-3.5"}`}
            style={isTablet ? { width: "48.5%" } : undefined}
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-primary/10 items-center justify-center mr-3.5 border border-primary/20">
                <Ionicons name="people-outline" size={24} color="#D1001F" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Manajemen Karyawan
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Pencatatan staf kedai, jabatan, kontak telepon, dan status
                  aktif.
                </Text>
              </View>
              <Badge
                label={`${masterStats.totalEmployees} Staf`}
                tone="neutral"
              />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Aktif:{" "}
                <Text className="font-heading-semibold text-success">
                  {masterStats.activeEmployees}
                </Text>{" "}
                staf bekerja
              </Text>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>

          {/* Menu: User Account Management */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.replace("/(admin)/user")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? "mb-0" : "mb-6"}`}
            style={isTablet ? { width: "48.5%" } : undefined}
          >
            <View className="flex-row items-start mb-2">
              <View className="w-12 h-12 rounded-card bg-amber-500/10 items-center justify-center mr-3.5 border border-amber-500/20">
                <Ionicons name="key-outline" size={24} color="#B45309" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="font-heading-semibold text-text text-base">
                  Manajemen Akun Pengguna
                </Text>
                <Text className="font-body text-muted text-xs mt-0.5 leading-4">
                  Role otorisasi (Admin, Kasir, Customer), relasi ke staf, dan
                  kontrol akses.
                </Text>
              </View>
              <Badge label={`${masterStats.totalUsers} Akun`} tone="neutral" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Kasir: {masterStats.kasirUsers} | Customer:{" "}
                {masterStats.customerUsers}
              </Text>
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-primary text-xs mr-1">
                  Buka
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#D1001F" />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
