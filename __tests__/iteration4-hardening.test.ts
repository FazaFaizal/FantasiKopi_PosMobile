/**
 * AUDIT ITERASI 4 — CUSTOMER ORDERING & ADMIN DASHBOARD
 * 1. Pesanan customer masuk ke kasir secara realtime (banner + badge sidebar).
 * 2. Omzet diakui saat dibayar (paid_at), sama dengan sif & kas harian.
 * 3. Pesanan customer yang tidak dibayar dalam 15 menit dibatalkan otomatis.
 * 4. Keranjang customer disinkronkan dengan harga/status terbaru; total server ditampilkan.
 * 5–7. Dashboard: error tidak tampil sebagai 0, refresh saat dibuka, omzet dari database.
 * 8. Keterangan pembatalan di sisi customer (oleh Anda / otomatis / kasir).
 */
import {
  AUTO_CANCEL_REASON,
  CUSTOMER_PAYMENT_TIMEOUT_MINUTES,
  canConfirmPayment,
  describeCancellation,
  formatCountdown,
  getPaymentTimeLeftMs,
  getRevenueTimestamp,
  isAwaitingCustomerPayment,
  isPaymentExpired,
} from '../lib/order-logic';
import {
  getServerTotalNotice,
  getProductDetailView,
  syncCartWithProducts,
  CustomerCartItem,
} from '../lib/customer-order-logic';
import { calculateDailyCashRecap } from '../lib/cash-logic';
import {
  applySalesSummaryToDashboard,
  calculateTodayDashboardMetrics,
  DashboardOrder,
} from '../lib/dashboard-logic';
import { mapSalesSummary } from '../lib/report-logic';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
  existsSync(file: string): boolean;
};
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
const MIGRATION = 'supabase/migrations/20261114000001_iteration4_customer_orders.sql';

// ---------------------------------------------------------------------------
// 3. Batas waktu pembayaran 15 menit
// ---------------------------------------------------------------------------
describe('Batas waktu pembayaran pesanan customer', () => {
  const now = new Date('2026-11-14T04:00:00Z');
  const pending = {
    order_status: 'Pending' as const,
    payment_status: 'Pending' as const,
    payment_due_at: '2026-11-14T04:05:30Z',
  };

  it('batas waktu 15 menit', () => {
    expect(CUSTOMER_PAYMENT_TIMEOUT_MINUTES).toBe(15);
    expect(AUTO_CANCEL_REASON).toContain('15 menit');
  });

  it('sisa waktu & hitung mundur mm:ss', () => {
    expect(getPaymentTimeLeftMs(pending, now)).toBe(330000);
    expect(formatCountdown(330000)).toBe('05:30');
    expect(formatCountdown(59999)).toBe('01:00');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5000)).toBe('00:00');
  });

  it('tidak ada hitung mundur untuk order yang sudah lunas / tanpa batas waktu', () => {
    expect(getPaymentTimeLeftMs({ ...pending, payment_status: 'Paid' }, now)).toBeNull();
    expect(getPaymentTimeLeftMs({ ...pending, payment_due_at: null }, now)).toBeNull();
    expect(getPaymentTimeLeftMs({ ...pending, order_status: 'Cancelled' }, now)).toBeNull();
  });

  it('kedaluwarsa setelah batas waktu lewat', () => {
    expect(isPaymentExpired(pending, now)).toBe(false);
    expect(isPaymentExpired(pending, new Date('2026-11-14T04:05:30Z'))).toBe(true);
    expect(isPaymentExpired({ ...pending, payment_due_at: null }, new Date('2030-01-01'))).toBe(false);
  });

  it('kasir tidak dapat mengonfirmasi pembayaran pesanan yang kedaluwarsa', () => {
    expect(canConfirmPayment(pending, 'Kasir', now).allowed).toBe(true);
    const late = canConfirmPayment(pending, 'Kasir', new Date('2026-11-14T04:06:00Z'));
    expect(late.allowed).toBe(false);
    expect(late.reason).toMatch(/kedaluwarsa/i);
    // tanpa parameter waktu tetap kompatibel dengan pemanggil lama
    expect(canConfirmPayment({ order_status: 'Pending', payment_status: 'Pending' }, 'Kasir').allowed).toBe(true);
  });

  it('notifikasi hanya untuk pesanan customer yang menunggu pembayaran', () => {
    expect(isAwaitingCustomerPayment({ order_status: 'Pending', payment_status: 'Pending' })).toBe(true);
    expect(isAwaitingCustomerPayment({ order_status: 'Processing', payment_status: 'Paid' })).toBe(false);
    expect(isAwaitingCustomerPayment({ order_status: 'Cancelled', payment_status: 'Pending' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Keterangan pembatalan untuk customer
// ---------------------------------------------------------------------------
describe('Keterangan pembatalan untuk customer', () => {
  const me = 'user-1';
  it('dibatalkan sendiri', () => {
    const d = describeCancellation({ cancelled_by: me, cancellation_reason: 'Salah pesan' }, me);
    expect(d.title).toBe('Dibatalkan oleh Anda');
    expect(d.detail).toContain('Salah pesan');
  });
  it('dibatalkan otomatis', () => {
    const d = describeCancellation({ cancelled_by: null, cancellation_reason: AUTO_CANCEL_REASON }, me);
    expect(d.title).toBe('Dibatalkan otomatis');
    expect(d.detail).toMatch(/15 menit/);
  });
  it('dibatalkan kasir/admin', () => {
    const d = describeCancellation({ cancelled_by: 'kasir-1', cancellation_reason: 'Stok habis' }, me);
    expect(d.title).toBe('Dibatalkan oleh kasir');
    expect(d.detail).toContain('Stok habis');
  });
});

// ---------------------------------------------------------------------------
// 2. Omzet diakui saat dibayar
// ---------------------------------------------------------------------------
describe('Omzet diakui saat pembayaran diterima', () => {
  it('memakai paid_at, jatuh ke created_at untuk data lama', () => {
    expect(getRevenueTimestamp({ paid_at: '2026-11-13T16:10:00Z', created_at: '2026-11-13T15:50:00Z' })).toBe(
      '2026-11-13T16:10:00Z'
    );
    expect(getRevenueTimestamp({ paid_at: null, created_at: '2026-11-13T15:50:00Z' })).toBe('2026-11-13T15:50:00Z');
  });

  it('kas harian: pesanan 23:50 WITA yang dibayar 00:10 masuk hari berikutnya', () => {
    const orders = [
      {
        payment_method: 'Tunai',
        payment_status: 'Paid',
        order_status: 'Processing',
        total_amount: 20000,
        created_at: '2026-11-13T15:50:00Z', // 13 Nov 23:50 WITA
        paid_at: '2026-11-13T16:10:00Z', // 14 Nov 00:10 WITA
      },
    ];
    expect(calculateDailyCashRecap(orders, [], '2026-11-13').cashSales).toBe(0);
    expect(calculateDailyCashRecap(orders, [], '2026-11-14').cashSales).toBe(20000);
  });

  it('dashboard memakai ringkasan database untuk omzet, biaya & produk terlaris', () => {
    const base = calculateTodayDashboardMetrics([], [], [], new Date('2026-11-14T04:00:00Z'));
    const summary = mapSalesSummary({
      total_revenue: 51000,
      paid_orders: 2,
      items_sold: 3,
      top_products: [{ product_id: 'p1', product_name: 'Kopi Susu', quantity_sold: 2, total_revenue: 36000 }],
      total_expenses: 20000,
      expenses_by_category: [{ category: 'Raw Material', amount: 20000 }],
    });
    const m = applySalesSummaryToDashboard(base, summary, { awaitingPaymentCount: 3 });
    expect(m.todaySales).toBe(51000);
    expect(m.todayPaidOrderCount).toBe(2);
    expect(m.todayExpenses).toBe(20000);
    expect(m.todayNetResult).toBe(31000);
    expect(m.topProductToday).toEqual({ name: 'Kopi Susu', quantity: 2, sales: 36000 });
    expect(m.todayAwaitingPaymentCount).toBe(3);
  });

  it('dashboard tanpa produk terjual → produk terlaris null', () => {
    const base = calculateTodayDashboardMetrics([], [], []);
    const m = applySalesSummaryToDashboard(base, mapSalesSummary(null));
    expect(m.topProductToday).toBeNull();
    expect(m.todaySales).toBe(0);
  });

  it('metrik lokal dashboard juga memakai waktu bayar', () => {
    const orders: DashboardOrder[] = [
      {
        id: '1',
        order_number: 'ORD-1',
        order_status: 'Processing',
        payment_status: 'Paid',
        total_amount: 20000,
        created_at: '2026-11-13T15:50:00Z',
        paid_at: '2026-11-13T16:10:00Z',
      },
    ];
    const m = calculateTodayDashboardMetrics(orders, [], [], new Date('2026-11-14T04:00:00Z'));
    expect(m.todaySales).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// 4. Sinkronisasi keranjang customer
// ---------------------------------------------------------------------------
describe('Sinkronisasi keranjang customer', () => {
  const cart: CustomerCartItem[] = [
    { productId: 'a', productName: 'Kopi Susu', unitPrice: 18000, quantity: 2, status: 'Tersedia', is_active: true },
    { productId: 'b', productName: 'Roti Bakar', unitPrice: 15000, quantity: 1, status: 'Tersedia', is_active: true },
    { productId: 'c', productName: 'Matcha', unitPrice: 25000, quantity: 1, status: 'Tersedia', is_active: true },
  ];

  it('memperbarui harga & status, mencatat perubahan', () => {
    const { cart: next, changes } = syncCartWithProducts(cart, [
      { id: 'a', name: 'Kopi Susu', price: 20000, status: 'Tersedia', is_active: true },
      { id: 'b', name: 'Roti Bakar', price: 15000, status: 'Tidak Tersedia', is_active: true },
      // c sudah dinonaktifkan sehingga tidak ikut termuat
    ]);
    expect(next.find((i) => i.productId === 'a')?.unitPrice).toBe(20000);
    expect(next.find((i) => i.productId === 'b')?.status).toBe('Tidak Tersedia');
    expect(next.find((i) => i.productId === 'c')?.status).toBe('Tidak Tersedia');
    expect(changes).toHaveLength(3);
    expect(changes.join(' ')).toContain('Kopi Susu');
    expect(changes.join(' ')).toContain('Roti Bakar');
    expect(changes.join(' ')).toContain('Matcha');
  });

  it('tanpa perubahan → objek keranjang sama & tidak ada catatan', () => {
    const products = cart.map((c) => ({ id: c.productId, name: c.productName, price: c.unitPrice, status: 'Tersedia', is_active: true }));
    const res = syncCartWithProducts(cart, products);
    expect(res.changes).toEqual([]);
    expect(res.cart).toBe(cart);
  });

  it('tampilan detail produk: status, bisa dipesan, deskripsi', () => {
    expect(getProductDetailView({ status: 'Tersedia', is_active: true, description: ' Kopi susu gula aren ' })).toEqual({
      statusLabel: 'Tersedia',
      tone: 'success',
      canOrder: true,
      description: 'Kopi susu gula aren',
    });
    const habis = getProductDetailView({ status: 'Tidak Tersedia', is_active: true, description: null });
    expect(habis.statusLabel).toBe('Habis');
    expect(habis.canOrder).toBe(false);
    expect(habis.description).toMatch(/belum ada deskripsi/i);
  });

  it('pemberitahuan bila total server berbeda', () => {
    expect(getServerTotalNotice(36000, 36000)).toBeNull();
    expect(getServerTotalNotice(36000, 40000)).toMatch(/harga terbaru/i);
  });
});

// ---------------------------------------------------------------------------
// SQL: migration & schema
// ---------------------------------------------------------------------------
describe('Migration iterasi 4', () => {
  const mig = read(MIGRATION);
  const sql = normalize(mig);
  const schema = normalize(read('supabase/schema.sql'));

  it('kolom batas bayar & fungsi batas waktu 15 menit', () => {
    expect(sql).toContain('add column if not exists payment_due_at timestamptz');
    expect(sql).toMatch(/function public\.customer_payment_timeout\(\).*interval '15 minutes'/);
  });

  it('batas bayar diisi trigger saat insert dan tidak bisa diubah klien', () => {
    expect(sql).toContain('create trigger set_order_payment_due before insert or update on public.orders');
  });

  it('pembayaran pesanan kedaluwarsa / batal ditolak database', () => {
    expect(sql).toContain('create trigger guard_expired_order_payment before update on public.orders');
    expect(mig).toMatch(/kedaluwarsa/);
  });

  it('expire_unpaid_orders + izin eksekusi', () => {
    expect(sql).toContain('create or replace function public.expire_unpaid_orders()');
    expect(sql).toContain('revoke execute on function public.expire_unpaid_orders() from public, anon');
    expect(sql).toContain('grant execute on function public.expire_unpaid_orders() to authenticated');
  });

  it('pg_cron (bila aktif) menjalankan pembatalan otomatis tiap menit', () => {
    expect(sql).toMatch(/extname = 'pg_cron'/);
    expect(sql).toContain("'expire-unpaid-orders'");
    expect(sql).toContain("'* * * * *'");
  });

  it('tabel orders didaftarkan ke realtime', () => {
    expect(sql).toContain('alter publication supabase_realtime add table public.orders');
  });

  it('laporan memakai waktu bayar', () => {
    expect(sql).toContain('coalesce(o.paid_at, o.created_at) >= v_start');
    expect(sql).not.toContain('o.created_at >= v_start');
    expect(sql).toContain('idx_orders_revenue_at');
  });

  it('create_order mengembalikan batas bayar', () => {
    expect(sql).toContain("'payment_due_at', v_order.payment_due_at");
  });

  it('isi plpgsql tidak rusak oleh penggantian $$', () => {
    expect(mig).not.toMatch(/ AS \$\n| as \$;|^\$;/m);
  });

  it('schema.sql memuat perubahan yang sama', () => {
    for (const s of [
      'add column if not exists payment_due_at timestamptz',
      'create or replace function public.expire_unpaid_orders()',
      'create trigger guard_expired_order_payment',
      'coalesce(o.paid_at, o.created_at) >= v_start',
      "'payment_due_at', v_order.payment_due_at",
    ]) {
      expect(schema).toContain(s);
    }
    expect(schema).not.toContain('o.created_at >= v_start');
  });
});

// ---------------------------------------------------------------------------
// Layar
// ---------------------------------------------------------------------------
describe('Integrasi layar', () => {
  it('daftar pesanan kasir/admin realtime, refresh saat dibuka, cek kedaluwarsa', () => {
    const src = read('components/OrdersScreen.tsx');
    expect(src).toContain('postgres_changes');
    expect(src).toContain('useFocusEffect');
    expect(src).toMatch(/rpc\(\s*['"]expire_unpaid_orders['"]/);
    expect(src).toContain('formatCountdown(');
    expect(src).toMatch(/canConfirmPayment\(selectedOrder, userRole, new Date\(\)\)/);
  });

  it('banner pesanan baru & badge sidebar untuk kasir dan admin', () => {
    const hook = read('hooks/useAwaitingCustomerOrders.ts');
    expect(hook).toContain('postgres_changes');
    expect(hook).toContain('isAwaitingCustomerPayment(');
    expect(fs.existsSync(`${__dirname}/../components/IncomingOrderBanner.tsx`)).toBe(true);
    for (const layout of ['app/(kasir)/_layout.tsx', 'app/(admin)/_layout.tsx']) {
      const src = read(layout);
      expect(src).toContain('useAwaitingCustomerOrders(');
      expect(src).toContain('<IncomingOrderBanner');
      expect(src).toContain('badges=');
    }
    expect(read('components/SidebarDrawer.tsx')).toContain('badges?.[item.id]');
  });

  it('customer: hitung mundur, keterangan pembatalan, cek kedaluwarsa', () => {
    const src = read('app/(customer)/orders.tsx');
    expect(src).toContain('formatCountdown(');
    expect(src).toContain('describeCancellation(');
    expect(src).toMatch(/rpc\(\s*["']expire_unpaid_orders["']/);
    expect(src).not.toContain('telah dibatalkan oleh kasir/admin');
    expect(src).toContain('ErrorState');
  });

  it('customer: keranjang tersinkron, total server, error menu, tombol ≥ 44px', () => {
    const src = read('app/(customer)/product.tsx');
    expect(src).toContain('syncCartWithProducts(');
    expect(src).toContain('getServerTotalNotice(');
    expect(src).toContain('ErrorState');
    expect(src).not.toContain('w-7 h-7');
  });

  it('dashboard: ringkasan database, jumlah menunggu bayar, error & refresh saat dibuka', () => {
    const src = read('app/(admin)/dashboard.tsx');
    expect(src).toMatch(/rpc\(\s*["']get_sales_summary["']/);
    expect(src).toContain('applySalesSummaryToDashboard(');
    expect(src).toContain('useFocusEffect');
    expect(src).toContain('ErrorState');
    expect(src).toMatch(/count: ["']exact["']/);
  });

  it('kas harian memakai waktu bayar', () => {
    const src = read('components/DailyCashScreen.tsx');
    expect(src).toContain('paid_at');
    expect(src).toMatch(/\.or\(/);
  });

  it('produk nonaktif tidak tampil di POS & menu customer', () => {
    expect(read('app/(kasir)/pos.tsx')).toMatch(/\.eq\(\s*['"]is_active['"],\s*true\s*\)/);
    const customer = read('app/(customer)/product.tsx');
    expect(customer).toMatch(/\.eq\(\s*["']is_active["'],\s*true\s*\)/);
    expect(customer).toContain('if (item.is_active === false) return false;');
  });

  it('produk habis (Tidak Tersedia) ter-disable di POS, tidak menawarkan aktifkan ulang lewat kartu', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('disabled={isUnavailable}');
    expect(pos).not.toContain("text: 'Jadikan Tersedia'");
  });

  it('detail produk: tahan untuk melihat, lepas untuk menutup', () => {
    const src = read('app/(customer)/product.tsx');
    expect(src).toContain('onLongPress={() => setPeekProduct(item)}');
    expect(src).toContain('onPressOut={() => setPeekProduct(null)}');
    // overlay tidak boleh merebut sentuhan, agar "lepas" tetap tertangkap kartu
    expect(src).toContain('pointerEvents="none"');
    expect(src).toContain('getProductDetailView(peekProduct)');
    expect(src).toContain('accessibilityHint=');
  });

  it('tipe database & komentar zona waktu', () => {
    const types = read('types/database.ts');
    expect(types).toContain('payment_due_at');
    expect(types).toContain('expire_unpaid_orders');
    expect(read('lib/inventory-logic.ts')).not.toMatch(/\bWIB\b/);
  });
});
