import React, { useState } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import {
  SidebarDrawer,
  KasirSidebarContext,
  KASIR_NAV_ITEMS,
} from "../../components/SidebarDrawer";
import { useAuth } from "../../lib/AuthContext";

export default function KasirLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <KasirSidebarContext.Provider
      value={{
        openSidebar: () => setSidebarOpen(true),
        closeSidebar: () => setSidebarOpen(false),
      }}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" }, // Menghilangkan floating navbar agar tidak bentrok dengan pembayaran
        }}
      >
        <Tabs.Screen
          name="pos"
          options={{
            title: "Terminal POS",
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Bahan Baku",
          }}
        />
      </Tabs>

      <SidebarDrawer
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        activeRoute={pathname}
        navItems={KASIR_NAV_ITEMS}
        onLogout={signOut}
        onNavigate={(route) => {
          setSidebarOpen(false);
          router.push(route as never);
        }}
      />
    </KasirSidebarContext.Provider>
  );
}
