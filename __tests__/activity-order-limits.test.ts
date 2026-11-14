/**
 * RECENT ACTIVITY DASHBOARD & BATAS PESANAN CUSTOMER (keputusan 2026-11-14)
 * 1. Dashboard Admin menampilkan aktivitas operasional penting (PRD 27): buka/tutup sif
 *    (+ selisih kas), pembatalan/refund, batal otomatis, koreksi metode bayar, mutasi stok,
 *    pengeluaran — dengan filter Semua/Kas/Pesanan/Stok.
 * 2. Pesanan customer (khusus customer, POS tidak terpengaruh):
 *    - maksimal 1 pesanan belum dibayar sekaligus,
 *    - maksimal 99 per menu, maksimal 10 menu berbeda per pesanan.
 */
import { ACTIVITY_FILTERS, ActivityRow, describeActivity, formatActivityTime } from '../lib/activity-logic';
import {
  CUSTOMER_MAX_DISTINCT_PRODUCTS,
  CUSTOMER_MAX_ITEM_QUANTITY,
  CUSTOMER_MAX_UNPAID_ORDERS,
  CustomerCartItem,
  checkCustomerCartChange,
  findBlockingUnpaidOrder,
  validateCustomerCheckoutPayload,
} from '../lib/customer-order-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
const MIGRATION = 'supabase/migrations/20261114000004_activity_and_customer_limits.sql';

const row = (r: Partial<ActivityRow>): ActivityRow => ({
  kind: 'expense',
  category: 'kas',
  occurred_at: '2026-11-14T02:00:00Z',
  actor: 'kasir@fantasi.id',
  ref_id: 'x',
  ref_label: null,
  amount: null,
  quantity: null,
  unit: null,
  note: null,
  extra: null,
  ...r,
});

// ---------------------------------------------------------------------------
// 1. Recent Activity
// ---------------------------------------------------------------------------
describe('describeActivity', () => {
  it('tutup sif dengan selisih kas → peringatan', () => {
    const d = describeActivity(row({ kind: 'shift_close', amount: -5000 }));
    expect(d.title).toContain('Sif ditutup');
    expect(d.detail).toMatch(/Selisih/);
    expect(d.detail).toMatch(/5\.000/);
    expect(d.tone).toBe('warning');
    expect(d.route).toBe('/(admin)/cash');
  });

  it('tutup sif tanpa selisih → sesuai', () => {
    const d = describeActivity(row({ kind: 'shift_close', amount: 0 }));
    expect(d.detail).toMatch(/sesuai/i);
    expect(d.tone).toBe('success');
  });

  it('buka sif', () => {
    const d = describeActivity(row({ kind: 'shift_open', amount: 100000 }));
    expect(d.title).toContain('Sif dibuka');
    expect(d.detail).toMatch(/100\.000/);
  });

  it('refund ditandai paling mencolok', () => {
    const d = describeActivity(
      row({ kind: 'order_refund', category: 'pesanan', ref_label: 'ORD-20261114-0001', amount: 36000, note: 'Salah menu', extra: 'Tunai' })
    );
    expect(d.title).toContain('ORD-20261114-0001');
    expect(d.detail).toContain('Salah menu');
    expect(d.detail).toMatch(/36\.000/);
    expect(d.tone).toBe('danger');
    expect(d.route).toBe('/(admin)/orders');
  });

  it('pembatalan biasa & batal otomatis', () => {
    expect(describeActivity(row({ kind: 'order_cancel', category: 'pesanan', ref_label: 'ORD-1', note: 'Stok habis' })).tone).toBe('warning');
    const auto = describeActivity(row({ kind: 'order_auto_cancel', category: 'pesanan', ref_label: 'ORD-2', actor: null }));
    expect(auto.title).toMatch(/batal otomatis/i);
    expect(auto.detail).toMatch(/15 menit/);
  });

  it('koreksi metode bayar', () => {
    const d = describeActivity(row({ kind: 'payment_correction', category: 'pesanan', ref_label: 'ORD-3', extra: 'Tunai → QRIS' }));
    expect(d.detail).toContain('Tunai → QRIS');
    expect(d.tone).toBe('warning');
  });

  it('mutasi stok', () => {
    const d = describeActivity(row({ kind: 'stock_movement', category: 'stok', ref_label: 'Susu', quantity: 10, unit: 'karton', extra: 'Stock In' }));
    expect(d.title).toContain('Susu');
    expect(d.title).toMatch(/Stok masuk/);
    expect(d.detail).toContain('10 karton');
    expect(d.route).toBe('/(admin)/inventory');
    expect(describeActivity(row({ kind: 'stock_movement', category: 'stok', extra: 'Stock Adjustment', quantity: 1, unit: 'kg' })).tone).toBe('warning');
  });

  it('pengeluaran', () => {
    const d = describeActivity(row({ kind: 'expense', amount: 50000, ref_label: 'Es batu', extra: 'cash' }));
    expect(d.title).toMatch(/50\.000/);
    expect(d.detail).toContain('Es batu');
    expect(d.detail).toMatch(/kas laci/);
    expect(d.route).toBe('/(admin)/expense');
  });

  it('filter Semua / Kas / Pesanan / Stok', () => {
    expect(ACTIVITY_FILTERS.map((f) => f.label)).toEqual(['Semua', 'Kas', 'Pesanan', 'Stok']);
    expect(ACTIVITY_FILTERS[0].category).toBeNull();
  });

  it('waktu WITA: jam saja untuk hari ini, tanggal untuk hari lain', () => {
    const now = new Date('2026-11-14T04:00:00Z'); // 12:00 WITA
    expect(formatActivityTime('2026-11-14T01:05:00Z', now)).toBe('09:05');
    expect(formatActivityTime('2026-11-13T15:30:00Z', now)).toBe('13 Nov 23:30');
  });
});

// ---------------------------------------------------------------------------
// 2. Batas pesanan customer
// ---------------------------------------------------------------------------
describe('Batas pesanan customer', () => {
  it('nilai batas', () => {
    expect(CUSTOMER_MAX_UNPAID_ORDERS).toBe(1);
    expect(CUSTOMER_MAX_ITEM_QUANTITY).toBe(99);
    expect(CUSTOMER_MAX_DISTINCT_PRODUCTS).toBe(10);
  });

  const item = (id: string, quantity: number, notes?: string): CustomerCartItem => ({
    productId: id,
    productName: `Menu ${id}`,
    unitPrice: 10000,
    quantity,
    notes,
    status: 'Tersedia',
    is_active: true,
  });

  it('jumlah per menu maksimal 99 (dijumlah lintas catatan)', () => {
    const cart = [item('a', 98)];
    expect(checkCustomerCartChange(cart, 'a', 1).allowed).toBe(true);
    const over = checkCustomerCartChange([item('a', 98), item('a', 1, 'less ice')], 'a', 1);
    expect(over.allowed).toBe(false);
    expect(over.reason).toMatch(/99/);
  });

  it('maksimal 10 menu berbeda', () => {
    const cart = Array.from({ length: 10 }, (_, i) => item(`p${i}`, 1));
    expect(checkCustomerCartChange(cart, 'p3', 1).allowed).toBe(true); // menu yang sudah ada
    const res = checkCustomerCartChange(cart, 'baru', 1);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/10 menu/);
  });

  it('checkout juga memeriksa batas', () => {
    const base = { customerName: 'Sari', orderType: 'Take Away' as const, paymentMethod: 'Tunai' as const };
    expect(validateCustomerCheckoutPayload({ ...base, cart: [item('a', 100)] }).error).toMatch(/99/);
    const eleven = Array.from({ length: 11 }, (_, i) => item(`p${i}`, 1));
    expect(validateCustomerCheckoutPayload({ ...base, cart: eleven }).error).toMatch(/10 menu/);
    expect(validateCustomerCheckoutPayload({ ...base, cart: [item('a', 99)] }).isValid).toBe(true);
  });

  it('pesanan belum dibayar yang masih berlaku menghalangi pesanan baru', () => {
    const now = new Date('2026-11-14T04:00:00Z');
    const orders = [
      { order_number: 'ORD-1', order_status: 'Pending' as const, payment_status: 'Pending' as const, payment_due_at: '2026-11-14T03:59:00Z' },
      { order_number: 'ORD-2', order_status: 'Processing' as const, payment_status: 'Paid' as const, payment_due_at: '2026-11-14T03:50:00Z' },
    ];
    expect(findBlockingUnpaidOrder(orders, now)).toBeNull(); // ORD-1 sudah kedaluwarsa
    const active = [...orders, { order_number: 'ORD-3', order_status: 'Pending' as const, payment_status: 'Pending' as const, payment_due_at: '2026-11-14T04:10:00Z' }];
    expect(findBlockingUnpaidOrder(active, now)?.order_number).toBe('ORD-3');
  });
});

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
describe('Migration aktivitas & batas pesanan', () => {
  const mig = read(MIGRATION);
  const sql = normalize(mig);
  const schema = normalize(read('supabase/schema.sql'));

  it('koreksi metode bayar dicatat sebagai baris riwayat (khusus Admin)', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create table if not exists public.order_payment_corrections');
      expect(s).toContain('alter table public.order_payment_corrections enable row level security');
      expect(s).toContain('insert into public.order_payment_corrections');
    }
  });

  it('get_recent_activity khusus Admin, mencakup semua sumber', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create or replace function public.get_recent_activity(');
    }
    for (const kind of ['shift_open', 'shift_close', 'order_cancel', 'order_refund', 'order_auto_cancel', 'payment_correction', 'stock_movement', 'expense']) {
      expect(mig).toContain(`'${kind}'`);
    }
    expect(mig).toMatch(/IF NOT public\.is_admin\(\)/);
    expect(sql).toMatch(/revoke execute on function public\.get_recent_activity\(integer, text\) from public, anon/);
  });

  it('create_order membatasi pesanan customer & mencegah balapan', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('pg_advisory_xact_lock');
    }
    expect(mig).toContain('Maksimal 10 menu berbeda');
    expect(mig).toContain('maksimal 99');
    expect(mig).toContain('belum dibayar');
  });

  it('customer hanya bisa membuat pesanan lewat create_order (batas tidak bisa dilewati)', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('drop policy if exists "customers can create own orders" on public.orders');
      expect(s).toContain('drop policy if exists "customers can add items to own pending orders" on public.order_items');
    }
    const fn = sql.slice(sql.indexOf('create or replace function public.create_order('));
    expect(fn.slice(0, fn.indexOf('as $$'))).toContain('security definer');
  });

  it('isi plpgsql tidak rusak oleh penggantian $$', () => {
    expect(mig).not.toMatch(/ AS \$\n| as \$;|^\$;/m);
  });
});

// ---------------------------------------------------------------------------
// Layar
// ---------------------------------------------------------------------------
describe('Integrasi layar', () => {
  it('dashboard menampilkan aktivitas terbaru', () => {
    const dash = read('app/(admin)/dashboard.tsx');
    expect(dash).toContain('<RecentActivityCard');
    const card = read('components/RecentActivityCard.tsx');
    expect(card).toMatch(/rpc\(\s*["']get_recent_activity["']/);
    expect(card).toContain('describeActivity(');
    expect(card).toContain('ACTIVITY_FILTERS');
    expect(card).toContain('formatActivityTime(');
  });

  it('menu customer menerapkan batas & memeriksa pesanan belum dibayar', () => {
    const src = read('app/(customer)/product.tsx');
    expect(src).toContain('checkCustomerCartChange(');
    expect(src).toContain('findBlockingUnpaidOrder(');
  });

  it('POS kasir tidak memakai batas customer', () => {
    expect(read('app/(kasir)/pos.tsx')).not.toContain('checkCustomerCartChange');
  });
});
