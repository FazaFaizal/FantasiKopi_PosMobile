import React from 'react';
import { ProfileScreen } from '../../components/ProfileScreen';
import { useKasirSidebar } from '../../components/SidebarDrawer';

export default function KasirProfileScreen() {
  const { openSidebar } = useKasirSidebar();
  return <ProfileScreen onOpenSidebar={openSidebar} />;
}
