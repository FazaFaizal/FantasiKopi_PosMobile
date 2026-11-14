import React from 'react';
import { DailyCashScreen } from '../../components/DailyCashScreen';
import { useKasirSidebar } from '../../components/SidebarDrawer';

export default function KasirCashScreen() {
  const { openSidebar } = useKasirSidebar();
  return <DailyCashScreen onOpenSidebar={openSidebar} />;
}
