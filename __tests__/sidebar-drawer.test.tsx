import React from 'react';
// @ts-expect-error react-dom types not installed in React Native/Expo project
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarDrawer, SIDEBAR_NAV_ITEMS } from '../components/SidebarDrawer';
import { ScreenHeader } from '../components/ScreenHeader';

describe('SidebarDrawer Component (TDD)', () => {
  const mockUser = {
    id: 'user-123',
    email: 'admin@fantasicoffee.com',
    role: 'Admin' as const,
    status: 'Aktif' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    employee_id: null,
  };

  it('defines structured sidebar navigation items separated into main and management sections', () => {
    expect(SIDEBAR_NAV_ITEMS.main).toBeDefined();
    expect(SIDEBAR_NAV_ITEMS.management).toBeDefined();

    const mainRoutes = SIDEBAR_NAV_ITEMS.main.map((item) => item.route);
    expect(mainRoutes).toContain('/(admin)/dashboard');
    expect(mainRoutes).toContain('/(admin)/product');
    expect(mainRoutes).toContain('/(admin)/inventory');

    const mgmtRoutes = SIDEBAR_NAV_ITEMS.management.map((item) => item.route);
    expect(mgmtRoutes).toContain('/(admin)/category');
    expect(mgmtRoutes).toContain('/(admin)/employee');
    expect(mgmtRoutes).toContain('/(admin)/user');
  });

  it('renders brand title and user info in drawer header when open', () => {
    const html = renderToStaticMarkup(
      <SidebarDrawer
        isOpen={true}
        onClose={jest.fn()}
        user={mockUser}
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    expect(html).toContain('Fantasi Coffee');
    expect(html).toContain('admin@fantasicoffee.com');
    expect(html).toContain('Admin');
  });

  it('renders navigation links for both main and management items', () => {
    const html = renderToStaticMarkup(
      <SidebarDrawer
        isOpen={true}
        onClose={jest.fn()}
        user={mockUser}
        activeRoute="/(admin)/dashboard"
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    expect(html).toContain('Dashboard');
    expect(html).toContain('Katalog Produk');
    expect(html).toContain('Bahan Baku &amp; Stok');
    expect(html).toContain('Kategori Menu');
    expect(html).toContain('Kelola Karyawan');
    expect(html).toContain('Akun Pengguna');
  });

  it('renders a dedicated Keluar (Logout) button in drawer footer', () => {
    const html = renderToStaticMarkup(
      <SidebarDrawer
        isOpen={true}
        onClose={jest.fn()}
        user={mockUser}
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    expect(html).toContain('Keluar dari Akun');
  });

  it('renders tablet orientation controls in drawer footer', () => {
    const html = renderToStaticMarkup(
      <SidebarDrawer
        isOpen={true}
        onClose={jest.fn()}
        user={mockUser}
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    expect(html).toContain('Orientasi Layar');
    expect(html).toContain('Otomatis');
    expect(html).toContain('Lanskap');
    expect(html).toContain('Potret');
  });

  it('does not render content when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <SidebarDrawer
        isOpen={false}
        onClose={jest.fn()}
        user={mockUser}
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
      />
    );

    expect(html).not.toContain('Fantasi Coffee');
  });
});

describe('ScreenHeader with Sidebar support (TDD)', () => {
  it('renders menu hamburger button when onOpenSidebar is provided', () => {
    const html = renderToStaticMarkup(
      <ScreenHeader
        title="Dashboard Admin"
        subtitle="Pusat Kendali"
        onOpenSidebar={jest.fn()}
      />
    );

    expect(html).toContain('menu-outline');
    expect(html).toContain('Dashboard Admin');
  });

  it('renders title inline alongside the hamburger button in the same header row', () => {
    const html = renderToStaticMarkup(
      <ScreenHeader
        title="Katalog Produk"
        subtitle="Kelola Menu"
        onOpenSidebar={jest.fn()}
      />
    );

    expect(html).toContain('Katalog Produk');
    expect(html).toContain('Kelola Menu');
    expect(html).toContain('menu-outline');
  });

  it('does not render menu button when onOpenSidebar is not provided', () => {
    const html = renderToStaticMarkup(
      <ScreenHeader
        title="Dashboard Admin"
        subtitle="Pusat Kendali"
      />
    );

    expect(html).not.toContain('menu-outline');
    expect(html).toContain('Dashboard Admin');
  });
});

