import React from 'react';
// @ts-expect-error react-dom types not installed in React Native/Expo project
import { renderToStaticMarkup } from 'react-dom/server';
import FloatingNavbar, { FloatingTabBar, TabItem, getFloatingTabScreenOptions, FloatingTabIcon } from '../components/FloatingNavbar';
import House from 'lucide-react-native/icons/house';
import Coffee from 'lucide-react-native/icons/coffee';
import Layers from 'lucide-react-native/icons/layers';
import Package from 'lucide-react-native/icons/package';
import Users from 'lucide-react-native/icons/users';

const Home = House;

describe('FloatingNavbar Component (TDD)', () => {
  it('renders the floating navbar container matching app palette (surface white & line border)', () => {
    const html = renderToStaticMarkup(<FloatingNavbar />);
    expect(html).toContain('bg-surface');
    expect(html).toContain('rounded-full');
    expect(html).toContain('border-line');
  });

  it('renders default active tab with primary brand color pill (bg-primary)', () => {
    const html = renderToStaticMarkup(<FloatingNavbar activeTab="home" />);
    expect(html).toContain('bg-primary');
  });

  it('renders custom tabs provided as props with app palette', () => {
    const customTabs: TabItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'product', label: 'Produk', icon: Coffee },
      { id: 'category', label: 'Kategori', icon: Layers },
      { id: 'inventory', label: 'Bahan Baku', icon: Package },
      { id: 'employee', label: 'Karyawan', icon: Users },
    ];

    const html = renderToStaticMarkup(
      <FloatingNavbar tabs={customTabs} activeTab="product" />
    );
    expect(html).toContain('bg-surface');
    expect(html).toContain('bg-primary');
  });

  it('supports coffee-dark variant for dark coffee theme', () => {
    const html = renderToStaticMarkup(<FloatingNavbar variant="coffee-dark" />);
    expect(html).toContain('bg-[#1E1113]');
    expect(html).toContain('bg-primary');
  });

  it('renders FloatingTabBar for navigation integration', () => {
    const mockNavigate = jest.fn();
    const navigation = {
      navigate: mockNavigate,
      emit: jest.fn(() => ({ defaultPrevented: false })),
    };
    const state = {
      index: 1,
      routes: [
        { key: 'dashboard-key', name: 'dashboard' },
        { key: 'product-key', name: 'product' },
        { key: 'category-key', name: 'category' },
      ],
    };
    const descriptors = {
      'dashboard-key': { options: { title: 'Dashboard' } },
      'product-key': { options: { title: 'Produk' } },
      'category-key': { options: { title: 'Kategori' } },
    };

    const html = renderToStaticMarkup(
      <FloatingTabBar {...({ state, navigation, descriptors } as any)} />
    );
    expect(html).toContain('bg-surface');
    expect(html).toContain('bg-primary');
  });

  it('filters out routes with href: null in FloatingTabBar', () => {
    const mockNavigate = jest.fn();
    const navigation = {
      navigate: mockNavigate,
      emit: jest.fn(() => ({ defaultPrevented: false })),
    };
    const state = {
      index: 0,
      routes: [
        { key: 'dashboard-key', name: 'dashboard' },
        { key: 'hidden-key', name: 'user' },
      ],
    };
    const descriptors = {
      'dashboard-key': { options: { title: 'Dashboard' } },
      'hidden-key': { options: { title: 'Akun User', href: null } },
    };

    const html = renderToStaticMarkup(
      <FloatingTabBar {...({ state, navigation, descriptors } as any)} />
    );
    expect(html).toContain('lucide-layout-dashboard');
    expect(html).not.toContain('lucide-user');
  });

  it('renders custom options.tabBarIcon when provided', () => {
    const mockNavigate = jest.fn();
    const navigation = {
      navigate: mockNavigate,
      emit: jest.fn(() => ({ defaultPrevented: false })),
    };
    const state = {
      index: 0,
      routes: [{ key: 'pos-key', name: 'pos' }],
    };
    const descriptors = {
      'pos-key': {
        options: {
          title: 'Terminal POS',
          tabBarIcon: ({ color }: { color: string }) => (
            <span data-testid="custom-pos-icon">{color}</span>
          ),
        },
      },
    };

    const html = renderToStaticMarkup(
      <FloatingTabBar {...({ state, navigation, descriptors } as any)} />
    );
    expect(html).toContain('custom-pos-icon');
  });

  it('generates floating tab bar screen options for Tabs navigator without boxy cell background', () => {
    const options = getFloatingTabScreenOptions();
    expect(options.headerShown).toBe(false);
    expect(options.tabBarShowLabel).toBe(false);
    expect(options.tabBarActiveTintColor).toBe('#FFFFFF');
    // tabBarActiveBackgroundColor is omitted to prevent square cell rendering in React Navigation
    expect((options as any).tabBarActiveBackgroundColor).toBeUndefined();
    expect(options.tabBarStyle.position).toBe('absolute');
    expect(options.tabBarStyle.backgroundColor).toBe('#FFFFFF');
    expect(options.tabBarStyle.borderRadius).toBe(9999);
    expect(options.tabBarStyle.borderTopWidth).toBe(0);
  });

  it('supports coffee-dark variant in getFloatingTabScreenOptions', () => {
    const options = getFloatingTabScreenOptions({ variant: 'coffee-dark' });
    expect(options.tabBarStyle.backgroundColor).toBe('#1E1113');
  });

  it('supports isCompact layout in getFloatingTabScreenOptions for few tabs', () => {
    const options = getFloatingTabScreenOptions({ isCompact: true });
    expect(options.tabBarStyle.left).toBe(60);
    expect(options.tabBarStyle.right).toBe(60);
  });

  it('renders FloatingTabIcon as a pill capsule with brand red background when focused', () => {
    const html = renderToStaticMarkup(
      <FloatingTabIcon icon={Coffee} focused={true} />
    );
    // Active state has brand red background class (bg-primary) and rounded capsule (rounded-full)
    expect(html).toContain('bg-primary');
    expect(html).toContain('rounded-full');
    expect(html).toContain('lucide-coffee');
  });

  it('renders FloatingTabIcon in muted neutral color without pill capsule when inactive', () => {
    const html = renderToStaticMarkup(
      <FloatingTabIcon icon={Coffee} focused={false} />
    );
    // Inactive state does not have the bg-primary pill background
    expect(html).not.toContain('bg-primary');
    expect(html).toContain('lucide-coffee');
  });
});
