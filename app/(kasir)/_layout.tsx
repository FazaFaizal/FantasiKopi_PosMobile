import React, { useState } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import {
  SidebarDrawer,
  KasirSidebarContext,
  KASIR_NAV_ITEMS,
} from "../../components/SidebarDrawer";
import { useAuth } from "../../lib/AuthContext";
import { IncomingOrderBanner } from "../../components/IncomingOrderBanner";
import { useAwaitingCustomerOrders } from "../../hooks/useAwaitingCustomerOrders";

export default function KasirLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Pesanan customer yang menunggu dibayar: banner realtime + badge menu Riwayat Pesanan.
  const awaiting = useAwaitingCustomerOrders(!!user);

  const openOrder = (orderId?: string) => {
    router.replace(
      (orderId
        ? { pathname: "/(kasir)/orders", params: { openOrderId: orderId } }
        : "/(kasir)/orders") as never
    );
  };

  return (
    <KasirSidebarContext.Provider
      value={{
        openSidebar: () => setSidebarOpen(true),
        closeSidebar: () => setSidebarOpen(false),
        incoming: awaiting.incoming,
        openOrder,
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
          name="orders"
          options={{
            title: "Riwayat Transaksi",
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Bahan Baku",
          }}
        />
        <Tabs.Screen
          name="cash"
          options={{
            title: "Kas Harian",
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profil Saya",
          }}
        />
      </Tabs>

      <SidebarDrawer
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        activeRoute={pathname}
        navItems={KASIR_NAV_ITEMS}
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
        onOpen={() => openOrder(awaiting.latest?.id)}
      />
    </KasirSidebarContext.Provider>
  );
}
