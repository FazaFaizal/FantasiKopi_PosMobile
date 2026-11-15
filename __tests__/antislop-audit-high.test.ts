/**
 * Perbaikan temuan HIGH audit antislop 001 (anti-slop/audit-001-2026-11-15.md):
 * tombol cetak palsu, data karangan, klaim tanpa bukti, em dash, kontras,
 * status bar, target sentuh, safe area, label aksesibilitas, live region,
 * status layar bayar QRIS, tautan dashboard, dan Alert di build web.
 */
import { Alert, Platform } from 'react-native';
import { installWebAlert } from '../lib/web-alert';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
};
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');

const UI_FILES = [
  'app/(kasir)/pos.tsx',
  'app/(customer)/product.tsx',
  'app/(customer)/payment.tsx',
  'app/(customer)/orders.tsx',
  'app/(admin)/dashboard.tsx',
  'components/OrdersScreen.tsx',
  'components/SidebarDrawer.tsx',
  'components/StockInPurchaseFields.tsx',
  'components/DailyCashScreen.tsx',
];

describe('Audit antislop 001: HIGH', () => {
  it('#1 tidak ada tombol cetak struk simulasi', () => {
    for (const f of ['app/(kasir)/pos.tsx', 'components/OrdersScreen.tsx']) {
      expect(read(f)).not.toContain('Simulasi cetak struk');
    }
  });

  it('#2 tidak ada data cadangan karangan', () => {
    expect(read('app/(admin)/dashboard.tsx')).not.toContain('payment_method || "QRIS"');
    expect(read('components/OrdersScreen.tsx')).not.toContain("order_type || 'Dine In'");
    const sidebar = read('components/SidebarDrawer.tsx');
    expect(sidebar).not.toContain('admin@fantasicoffee.com');
    expect(sidebar).not.toContain('Cabang Utama');
    expect(sidebar).not.toContain('sesi Admin');
  });

  it('#3 badge dashboard tidak mengklaim "Data Aktual" saat gagal', () => {
    const src = read('app/(admin)/dashboard.tsx');
    expect(src).not.toContain('Data Aktual');
    expect(src).toContain('lastLoadedAt && !errorMessage');
  });

  it('#4 tidak ada klaim pajak/realtime tanpa bukti di katalog pelanggan', () => {
    const src = read('app/(customer)/product.tsx');
    expect(src).not.toContain('Pajak & Layanan');
    expect(src).not.toContain('Ketersediaan menu terupdate');
  });

  it('#5 tidak ada em dash di teks UI', () => {
    for (const f of UI_FILES) {
      const uiLines = read(f)
        .split('\n')
        .filter((l: string) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
      expect(uiLines.filter((l: string) => l.includes('—'))).toEqual([]);
    }
  });

  it('#6 warna placeholder/ikon abu-abu muda dan teks rose-600 tidak dipakai lagi', () => {
    for (const f of UI_FILES) {
      expect(read(f)).not.toContain('#9CA3AF');
      expect(read(f)).not.toContain('text-rose-600');
    }
    expect(read('tailwind.config.js')).toContain('"line-strong": "#8A8F98"');
    expect(read('components/Input.tsx')).toContain('border-line-strong');
  });

  it('#7 header merah memakai ikon status bar terang', () => {
    expect(read('components/ScreenHeader.tsx')).toContain('<ExpoStatusBar style="light" />');
  });

  it('#8 kontrol jumlah di POS minimal 44px', () => {
    const src = read('app/(kasir)/pos.tsx');
    expect(src).not.toContain('w-7 h-7');
    expect(read('components/Button.tsx')).not.toContain('min-h-10');
  });

  it('#9 bottom sheet menambah inset bawah, header keranjang pelanggan inset atas', () => {
    for (const f of [
      'app/(admin)/category.tsx',
      'app/(admin)/employee.tsx',
      'app/(admin)/expense.tsx',
      'app/(admin)/inventory.tsx',
      'app/(admin)/product.tsx',
      'app/(admin)/user.tsx',
      'app/(kasir)/inventory.tsx',
      'components/DailyCashScreen.tsx',
      'components/OrdersScreen.tsx',
    ]) {
      // Detail pesanan di tablet tampil di tengah layar, jadi inset bawah hanya untuk HP.
      expect(read(f)).toMatch(/paddingBottom: (isTablet \? 0 : )?sheetPadBottom/);
    }
    expect(read('app/(customer)/product.tsx')).toContain('paddingTop: insets.top + 12');
  });

  it('#11 countdown tidak diumumkan setiap detik', () => {
    expect(read('components/OrdersScreen.tsx')).toContain('accessibilityLiveRegion={expired ? "polite" : "none"}');
  });

  it('#12 layar bayar QRIS punya status memuat & error untuk data pesanan', () => {
    const src = read('app/(customer)/payment.tsx');
    expect(src).toContain('Memuat data pembayaran');
    expect(src).toContain('setOrderError');
    expect(src).toContain('actionLabel="Buka Pesanan Saya"');
  });

  it('#13 tautan "Semua Pesanan" membuka halaman pesanan', () => {
    const src = read('app/(admin)/dashboard.tsx');
    expect(src).toContain('router.replace("/(admin)/orders")}\n            className="flex-row items-center min-h-11"');
  });
});

describe('Audit antislop 001: MEDIUM & LOW', () => {
  const ALL = [
    ...UI_FILES,
    'app/(admin)/category.tsx',
    'app/(admin)/employee.tsx',
    'app/(admin)/expense.tsx',
    'app/(admin)/inventory.tsx',
    'app/(admin)/product.tsx',
    'app/(admin)/user.tsx',
    'app/(kasir)/inventory.tsx',
    'app/(auth)/inactive.tsx',
    'app/(auth)/unauthorized.tsx',
    'app/(auth)/register.tsx',
    'components/Button.tsx',
    'components/Input.tsx',
    'components/RecentActivityCard.tsx',
    'components/FloatingNavbar.tsx',
  ];

  it('#16 warna status memakai token, error Input memakai danger + ikon', () => {
    for (const f of ALL) {
      expect(read(f)).not.toMatch(/(bg|text|border)-(rose|emerald|blue)-\d/);
      expect(read(f)).not.toMatch(/(bg|text|border)-amber-(50|200|800|900)\b/);
    }
    const input = read('components/Input.tsx');
    expect(input).toContain("error ? 'border-danger'");
    expect(input).toContain('accessibilityRole="alert"');
  });

  it('#17 tidak ada kelas font yang tidak terdefinisi; Inter SemiBold dimuat', () => {
    for (const f of ALL) expect(read(f)).not.toContain('font-heading-bold');
    expect(read('app/_layout.tsx')).toContain("'Inter-SemiBold': Inter_600SemiBold");
  });

  it('#18 tidak ada teks di bawah 12px', () => {
    for (const f of ALL) expect(read(f)).not.toMatch(/text-\[(9|10|11)px\]/);
  });

  it('#19 dashboard tanpa kartu profil & kartu modul identik', () => {
    const src = read('app/(admin)/dashboard.tsx');
    expect(src).not.toContain('User Profile Card');
    expect(src).not.toContain('label="Pengeluaran"');
    expect(src).not.toContain('label="Laba Bersih"');
    expect(src).toContain('Data Master');
  });

  it('#20 satu keluarga ikon, tanpa ikon petir/emoji', () => {
    for (const f of [...ALL, 'components/SidebarDrawer.tsx', 'app/(admin)/_layout.tsx']) {
      expect(read(f)).not.toContain('lucide-react-native');
    }
    expect(read('app/(admin)/dashboard.tsx')).not.toContain('flash-outline');
    expect(read('components/OrdersScreen.tsx')).not.toContain('⏱');
  });

  it('#21 kartu statis tanpa bayangan kecil', () => {
    for (const f of ALL) expect(read(f)).not.toMatch(/shadow-(sm|md)\b/);
  });

  it('#22-#26 LOW', () => {
    expect(read('app/(auth)/inactive.tsx')).not.toContain('w-18');
    expect(read('components/FloatingNavbar.tsx')).not.toContain('DEFAULT_DEMO_TABS');
    expect(read('components/FloatingNavbar.tsx')).toContain('accessibilityRole="tab"');
    expect(read('app/(auth)/register.tsx')).not.toContain('Rian Pratama');
    expect(read('app/(kasir)/pos.tsx')).not.toContain('Kak Sarah');
    expect(read('app/(admin)/employee.tsx')).not.toContain('Budi Santoso');
    expect(read('app/(kasir)/pos.tsx')).not.toContain('Kasir / Waktu');
    expect(read('app/(admin)/dashboard.tsx')).not.toContain('cup terjual');
  });
});

describe('#15 Alert di build web', () => {
  const originalOS = Platform.OS;
  const originalAlert = Alert.alert;
  const g = global as unknown as { window?: { alert: jest.Mock; confirm: jest.Mock } };

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
    Alert.alert = originalAlert;
    delete g.window;
  });

  it('tidak mengubah Alert di native', () => {
    installWebAlert();
    expect(Alert.alert).toBe(originalAlert);
  });

  it('konfirmasi dua tombol memakai window.confirm', () => {
    (Platform as { OS: string }).OS = 'web';
    g.window = { alert: jest.fn(), confirm: jest.fn(() => true) };
    installWebAlert();

    const onOk = jest.fn();
    const onCancel = jest.fn();
    Alert.alert('Keluar', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Keluar', style: 'destructive', onPress: onOk },
    ]);
    expect(g.window.confirm).toHaveBeenCalledWith('Keluar\n\nYakin?');
    expect(onOk).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    g.window.confirm.mockReturnValueOnce(false);
    Alert.alert('Keluar', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Keluar', onPress: onOk },
    ]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pesan satu tombol memakai window.alert', () => {
    (Platform as { OS: string }).OS = 'web';
    g.window = { alert: jest.fn(), confirm: jest.fn() };
    installWebAlert();

    const onOk = jest.fn();
    Alert.alert('Gagal', 'Coba lagi', [{ text: 'OK', onPress: onOk }]);
    expect(g.window.alert).toHaveBeenCalledWith('Gagal\n\nCoba lagi');
    expect(onOk).toHaveBeenCalled();
  });
});
