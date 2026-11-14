import React from 'react';
import { ProfileScreen } from '../../components/ProfileScreen';
import { useAdminSidebar } from '../../components/SidebarDrawer';

export default function AdminProfileScreen() {
  const { openSidebar } = useAdminSidebar();
  return <ProfileScreen onOpenSidebar={openSidebar} />;
}
