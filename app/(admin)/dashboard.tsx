import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { Badge } from "../../components/Badge";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { LoadingState } from "../../components/States";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "../../hooks/useResponsive";

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  totalUsers: number;
  adminUsers: number;
  kasirUsers: number;
  customerUsers: number;
  // Iterasi 2 Stats
  totalProducts: number;
  availableProducts: number;
  unavailableProducts: number;
  totalCategories: number;
  totalInventoryItems: number;
  safeStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { openSidebar } = useAdminSidebar();
  const { isTablet, isLandscape } = useResponsive();

  const [stats, setStats] = useState<DashboardStats>({
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
    safeStockCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      // 1. Employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, status");
      const empList = employees || [];
      const activeEmp = empList.filter((e) => e.status === "Aktif").length;

      // 2. Users
      const { data: users } = await supabase.from("users").select("id, role");
      const userList = users || [];
      const adminCount = userList.filter((u) => u.role === "Admin").length;
      const kasirCount = userList.filter((u) => u.role === "Kasir").length;
      const customerCount = userList.filter(
        (u) => u.role === "Customer",
      ).length;

      // 3. Categories (active)
      const { data: categories } = await supabase
        .from("categories")
        .select("id, status");
      const catList = categories || [];
      const activeCats = catList.filter((c) => c.status === "Aktif").length;

      // 4. Products (active)
      const { data: products } = await supabase
        .from("products")
        .select("id, is_active, status");
      const prodList = (products || []).filter((p) => p.is_active);
      const availCount = prodList.filter((p) => p.status === "Tersedia").length;
      const unavailCount = prodList.filter(
        (p) => p.status === "Tidak Tersedia",
      ).length;

      // 5. Inventory Items (not deleted)
      const { data: inventory } = await supabase
        .from("inventory_items")
        .select("id, is_deleted, current_stock, min_stock");
      const invList = (inventory || []).filter((i) => !i.is_deleted);
      let safe = 0;
      let low = 0;
      let out = 0;
      invList.forEach((item) => {
        if (Number(item.current_stock) <= 0) {
          out += 1;
        } else if (Number(item.current_stock) <= Number(item.min_stock)) {
          low += 1;
        } else {
          safe += 1;
        }
      });

      setStats({
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
        safeStockCount: safe,
        lowStockCount: low,
        outOfStockCount: out,
      });
    } catch (err: any) {
      console.error("Error fetching dashboard stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
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

        {/* Stock Alert Warning Banner (if any low or out of stock items) */}
        {(stats.lowStockCount > 0 || stats.outOfStockCount > 0) && (
          <TouchableOpacity
            onPress={() => router.push("/(admin)/inventory")}
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
              {stats.outOfStockCount > 0 &&
                `${stats.outOfStockCount} bahan baku HABIS. `}
              {stats.lowStockCount > 0 &&
                `${stats.lowStockCount} bahan baku MENIPIS di bawah batas minimum.`}
            </Text>
            <Text className="font-body-medium text-amber-900 text-xs mt-2 underline">
              Ketuk untuk buka modul inventaris dan catat stok masuk
            </Text>
          </TouchableOpacity>
        )}

        {/* Section: Iterasi 2 - Produk & Inventaris */}
        <Text className="font-heading-semibold text-text text-lg mb-3">
          Produk & Inventaris
        </Text>

        <View className={isTablet ? "flex-row flex-wrap justify-between" : ""}>
          {/* Card 1: Product Management */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push("/(admin)/product")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-3.5"
            style={isTablet ? { width: isLandscape ? "31.8%" : "48.5%" } : undefined}
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
              <Badge label={`${stats.totalProducts} Item`} tone="neutral" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Text className="font-body text-muted text-xs">
                  Tersedia:{" "}
                  <Text className="font-heading-semibold text-success">
                    {stats.availableProducts}
                  </Text>{" "}
                  | Tidak Tersedia:{" "}
                  <Text className="font-heading-semibold text-danger">
                    {stats.unavailableProducts}
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
            onPress={() => router.push("/(admin)/category")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-3.5"
            style={isTablet ? { width: isLandscape ? "31.8%" : "48.5%" } : undefined}
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
              <Badge label={`${stats.totalCategories} Kategori`} tone="warning" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Mencegah penghapusan jika kategori memiliki produk terhubung
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
            onPress={() => router.push("/(admin)/inventory")}
            activeOpacity={0.8}
            className="bg-surface rounded-card p-5 border border-line shadow-sm mb-6"
            style={isTablet ? { width: isLandscape ? "31.8%" : "100%" } : undefined}
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
                  Pencatatan stok fisik, batas minimum, mutasi stok masuk/keluar,
                  dan penyesuaian opname.
                </Text>
              </View>
              <Badge
                label={`${stats.totalInventoryItems} Bahan`}
                tone="success"
              />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <View className="flex-row items-center">
                <Text className="font-body text-muted text-xs">
                  Aman:{" "}
                  <Text className="font-heading-semibold text-success">
                    {stats.safeStockCount}
                  </Text>{" "}
                  | Menipis:{" "}
                  <Text className="font-heading-semibold text-warning">
                    {stats.lowStockCount}
                  </Text>{" "}
                  | Habis:{" "}
                  <Text className="font-heading-semibold text-danger">
                    {stats.outOfStockCount}
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

        {/* Section: Operasional Staf & Akun (Iterasi 1) */}
        <Text className="font-heading-semibold text-text text-lg mb-3">
          Pengguna & Karyawan
        </Text>

        <View className={isTablet ? "flex-row justify-between mb-6" : ""}>
          {/* Menu: Employee Management */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push("/(admin)/employee")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? 'mb-0' : 'mb-3.5'}`}
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
              <Badge label={`${stats.totalEmployees} Staf`} tone="neutral" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Aktif:{" "}
                <Text className="font-heading-semibold text-success">
                  {stats.activeEmployees}
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
            onPress={() => router.push("/(admin)/user")}
            activeOpacity={0.8}
            className={`bg-surface rounded-card p-5 border border-line shadow-sm ${isTablet ? 'mb-0' : 'mb-6'}`}
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
              <Badge label={`${stats.totalUsers} Akun`} tone="neutral" />
            </View>

            <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
              <Text className="font-body text-muted text-xs">
                Kasir: {stats.kasirUsers} | Customer: {stats.customerUsers}
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

        {/* Real-time Metric Overview Card */}
        <View className="bg-surface rounded-card p-5 border border-line shadow-sm">
          <View className="flex-row items-center mb-3">
            <Ionicons name="stats-chart-outline" size={18} color="#1F2937" />
            <Text className="font-heading-semibold text-text text-base ml-2">
              Ringkasan Operasional
            </Text>
          </View>

          {loading ? (
            <LoadingState label="Mengambil ringkasan..." />
          ) : (
            <View className={isTablet ? "flex-row gap-3" : "gap-3"}>
              {isTablet ? (
                <>
                  <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                    <Text className="font-body text-muted text-xs">
                      Produk Menu
                    </Text>
                    <Text className="font-heading text-primary text-2xl mt-1">
                      {stats.totalProducts}
                    </Text>
                    <Text className="font-body text-success text-xs mt-1">
                      {stats.availableProducts} tersedia
                    </Text>
                  </View>

                  <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                    <Text className="font-body text-muted text-xs">
                      Bahan Baku
                    </Text>
                    <Text className="font-heading text-text text-2xl mt-1">
                      {stats.totalInventoryItems}
                    </Text>
                    <Text className="font-body text-muted text-xs mt-1">
                      {stats.lowStockCount + stats.outOfStockCount > 0 ? (
                        <Text className="text-warning font-body-medium">
                          {stats.lowStockCount + stats.outOfStockCount} perlu restock
                        </Text>
                      ) : (
                        <Text className="text-success font-body-medium">
                          Semua stok aman
                        </Text>
                      )}
                    </Text>
                  </View>

                  <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                    <Text className="font-body text-muted text-xs">
                      Total Staf
                    </Text>
                    <Text className="font-heading text-primary text-2xl mt-1">
                      {stats.totalEmployees}
                    </Text>
                    <Text className="font-body text-success text-xs mt-0.5">
                      {stats.activeEmployees} aktif
                    </Text>
                  </View>

                  <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                    <Text className="font-body text-muted text-xs">
                      Total Akun
                    </Text>
                    <Text className="font-heading text-text text-2xl mt-1">
                      {stats.totalUsers}
                    </Text>
                    <Text className="font-body text-muted text-xs mt-0.5">
                      {stats.kasirUsers} kasir
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View className="flex-row gap-3">
                    <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                      <Text className="font-body text-muted text-xs">
                        Produk Menu
                      </Text>
                      <Text className="font-heading text-primary text-2xl mt-1">
                        {stats.totalProducts}
                      </Text>
                      <Text className="font-body text-success text-xs mt-1">
                        {stats.availableProducts} tersedia
                      </Text>
                    </View>

                    <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                      <Text className="font-body text-muted text-xs">
                        Bahan Baku
                      </Text>
                      <Text className="font-heading text-text text-2xl mt-1">
                        {stats.totalInventoryItems}
                      </Text>
                      <Text className="font-body text-muted text-xs mt-1">
                        {stats.lowStockCount + stats.outOfStockCount > 0 ? (
                          <Text className="text-warning font-body-medium">
                            {stats.lowStockCount + stats.outOfStockCount} perlu
                            restock
                          </Text>
                        ) : (
                          <Text className="text-success font-body-medium">
                            Semua stok aman
                          </Text>
                        )}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-3">
                    <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                      <Text className="font-body text-muted text-xs">
                        Total Staf
                      </Text>
                      <Text className="font-heading text-primary text-xl mt-1">
                        {stats.totalEmployees}
                      </Text>
                      <Text className="font-body text-success text-xs mt-0.5">
                        {stats.activeEmployees} aktif
                      </Text>
                    </View>

                    <View className="flex-1 bg-background rounded-chip p-3.5 border border-line">
                      <Text className="font-body text-muted text-xs">
                        Total Akun
                      </Text>
                      <Text className="font-heading text-text text-xl mt-1">
                        {stats.totalUsers}
                      </Text>
                      <Text className="font-body text-muted text-xs mt-0.5">
                        {stats.kasirUsers} kasir
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
