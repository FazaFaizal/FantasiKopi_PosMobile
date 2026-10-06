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
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import Coffee from "lucide-react-native/icons/coffee";
import Package from "lucide-react-native/icons/package";
import Layers from "lucide-react-native/icons/layers";
import Users from "lucide-react-native/icons/users";
import UserCheck from "lucide-react-native/icons/user-check";
import LogOut from "lucide-react-native/icons/log-out";
import X from "lucide-react-native/icons/x";
import Store from "lucide-react-native/icons/store";
import type { LucideIcon } from "lucide-react-native";
import { useResponsive } from "../hooks/useResponsive";

export interface SidebarNavItem {
  id: string;
  route: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
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
      icon: LayoutDashboard,
    },
    {
      id: "product",
      route: "/(admin)/product",
      title: "Katalog Produk",
      subtitle: "Manajemen Menu & Harga Minuman",
      icon: Coffee,
    },
    {
      id: "inventory",
      route: "/(admin)/inventory",
      title: "Bahan Baku & Stok",
      subtitle: "Inventaris Gudang & Peringatan Stok",
      icon: Package,
    },
  ],
  management: [
    {
      id: "category",
      route: "/(admin)/category",
      title: "Kategori Menu",
      subtitle: "Master Kategori Minuman & Makanan",
      icon: Layers,
    },
    {
      id: "employee",
      route: "/(admin)/employee",
      title: "Kelola Karyawan",
      subtitle: "Data Staf, Posisi & Status Kerja",
      icon: Users,
    },
    {
      id: "user",
      route: "/(admin)/user",
      title: "Akun Pengguna",
      subtitle: "Manajemen Login & Hak Akses",
      icon: UserCheck,
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

export function SidebarDrawer({
  isOpen,
  onClose,
  user,
  onLogout,
  activeRoute = "/(admin)/dashboard",
  onNavigate,
}: SidebarDrawerProps) {
  const insets = useSafeAreaInsets();
  const { isTablet, orientationMode, setOrientationMode } = useResponsive();

  if (!isOpen) {
    return null;
  }

  const handleLogoutPress = () => {
    Alert.alert(
      "Konfirmasi Keluar",
      "Apakah Anda yakin ingin keluar dari sesi Admin kedai kopi ini?",
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
    onNavigate?.(route);
  };

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "A";

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
          className="bg-surface h-full flex-col justify-between shadow-2xl"
        >
          {/* Header Section */}
          <View className="px-5 pb-4 border-b border-line">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-primary items-center justify-center mr-2.5">
                  <Store size={20} color="#FFFFFF" />
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
                <X size={18} color="#6B7280" />
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
                  {user?.email || "admin@fantasicoffee.com"}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <View className="w-2 h-2 rounded-full bg-success mr-1.5" />
                  <Text className="font-body-medium text-primary text-xs">
                    {user?.role || "Admin"} • Cabang Utama
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Navigation Items (Scrollable) */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1 px-4 py-3"
          >
            {/* Main Operations Section */}
            <Text className="font-body-semibold text-muted text-xs uppercase tracking-wider px-2 mb-2">
              Fitur Operasional Utama
            </Text>
            {SIDEBAR_NAV_ITEMS.main.map((item) => {
              const isActive = activeRoute.startsWith(item.route);
              const Icon = item.icon;

              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => handleItemPress(item.route)}
                  className={`flex-row items-center px-3.5 py-3 rounded-card mb-1.5 border transition-all ${
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
                    <Icon size={18} color={isActive ? "#FFFFFF" : "#4B5563"} />
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
                </TouchableOpacity>
              );
            })}

            {/* Management & Master Section */}
            <Text className="font-body-semibold text-muted text-xs uppercase tracking-wider px-2 mt-4 mb-2">
              Administrasi &amp; Master Data
            </Text>
            {SIDEBAR_NAV_ITEMS.management.map((item) => {
              const isActive = activeRoute.startsWith(item.route);
              const Icon = item.icon;

              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => handleItemPress(item.route)}
                  className={`flex-row items-center px-3.5 py-3 rounded-card mb-1.5 border transition-all ${
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
                    <Icon size={18} color={isActive ? "#FFFFFF" : "#4B5563"} />
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
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Footer Section with Orientation & Logout */}
          <View className="px-5 pt-3 border-t border-line">
            {/* Orientasi Layar (Tablet POS) */}
            <View className="mb-3">
              <Text className="font-body-semibold text-muted text-xs uppercase tracking-wider mb-1.5">
                Orientasi Layar
              </Text>
              <View className="flex-row bg-background rounded-chip p-1 border border-line">
                {(['auto', 'landscape', 'portrait'] as const).map((mode) => {
                  const isSelected = orientationMode === mode;
                  const label =
                    mode === 'auto' ? 'Otomatis' : mode === 'landscape' ? 'Lanskap' : 'Potret';
                  return (
                    <TouchableOpacity
                      key={mode}
                      accessibilityRole="button"
                      accessibilityLabel={`Orientasi ${label}`}
                      onPress={() => setOrientationMode(mode)}
                      className={`flex-1 py-1.5 rounded-chip items-center justify-center ${
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
              accessibilityLabel="Keluar dari akun admin"
              onPress={handleLogoutPress}
              className="flex-row items-center justify-center bg-danger-soft border border-line py-3 px-4 rounded-button min-h-12"
            >
              <LogOut size={18} color="#991B1B" />
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
