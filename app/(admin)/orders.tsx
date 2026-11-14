import React from 'react';
import { OrdersScreen } from '../../components/OrdersScreen';
import { useAdminSidebar } from '../../components/SidebarDrawer';

export default function AdminOrdersScreen() {
  const { openSidebar } = useAdminSidebar();
  return <OrdersScreen onOpenSidebar={openSidebar} />;
}
