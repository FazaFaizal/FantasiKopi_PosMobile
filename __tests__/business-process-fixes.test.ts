/**
 * PERBAIKAN PROSES BISNIS BERDAMPAK BESAR
 * #1 Omzet diakui saat pembayaran lunas (bukan saat status Completed)
 * #2 Pembayaran customer wajib dikonfirmasi kasir sebelum order diproses
 * #3 Akun staf dibuat lewat Edge Function (bukan auth.signUp di klien)
 */
import {
  isPaymentSettled,
  isRecognizedSale,
  canTransitionOrderStatus,
  canConfirmPayment,
  buildPaymentConfirmationUpdate,
  getBulkCompletableOrders,
  OrderRecord,
} from '../lib/order-logic';
import { calculateSalesReport, calculateFinancialReport } from '../lib/report-logic';
import { calculateTodayDashboardMetrics, DashboardOrder } from '../lib/dashboard-logic';
import { getCustomerOrderInitialStatus } from '../lib/customer-order-logic';
import { validateStaffAccountPayload } from '../lib/staff-account-logic';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
  existsSync(file: string): boolean;
};
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const baseOrder = (over: Partial<OrderRecord>): OrderRecord => ({
  id: 'x',
  order_number: 'ORD-20261111-0001',
  total_amount: 10000,
  payment_method: 'Tunai',
  payment_status: 'Pending',
  order_status: 'Pending',
  created_at: '2026-11-11T03:00:00Z',
  ...over,
});

// ============================================================================
// #1 PENGAKUAN OMZET BERDASARKAN PEMBAYARAN
// ============================================================================
describe('#1 Omzet diakui saat pembayaran lunas', () => {
  it('isPaymentSettled: hanya Paid (dan Lunas legacy) yang dianggap lunas', () => {
    expect(isPaymentSettled('Paid')).toBe(true);
    expect(isPaymentSettled('Lunas')).toBe(false); // nilai lama tidak lagi dikenal
    for (const s of ['Pending', 'Failed', 'Refunded', 'Batal']) {
      expect(isPaymentSettled(s)).toBe(false);
    }
  });

  it('isRecognizedSale: lunas & tidak dibatalkan, apa pun status dapurnya', () => {
    expect(isRecognizedSale({ order_status: 'Processing', payment_status: 'Paid' })).toBe(true);
    expect(isRecognizedSale({ order_status: 'Ready', payment_status: 'Paid' })).toBe(true);
    expect(isRecognizedSale({ order_status: 'Completed', payment_status: 'Paid' })).toBe(true);
    expect(isRecognizedSale({ order_status: 'Pending', payment_status: 'Pending' })).toBe(false);
    expect(isRecognizedSale({ order_status: 'Cancelled', payment_status: 'Refunded' })).toBe(false);
    // Data tidak konsisten: Cancelled tapi masih Paid → tetap tidak diakui
    expect(isRecognizedSale({ order_status: 'Cancelled', payment_status: 'Paid' })).toBe(false);
  });

  const orders = [
    { id: 'a', total_amount: 50000, order_status: 'Completed', payment_status: 'Paid', created_at: '2026-11-11T02:00:00Z' },
    { id: 'b', total_amount: 25000, order_status: 'Processing', payment_status: 'Paid', created_at: '2026-11-11T03:00:00Z' }, // lupa ditutup kasir
    { id: 'c', total_amount: 40000, order_status: 'Pending', payment_status: 'Pending', created_at: '2026-11-11T04:00:00Z' }, // belum bayar
    { id: 'd', total_amount: 30000, order_status: 'Cancelled', payment_status: 'Refunded', created_at: '2026-11-11T05:00:00Z' },
  ];
  const items = [
    { order_id: 'a', product_id: 'p1', product_name: 'Kopi Susu', quantity: 2, subtotal: 50000 },
    { order_id: 'b', product_id: 'p1', product_name: 'Kopi Susu', quantity: 1, subtotal: 25000 },
    { order_id: 'c', product_id: 'p2', product_name: 'Matcha', quantity: 2, subtotal: 40000 },
  ];

  it('Sales Report menghitung order lunas walau belum ditandai Completed', () => {
    const report = calculateSalesReport(orders, items);
    expect(report.totalRevenue).toBe(75000);
    expect(report.totalPaidOrders).toBe(2);
    expect(report.totalItemsSold).toBe(3);
    expect(report.topProducts.map((p) => p.productName)).toEqual(['Kopi Susu']);
  });

  it('Financial Report memakai aturan pengakuan omzet yang sama', () => {
    const fin = calculateFinancialReport(orders, [{ category: 'Operational', amount: 15000 }]);
    expect(fin.totalSales).toBe(75000);
    expect(fin.netProfit).toBe(60000);
  });

  it('Dashboard: omzet dari order lunas + hitungan order dalam proses & menunggu pembayaran', () => {
    const today = new Date('2026-11-11T06:00:00Z');
    const dashOrders = orders.map((o) => ({ ...o, order_number: o.id })) as DashboardOrder[];
    const m = calculateTodayDashboardMetrics(dashOrders, [], [], today);
    expect(m.todaySales).toBe(75000);
    expect(m.todayPaidOrderCount).toBe(2);
    expect(m.todayInProgressCount).toBe(2); // b (Processing) + c (Pending)
    expect(m.todayAwaitingPaymentCount).toBe(1); // c
  });

  it('getBulkCompletableOrders: hanya order Ready yang sudah lunas', () => {
    const list = [
      baseOrder({ id: '1', order_status: 'Ready', payment_status: 'Paid' }),
      baseOrder({ id: '2', order_status: 'Ready', payment_status: 'Pending' }),
      baseOrder({ id: '3', order_status: 'Processing', payment_status: 'Paid' }),
      baseOrder({ id: '4', order_status: 'Ready', payment_status: 'Paid' }),
    ];
    expect(getBulkCompletableOrders(list).map((o) => o.id)).toEqual(['1', '4']);
  });
});

// ============================================================================
// #2 KONFIRMASI PEMBAYARAN SEBELUM ORDER DIPROSES
// ============================================================================
describe('#2 Pembayaran dikonfirmasi kasir sebelum order diproses', () => {
  it('pesanan customer selalu dibuat Pending/Pending, termasuk QRIS', () => {
    expect(getCustomerOrderInitialStatus('QRIS')).toEqual({ order_status: 'Pending', payment_status: 'Pending' });
    expect(getCustomerOrderInitialStatus('Tunai')).toEqual({ order_status: 'Pending', payment_status: 'Pending' });
  });

  it('menolak memajukan order yang belum lunas ke Processing/Ready/Completed', () => {
    const r = canTransitionOrderStatus('Pending', 'Processing', 'Kasir', 'Pending');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/pembayaran/i);
    expect(canTransitionOrderStatus('Ready', 'Completed', 'Kasir', 'Pending').allowed).toBe(false);
  });

  it('mengizinkan transisi bila pembayaran sudah lunas, dan pembatalan tetap boleh', () => {
    expect(canTransitionOrderStatus('Pending', 'Processing', 'Kasir', 'Paid').allowed).toBe(true);
    expect(canTransitionOrderStatus('Pending', 'Cancelled', 'Kasir', 'Pending').allowed).toBe(true);
  });

  it('canConfirmPayment: hanya staf, hanya untuk order aktif yang belum lunas', () => {
    const pending = baseOrder({});
    expect(canConfirmPayment(pending, 'Kasir').allowed).toBe(true);
    expect(canConfirmPayment(pending, 'Admin').allowed).toBe(true);
    expect(canConfirmPayment(pending, 'Customer').allowed).toBe(false);
    expect(canConfirmPayment(baseOrder({ payment_status: 'Paid' }), 'Kasir').allowed).toBe(false);
    expect(canConfirmPayment(baseOrder({ order_status: 'Cancelled', payment_status: 'Pending' }), 'Kasir').allowed).toBe(false);
  });

  it('buildPaymentConfirmationUpdate: konfirmasi bayar sekaligus menerima order Pending', () => {
    expect(buildPaymentConfirmationUpdate(baseOrder({}))).toEqual({
      payment_status: 'Paid',
      order_status: 'Processing',
    });
    expect(buildPaymentConfirmationUpdate(baseOrder({ order_status: 'Ready' }))).toEqual({
      payment_status: 'Paid',
      order_status: 'Ready',
    });
  });

  describe.each([
    ['migration', 'supabase/migrations/20261111000002_payment_gate_and_customer_payment.sql'],
    ['schema', 'supabase/schema.sql'],
  ])('SQL %s', (_label, file) => {
    it('database menolak order maju ke Processing/Ready/Completed sebelum lunas', () => {
      const sql = normalize(read(file));
      expect(sql).toContain('create or replace function public.enforce_payment_before_processing()');
      expect(sql).toMatch(
        /create trigger enforce_payment_before_processing before insert or update on public\.orders for each row execute function public\.enforce_payment_before_processing\(\)/
      );
    });

    it("policy customer hanya mengizinkan payment_status = 'Pending'", () => {
      const sql = normalize(read(file));
      const start = sql.lastIndexOf('create policy "customers can create own orders"');
      const policy = sql.slice(start, sql.indexOf(';', start));
      expect(policy).toContain("payment_status = 'pending'");
      expect(policy).not.toContain("'paid'");
    });
  });

  it('layar customer tidak lagi menandai pesanan sebagai Paid sendiri', () => {
    expect(read('app/(customer)/product.tsx')).not.toMatch(/["']Paid["']/);
  });

  it('layar kasir menyediakan aksi konfirmasi pembayaran dan selesaikan massal', () => {
    const src = read('components/OrdersScreen.tsx'); // layar order dipakai bersama Kasir & Admin
    expect(src).toContain('buildPaymentConfirmationUpdate(');
    expect(src).toContain('getBulkCompletableOrders(');
  });
});

// ============================================================================
// #3 PEMBUATAN AKUN STAF LEWAT EDGE FUNCTION
// ============================================================================
describe('#3 Akun staf dibuat lewat Edge Function', () => {
  const valid = { email: 'kasir@fantasi.id', password: 'rahasia123', role: 'Kasir' as const, employeeId: null };

  it('menerima payload valid dan menormalkan email', () => {
    const r = validateStaffAccountPayload({ ...valid, email: '  Kasir@Fantasi.ID ' });
    expect(r.isValid).toBe(true);
    expect(r.value?.email).toBe('kasir@fantasi.id');
  });

  it('menolak email tidak valid, password pendek, dan role non-staf', () => {
    expect(validateStaffAccountPayload({ ...valid, email: 'bukan-email' }).errors.email).toBeDefined();
    expect(validateStaffAccountPayload({ ...valid, password: '123' }).errors.password).toBeDefined();
    expect(validateStaffAccountPayload({ ...valid, role: 'Customer' as never }).errors.role).toBeDefined();
  });

  it('Edge Function memverifikasi admin, membuat user terkonfirmasi, dan rollback bila gagal', () => {
    const src = read('supabase/functions/create-staff-user/index.ts');
    expect(src).toContain("withSupabase({ auth: 'user' }");
    expect(src).toContain("rpc('is_admin')");
    expect(src).toContain('auth.admin.createUser(');
    expect(src).toContain('email_confirm: true');
    expect(src).toContain('auth.admin.deleteUser(');
  });

  it('layar admin memanggil Edge Function, bukan auth.signUp (yang mengganti sesi admin)', () => {
    const src = read('app/(admin)/user.tsx');
    expect(src).not.toContain('auth.signUp(');
    expect(src).toContain("functions.invoke('create-staff-user'");
    expect(src).toContain('validateStaffAccountPayload(');
  });
});
