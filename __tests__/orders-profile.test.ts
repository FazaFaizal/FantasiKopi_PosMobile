/**
 * 1. Halaman Order untuk Admin (PRD 15.1): seluruh order (paginasi), batal/refund,
 *    koreksi metode pembayaran (khusus Admin, tercatat di catatan order).
 * 2. Customer membatalkan pesanannya sendiri selama Pending & belum dibayar (#6).
 * 3. Halaman Profile untuk Admin, Kasir, dan Customer (PRD 28) + ganti password.
 */
import {
  canCustomerCancelOrder,
  canCorrectPaymentMethod,
  getOrderHistoryStartISO,
  filterOrderHistory,
  OrderRecord,
} from '../lib/order-logic';
import { validatePasswordChange } from '../lib/auth-logic';
import { SIDEBAR_NAV_ITEMS, KASIR_NAV_ITEMS } from '../components/SidebarDrawer';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const order = (over: Partial<OrderRecord>): OrderRecord => ({
  id: 'o1',
  order_number: 'ORD-20261113-0001',
  total_amount: 20000,
  payment_method: 'Tunai',
  payment_status: 'Pending',
  order_status: 'Pending',
  created_at: '2026-11-13T02:00:00Z',
  ...over,
});

describe('#6 Customer membatalkan pesanan sendiri', () => {
  it('boleh selama Pending dan belum dibayar', () => {
    expect(canCustomerCancelOrder(order({})).allowed).toBe(true);
  });
  it('tidak boleh jika sudah dibayar atau sudah diproses', () => {
    expect(canCustomerCancelOrder(order({ payment_status: 'Paid' })).reason).toMatch(/kasir/i);
    expect(canCustomerCancelOrder(order({ order_status: 'Processing', payment_status: 'Paid' })).allowed).toBe(false);
    expect(canCustomerCancelOrder(order({ order_status: 'Cancelled' })).allowed).toBe(false);
  });
});

describe('Koreksi metode pembayaran (Admin)', () => {
  it('hanya Admin, hanya order yang sudah lunas, dan metode harus berbeda', () => {
    const paid = order({ payment_status: 'Paid', order_status: 'Completed' });
    expect(canCorrectPaymentMethod(paid, 'Admin', 'QRIS').allowed).toBe(true);
    expect(canCorrectPaymentMethod(paid, 'Kasir', 'QRIS').allowed).toBe(false);
    expect(canCorrectPaymentMethod(paid, 'Admin', 'Tunai').reason).toMatch(/sama/i);
    expect(canCorrectPaymentMethod(order({}), 'Admin', 'QRIS').allowed).toBe(false);
  });
});

describe('Riwayat order: batas waktu (WITA) untuk query & paginasi', () => {
  const now = new Date('2026-11-13T03:00:00Z'); // 13 Nov 11:00 WITA
  it('today → awal hari WITA; 7days → 7×24 jam; all → tanpa batas', () => {
    expect(getOrderHistoryStartISO('today', now)).toBe('2026-11-12T16:00:00.000Z');
    expect(getOrderHistoryStartISO('7days', now)).toBe('2026-11-06T03:00:00.000Z');
    expect(getOrderHistoryStartISO('all', now)).toBeNull();
  });
  it('filter "today" memakai hari WITA, bukan zona waktu perangkat', () => {
    const list = [
      order({ id: 'a', created_at: '2026-11-12T16:30:00Z' }), // 13 Nov 00:30 WITA
      order({ id: 'b', created_at: '2026-11-12T15:30:00Z' }), // 12 Nov 23:30 WITA
    ];
    expect(filterOrderHistory(list, { dateFilter: 'today', now }).map((o) => o.id)).toEqual(['a']);
  });
});

describe('Ganti password (validatePasswordChange)', () => {
  const ok = { currentPassword: 'lama12345', newPassword: 'baru12345', confirmPassword: 'baru12345' };
  it('valid', () => {
    expect(validatePasswordChange(ok)).toEqual({ isValid: true, errors: {} });
  });
  it('wajib password lama, minimal 8, berbeda dari lama, dan konfirmasi cocok', () => {
    expect(validatePasswordChange({ ...ok, currentPassword: '' }).errors.currentPassword).toBeDefined();
    expect(validatePasswordChange({ ...ok, newPassword: '1234567', confirmPassword: '1234567' }).errors.newPassword).toMatch(/8/);
    expect(validatePasswordChange({ ...ok, newPassword: 'lama12345', confirmPassword: 'lama12345' }).errors.newPassword).toMatch(/berbeda/i);
    expect(validatePasswordChange({ ...ok, confirmPassword: 'beda12345' }).errors.confirmPassword).toBeDefined();
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261113000006_admin_orders_customer_cancel.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('cancel_my_order: hanya pemilik, Pending & belum dibayar, baris terkunci', () => {
    const start = sql.indexOf('create or replace function public.cancel_my_order(');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('security definer');
    expect(body).toContain('public.is_active_customer()');
    expect(body).toContain('user_id = auth.uid()');
    expect(body).toContain('for update');
    expect(body).toContain("v_order.order_status <> 'pending' or v_order.payment_status <> 'pending'");
    expect(sql).toContain('grant execute on function public.cancel_my_order(uuid, text) to authenticated');
  });

  it('koreksi metode pembayaran hanya Admin dan tercatat di catatan order', () => {
    expect(sql).toMatch(/create trigger guard_order_payment_correction before update on public\.orders/);
    const start = sql.indexOf('create or replace function public.guard_order_payment_correction()');
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('new.payment_method is distinct from old.payment_method');
    expect(body).toContain('not public.is_admin()');
    expect(body).toContain('koreksi metode pembayaran');
  });
});

describe('Integrasi layar & navigasi', () => {
  it('layar order dipakai bersama Kasir & Admin', () => {
    expect(read('app/(kasir)/orders.tsx')).toContain('<OrdersScreen');
    expect(read('app/(admin)/orders.tsx')).toContain('<OrdersScreen');
    const src = read('components/OrdersScreen.tsx');
    expect(src).toContain('getOrderHistoryStartISO(');
    expect(src).toMatch(/\.lt\('created_at'/);
    expect(src).toContain('canCorrectPaymentMethod(');
  });

  it('menu Pesanan & Profil di sidebar Admin; Profil di sidebar Kasir', () => {
    const admin = SIDEBAR_NAV_ITEMS.main.map((i) => i.route).concat((SIDEBAR_NAV_ITEMS.management || []).map((i) => i.route));
    expect(admin).toEqual(expect.arrayContaining(['/(admin)/orders', '/(admin)/profile']));
    const kasir = KASIR_NAV_ITEMS.main.map((i) => i.route).concat((KASIR_NAV_ITEMS.management || []).map((i) => i.route));
    expect(kasir).toContain('/(kasir)/profile');
    const layout = read('app/(admin)/_layout.tsx');
    expect(layout).toContain('name="orders"');
    expect(layout).toContain('name="profile"');
    expect(read('app/(kasir)/_layout.tsx')).toContain('name="profile"');
  });

  it('customer dapat membatalkan pesanan & membuka profil', () => {
    const src = read('app/(customer)/orders.tsx');
    expect(src).toMatch(/rpc\(\s*["']cancel_my_order["']/);
    expect(src).toContain('canCustomerCancelOrder(');
    expect(read('app/(customer)/_layout.tsx')).toContain('name="profile"');
    expect(read('app/(customer)/product.tsx')).toContain('/(customer)/profile');
  });

  it.each(['admin', 'kasir', 'customer'])('profil %s memakai ProfileScreen', (role) => {
    expect(read(`app/(${role})/profile.tsx`)).toContain('<ProfileScreen');
  });

  it('ProfileScreen: ganti password memverifikasi password lama', () => {
    const src = read('components/ProfileScreen.tsx');
    expect(src).toContain('validatePasswordChange(');
    expect(src).toContain('signInWithPassword(');
    expect(src).toContain('updateUser(');
    expect(src).toContain('signOut');
  });
});
