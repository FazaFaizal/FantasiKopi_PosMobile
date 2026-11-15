import React, { useState } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { FloatingTabBar } from "../../components/FloatingNavbar";
import { SidebarDrawer, AdminSidebarContext } from "../../components/SidebarDrawer";
import { useAuth } from "../../lib/AuthContext";
import { IncomingOrderBanner } from "../../components/IncomingOrderBanner";
import { useAwaitingCustomerOrders } from "../../hooks/useAwaitingCustomerOrders";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Pesanan customer yang menunggu dibayar: banner realtime + badge menu Pesanan.
  const awaiting = useAwaitingCustomerOrders(!!user);

  return (
    <AdminSidebarContext.Provider
      value={{
        openSidebar: () => setSidebarOpen(true),
        closeSidebar: () => setSidebarOpen(false),
      }}
    >
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="product"
          options={{
            title: "Produk",
            tabBarIcon: ({ color, size }) => <Ionicons name="cafe-outline" size={size} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Bahan Baku",
            tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="category"
          options={{
            title: "Kategori",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="employee"
          options={{
            title: "Karyawan",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="user"
          options={{
            title: "Akun User",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Pesanan",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profil Saya",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="cash"
          options={{
            title: "Kas Harian",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="expense"
          options={{
            title: "Biaya Operasional",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="report"
          options={{
            title: "Laporan & Finansial",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          }}
        />
      </Tabs>

      <SidebarDrawer
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        activeRoute={pathname}
        badges={{ orders: awaiting.count }}
        onLogout={signOut}
        onNavigate={(route) => {
          setSidebarOpen(false);
          router.replace(route as never);
        }}
      />

      <IncomingOrderBanner
        order={awaiting.latest}
        onDismiss={awaiting.dismissLatest}
        onOpen={() => router.replace("/(admin)/orders" as never)}
      />
    </AdminSidebarContext.Provider>
  );
}

