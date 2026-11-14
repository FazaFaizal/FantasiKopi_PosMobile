import React from 'react';
import { DailyCashScreen } from '../../components/DailyCashScreen';
import { useAdminSidebar } from '../../components/SidebarDrawer';

export default function AdminCashScreen() {
  const { openSidebar } = useAdminSidebar();
  return <DailyCashScreen onOpenSidebar={openSidebar} />;
}
