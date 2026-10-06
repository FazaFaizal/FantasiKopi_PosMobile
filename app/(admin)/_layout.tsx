import React, { useState } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import Coffee from "lucide-react-native/icons/coffee";
import Package from "lucide-react-native/icons/package";
import { FloatingTabBar } from "../../components/FloatingNavbar";
import { SidebarDrawer, AdminSidebarContext } from "../../components/SidebarDrawer";
import { useAuth } from "../../lib/AuthContext";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
            tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="product"
          options={{
            title: "Produk",
            tabBarIcon: ({ color, size }) => <Coffee size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Bahan Baku",
            tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="category"
          options={{
            href: null,
            title: "Kategori",
          }}
        />
        <Tabs.Screen
          name="employee"
          options={{
            href: null,
            title: "Karyawan",
          }}
        />
        <Tabs.Screen
          name="user"
          options={{
            href: null,
            title: "Akun User",
          }}
        />
      </Tabs>

      <SidebarDrawer
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        activeRoute={pathname}
        onLogout={signOut}
        onNavigate={(route) => {
          setSidebarOpen(false);
          router.push(route as never);
        }}
      />
    </AdminSidebarContext.Provider>
  );
}

