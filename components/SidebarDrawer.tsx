import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { IncomingOrderRow } from "../lib/incoming-orders-logic";
import { useResponsive } from "../hooks/useResponsive";
import { isRouteActive } from "../lib/navigation-logic";

export interface SidebarNavItem {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SIDEBAR_NAV_ITEMS: {
  main: SidebarNavItem[];
  management: SidebarNavItem[];
} = {
  main: [
    {
      id: "dashboard",
      route: "/(admin)/dashboard",
      title: "Dashboard",
      subtitle: "Ringkasan Operasional & Grafik",
      icon: "grid-outline",
    },
    {
      id: "orders",
      route: "/(admin)/orders",
      title: "Pesanan",
      subtitle: "Semua Order, Pembatalan & Koreksi Pembayaran",
      icon: "clipboard-outline",
    },
    {
      id: "product",
      route: "/(admin)/product",
      title: "Katalog Produk",
      subtitle: "Manajemen Menu & Harga Minuman",
      icon: "cafe-outline",
    },
    {
      id: "inventory",
      route: "/(admin)/inventory",
      title: "Bahan Baku & Stok",
      subtitle: "Inventaris Gudang & Peringatan Stok",
      icon: "cube-outline",
    },
    {
      id: "cash",
      route: "/(admin)/cash",
      title: "Kas Harian",
      subtitle: "Rekap Uang Laci & Pengeluaran Hari Ini",
      icon: "cash-outline",
    },
    {
      id: "expense",
      route: "/(admin)/expense",
      title: "Biaya Operasional",
      subtitle: "Pencatatan & Alokasi Pengeluaran",
      icon: "wallet-outline",
    },
    {
      id: "report",
      route: "/(admin)/report",
      title: "Laporan & Finansial",
      subtitle: "Analisis Penjualan & Laba Bersih",
      icon: "trending-up-outline",
    },
  ],
  management: [
    {
      id: "profile",
      route: "/(admin)/profile",
      title: "Profil Saya",
      subtitle: "Akun & Ganti Password",
      icon: "person-circle-outline",
    },
    {
      id: "category",
      route: "/(admin)/category",
      title: "Kategori Menu",
      subtitle: "Master Kategori Minuman & Makanan",
      icon: "layers-outline",
    },
    {
      id: "employee",
      route: "/(admin)/employee",
      title: "Kelola Karyawan",
      subtitle: "Data Staf, Posisi & Status Kerja",
      icon: "people-outline",
    },
    {
      id: "user",
      route: "/(admin)/user",
      title: "Akun Pengguna",
      subtitle: "Manajemen Login & Hak Akses",
      icon: "key-outline",
    },
  ],
};

export const KASIR_NAV_ITEMS: {
  main: SidebarNavItem[];
  management?: SidebarNavItem[];
} = {
  main: [
    {
      id: "pos",
      route: "/(kasir)/pos",
      title: "Terminal POS",
      subtitle: "Katalog Menu & Transaksi Kasir",
      icon: "storefront-outline",
    },
    {
      id: "orders",
      route: "/(kasir)/orders",
      title: "Riwayat Transaksi",
      subtitle: "Status Pesanan & Pembatalan",
      icon: "receipt-outline",
    },
    {
      id: "inventory",
      route: "/(kasir)/inventory",
      title: "Bahan Baku & Stok",
      subtitle: "Inventaris Gudang & Mutasi Bahan",
      icon: "cube-outline",
    },
    {
      id: "cash",
      route: "/(kasir)/cash",
      title: "Kas Harian",
      subtitle: "Rekap Uang Laci & Pengeluaran Harian",
      icon: "cash-outline",
    },
    {
      id: "profile",
      route: "/(kasir)/profile",
      title: "Profil Saya",
      subtitle: "Akun & Ganti Password",
      icon: "person-circle-outline",
    },
  ],
};

export interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: {
    email?: string;
    role?: string;
  } | null;
  onLogout: () => void;
  activeRoute?: string;
  onNavigate?: (route: string) => void;
  navItems?: {
    main: SidebarNavItem[];
    management?: SidebarNavItem[];
  };
  /** Angka kecil di samping menu, mis. { orders: 2 } = 2 pesanan menunggu pembayaran. */
  badges?: Record<string, number>;
}

export const AdminSidebarContext = React.createContext<{
  openSidebar: () => void;
  closeSidebar: () => void;
}>({
  openSidebar: () => {},
  closeSidebar: () => {},
});

export function useAdminSidebar() {
  return React.useContext(AdminSidebarContext);
}

export const KasirSidebarContext = React.createContext<{
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Pesanan customer yang perlu ditindaklanjuti kasir (panel notifikasi POS). */
  incoming: IncomingOrderRow[];
  /** Buka Riwayat Transaksi lalu tampilkan detail pesanan tersebut. */
  openOrder: (orderId: string) => void;
}>({
  openSidebar: () => {},
  closeSidebar: () => {},
  incoming: [],
  openOrder: () => {},
});

export function useKasirSidebar() {
  return React.useContext(KasirSidebarContext);
}

export function SidebarDrawer({
  isOpen,
  onClose,
  user,
  onLogout,
  activeRoute = "/(admin)/dashboard",
  onNavigate,
  navItems = SIDEBAR_NAV_ITEMS,
  badges,
}: SidebarDrawerProps) {
  const insets = useSafeAreaInsets();
  const { isTablet, orientationMode, setOrientationMode } = useResponsive();

  if (!isOpen) {
    return null;
  }

  const handleLogoutPress = () => {
    Alert.alert(
      "Konfirmasi Keluar",
      "Apakah Anda yakin ingin keluar dari akun ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Keluar",
          style: "destructive",
          onPress: () => {
            onClose();
            onLogout();
          },
        },
      ]
    );
  };

  const handleItemPress = (route: string) => {
    onClose();
    // Beri sedikit jeda mikro agar penutupan modal native selesai sebelum transisi rute diproses
    setTimeout(() => {
      onNavigate?.(route);
    }, 50);
  };

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "-";

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 flex-row bg-black/60">
        {/* Drawer Body Panel */}
        <View
          style={{
            paddingTop: Math.max(insets.top + 10, 24),
            paddingBottom: Math.max(insets.bottom, 16),
            width: isTablet ? "50%" : "82%",
            maxWidth: isTablet ? 380 : 340,
          }}
          className="bg-surface h-full flex-col justify-between shadow-xl"
        >
          {/* Header Section */}
          <View className="px-5 pb-4 border-b border-line">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-primary items-center justify-center mr-2.5">
                  <Ionicons name="storefront-outline" size={20} color="#FFFFFF" />
                </View>
                <View>
                  <Text className="font-heading text-text text-base leading-tight">
                    Fantasi Coffee
                  </Text>
                  <Text className="font-body text-muted text-xs">
                    Point of Sale &amp; Retail
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Tutup navigasi sidebar"
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="w-8 h-8 rounded-full bg-background items-center justify-center border border-line"
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* User Profile Card */}
            <View className="bg-background rounded-card p-3 border border-line flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 items-center justify-center mr-3">
                <Text className="font-heading text-primary text-base">
                  {userInitial}
                </Text>
              </View>
              <View className="flex-1 mr-1">
                <Text
                  className="font-heading-semibold text-text text-sm"
                  numberOfLines={1}
                >
                  {user?.email || "-"}
                </Text>
                {user?.role ? (
                  <Text className="font-body-medium text-primary text-xs mt-0.5">{user.role}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Navigation Items (Scrollable) */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1 px-4 py-3"
          >
            {/* Main Operations Section */}
            <Text className="font-body-semibold text-muted text-xs px-2 mb-2">
              Fitur utama
            </Text>
            {navItems.main.map((item) => {
              const isActive = isRouteActive(activeRoute, item.route);

              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => handleItemPress(item.route)}
                  className={`flex-row items-center px-3.5 py-3 rounded-card mb-1.5 border ${
                    isActive
                      ? "bg-primary/10 border-primary/30"
                      : "bg-surface border-transparent"
                  }`}
                >
                  <View
                    className={`w-9 h-9 rounded-chip items-center justify-center mr-3 ${
                      isActive ? "bg-primary" : "bg-background border border-line"
                    }`}
                  >
                    <Ionicons name={item.icon} size={18} color={isActive ? "#FFFFFF" : "#4B5563"} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-heading-semibold text-sm ${
                        isActive ? "text-primary" : "text-text"
                      }`}
                    >
                      {item.title}
                    </Text>
                    <Text
                      className="font-body text-muted text-xs mt-0.5"
                      numberOfLines={1}
                    >
                      {item.subtitle}
                    </Text>
                  </View>
                  <NavBadge count={badges?.[item.id]} />
                </TouchableOpacity>
              );
            })}

            {/* Management & Master Section (Hanya jika ada) */}
            {navItems.management && navItems.management.length > 0 && (
              <>
                <Text className="font-body-semibold text-muted text-xs px-2 mt-4 mb-2">
                  Administrasi & data master
                </Text>
                {navItems.management.map((item) => {
                  const isActive = isRouteActive(activeRoute, item.route);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => handleItemPress(item.route)}
                      className={`flex-row items-center px-3.5 py-3 rounded-card mb-1.5 border ${
                        isActive
                          ? "bg-primary/10 border-primary/30"
                          : "bg-surface border-transparent"
                      }`}
                    >
                      <View
                        className={`w-9 h-9 rounded-chip items-center justify-center mr-3 ${
                          isActive ? "bg-primary" : "bg-background border border-line"
                        }`}
                      >
                        <Ionicons name={item.icon} size={18} color={isActive ? "#FFFFFF" : "#4B5563"} />
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`font-heading-semibold text-sm ${
                            isActive ? "text-primary" : "text-text"
                          }`}
                        >
                          {item.title}
                        </Text>
                        <Text
                          className="font-body text-muted text-xs mt-0.5"
                          numberOfLines={1}
                        >
                          {item.subtitle}
                        </Text>
                      </View>
                      <NavBadge count={badges?.[item.id]} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* Footer Section with Orientation & Logout */}
          <View className="px-5 pt-3 border-t border-line">
            {/* Orientasi Layar (Tablet POS) */}
            <View className="mb-3">
              <Text className="font-body-semibold text-muted text-xs mb-1.5">
                Orientasi layar
              </Text>
              <View className="flex-row bg-background rounded-chip p-1 border border-line">
                {(['auto', 'landscape', 'portrait'] as const).map((mode) => {
                  const isSelected = orientationMode === mode;
                  const label =
                    mode === 'auto' ? 'Otomatis' : mode === 'landscape' ? 'Lanskap' : 'Potret';
                  return (
                    <TouchableOpacity
                      key={mode}
                      accessibilityRole="radio"
                      accessibilityLabel={`Orientasi ${label}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setOrientationMode(mode)}
                      className={`flex-1 min-h-11 rounded-chip items-center justify-center ${
                        isSelected ? 'bg-primary' : 'bg-transparent'
                      }`}
                    >
                      <Text
                        className={`font-body-medium text-xs ${
                          isSelected ? 'text-white' : 'text-text'
                        }`}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Keluar dari akun"
              onPress={handleLogoutPress}
              className="flex-row items-center justify-center bg-danger-soft border border-line py-3 px-4 rounded-button min-h-12"
            >
              <Ionicons name="log-out-outline" size={18} color="#991B1B" />
              <Text className="font-heading-semibold text-danger ml-2 text-sm">
                Keluar dari Akun
              </Text>
            </TouchableOpacity>

            <View className="flex-row justify-between items-center mt-3">
              <Text className="font-body text-muted text-xs">
                Fantasi Coffee POS
              </Text>
              <Text className="font-body text-muted text-xs">
                Versi 1.0.0
              </Text>
            </View>
          </View>
        </View>

        {/* Backdrop Touchable Area to Close */}
        <TouchableOpacity
          accessibilityLabel="Tutup sidebar"
          accessibilityRole="button"
          onPress={onClose}
          className="flex-1 h-full"
          activeOpacity={1}
        />
      </View>
    </Modal>
  );
}

function NavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <View
      accessibilityLabel={`${count} menunggu`}
      className="min-w-6 h-6 px-1.5 rounded-full bg-primary items-center justify-center ml-2"
    >
      <Text className="font-heading text-white text-xs">{count > 99 ? '99+' : count}</Text>
    </View>
  );
}
