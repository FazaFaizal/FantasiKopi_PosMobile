import React from 'react';
import { OrdersScreen } from '../../components/OrdersScreen';
import { useKasirSidebar } from '../../components/SidebarDrawer';

export default function KasirOrdersScreen() {
  const { openSidebar } = useKasirSidebar();
  return <OrdersScreen onOpenSidebar={openSidebar} />;
}
