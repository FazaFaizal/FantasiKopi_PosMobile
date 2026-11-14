/**
 * AUDIT ITERASI 3 — LAPORAN, ORDER & ZONA WAKTU WITA
 * 1. Laporan dihitung di database per periode (tidak terpotong batas 1000 baris).
 * 2. Semua batas "hari" memakai WITA (Asia/Makassar, UTC+8) dari satu sumber.
 * 3+4. Order & item disimpan atomik lewat create_order; harga & total dihitung database.
 * 5. Policy customer/expense memakai (select auth.uid()); index FK yang hilang.
 * 6. Tombol ikon ≥ 44px dan label aksesibilitas di dashboard/report.
 */
import {
  BUSINESS_TIMEZONE,
  getBusinessDateString,
  getBusinessDayStartISO,
  getBusinessDayRangeISO,
} from '../lib/timezone';
import { getReportDateRange, mapSalesSummary } from '../lib/report-logic';
import { calculateTodayDashboardMetrics, DashboardOrder } from '../lib/dashboard-logic';
import { buildCreateOrderParams } from '../lib/pos-logic';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
  readdirSync(dir: string): string[];
};
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('Zona waktu bisnis: WITA', () => {
  it('Asia/Makassar (UTC+8)', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Makassar');
  });

  it('tanggal bisnis berganti pukul 00:00 WITA (16:00 UTC)', () => {
    expect(getBusinessDateString(new Date('2026-11-11T15:59:00Z'))).toBe('2026-11-11');
    expect(getBusinessDateString(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12');
  });

  it('awal hari & rentang hari dalam UTC (untuk query created_at)', () => {
    expect(getBusinessDayStartISO('2026-11-12')).toBe('2026-11-11T16:00:00.000Z');
    expect(getBusinessDayRangeISO('2026-11-12', '2026-11-12')).toEqual({
      startISO: '2026-11-11T16:00:00.000Z',
      endISO: '2026-11-12T16:00:00.000Z',
    });
  });
});

describe('Periode laporan (getReportDateRange)', () => {
  const now = new Date('2026-11-12T17:00:00Z'); // 13 Nov 01:00 WITA

  it.each([
    ['Hari Ini', { from: '2026-11-13', to: '2026-11-13' }],
    ['7 Hari Terakhir', { from: '2026-11-06', to: '2026-11-13' }],
    ['Bulan Ini', { from: '2026-11-01', to: '2026-11-13' }],
    ['Semua', { from: null, to: null }],
  ] as const)('%s', (period, expected) => {
    expect(getReportDateRange(period, now)).toEqual(expected);
  });
});

describe('mapSalesSummary (hasil RPC get_sales_summary → tampilan)', () => {
  it('menghitung rata-rata order, laba bersih, margin & persentase kategori', () => {
    const { salesReport, financialReport } = mapSalesSummary({
      total_revenue: 200000,
      paid_orders: 4,
      items_sold: 9,
      top_products: [{ product_id: 'p1', product_name: 'Kopi Susu', quantity_sold: 6, total_revenue: 120000 }],
      total_expenses: 50000,
      expenses_by_category: [
        { category: 'Raw Material', amount: 40000 },
        { category: 'Operational', amount: 10000 },
      ],
    });
    expect(salesReport).toEqual({
      totalRevenue: 200000,
      totalPaidOrders: 4,
      totalItemsSold: 9,
      averageOrderValue: 50000,
      topProducts: [{ productId: 'p1', productName: 'Kopi Susu', quantitySold: 6, totalRevenue: 120000 }],
    });
    expect(financialReport.netProfit).toBe(150000);
    expect(financialReport.profitMargin).toBe(75);
    const raw = financialReport.categoryBreakdown.find((c) => c.category === 'Raw Material');
    expect(raw?.totalAmount).toBe(40000);
    expect(raw?.percentage).toBe(80);
    expect(financialReport.categoryBreakdown.find((c) => c.category === 'Equipment')?.totalAmount).toBe(0);
  });

  it('aman untuk hasil kosong', () => {
    const { salesReport, financialReport } = mapSalesSummary(null);
    expect(salesReport.totalRevenue).toBe(0);
    expect(salesReport.averageOrderValue).toBe(0);
    expect(financialReport.profitMargin).toBe(0);
  });
});

describe('Dashboard memakai hari WITA', () => {
  it('order 00:30 WITA dihitung sebagai hari ini, bukan kemarin', () => {
    const today = new Date('2026-11-12T03:00:00Z'); // 12 Nov 11:00 WITA
    const orders: DashboardOrder[] = [
      { id: 'a', order_number: 'A', order_status: 'Completed', payment_status: 'Paid', total_amount: 10000, created_at: '2026-11-11T16:30:00Z' },
      { id: 'b', order_number: 'B', order_status: 'Completed', payment_status: 'Paid', total_amount: 99000, created_at: '2026-11-11T15:30:00Z' },
    ];
    const m = calculateTodayDashboardMetrics(orders, [{ id: 'e', description: 'x', amount: 5000, category: 'Other', expense_date: '2026-11-12' }], [], today);
    expect(m.todayOrderCount).toBe(1);
    expect(m.todaySales).toBe(10000);
    expect(m.todayExpenses).toBe(5000);
  });
});

describe('buildCreateOrderParams', () => {
  it('hanya mengirim produk, jumlah & catatan (harga dihitung database)', () => {
    const params = buildCreateOrderParams(
      [
        { productId: 'p1', productName: 'Kopi', unitPrice: 18000, quantity: 2, notes: ' less sugar ' },
        { productId: 'p2', productName: 'Roti', unitPrice: 15000, quantity: 1 },
      ],
      { customerName: ' Budi ', orderType: 'Take Away', paymentMethod: 'Tunai', notes: '' }
    );
    expect(params).toEqual({
      p_items: [
        { product_id: 'p1', quantity: 2, notes: 'less sugar' },
        { product_id: 'p2', quantity: 1, notes: null },
      ],
      p_customer_name: 'Budi',
      p_order_type: 'Take Away',
      p_payment_method: 'Tunai',
      p_notes: null,
    });
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261113000005_iteration3_reports_orders_wita.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('satu sumber zona waktu: Asia/Makassar', () => {
    expect(sql).toContain("create or replace function public.business_timezone()");
    expect(sql).toContain("select 'asia/makassar'::text");
    expect(sql).toContain('create or replace function public.business_today()');
    expect(sql).not.toContain('asia/jakarta');
  });

  it('nomor order, expense Stock In, sif & policy expense memakai business_today()', () => {
    expect(sql).toContain('v_date date := public.business_today()');
    expect(sql).toContain('expense_date = (select public.business_today())');
    expect(sql).toMatch(/new\.expense_date = public\.business_today\(\)/);
  });

  it('create_order: atomik, harga & total dari database, security invoker', () => {
    const start = sql.indexOf('create or replace function public.create_order(');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('security invoker');
    expect(body).toContain('p.price');
    expect(body).toContain("p.status = 'tersedia'");
    expect(body).toContain('insert into public.order_items');
    expect(sql).toContain('grant execute on function public.create_order(jsonb, text, text, text, text) to authenticated');
  });

  it('get_sales_summary: khusus Admin, rentang memakai zona waktu bisnis', () => {
    const start = sql.indexOf('create or replace function public.get_sales_summary(');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('public.is_admin()');
    expect(body).toContain('at time zone public.business_timezone()');
    expect(body).toContain("o.payment_status = 'paid'");
  });

  it('policy customer memakai (select auth.uid()) & index FK', () => {
    expect(sql).toContain('using ((select auth.uid()) = user_id)');
    for (const idx of [
      'idx_orders_cancelled_by on public.orders(cancelled_by)',
      'idx_expenses_created_by on public.expenses(created_by)',
      'idx_cash_shifts_opened_by on public.cash_shifts(opened_by)',
      'idx_cash_shifts_closed_by on public.cash_shifts(closed_by)',
    ]) {
      expect(sql).toContain(`create index if not exists ${idx}`);
    }
  });
});

describe('Integrasi layar', () => {
  it.each(['app/(kasir)/pos.tsx', 'app/(customer)/product.tsx'])('%s menyimpan order lewat create_order', (file) => {
    const src = read(file);
    expect(src).toMatch(/rpc\(\s*'create_order'|rpc\(\s*"create_order"/);
    expect(src).toContain('buildCreateOrderParams(');
    expect(src).not.toMatch(/from\(['"]order_items['"]\)\s*\.insert/);
    expect(src).not.toMatch(/from\(['"]orders['"]\)\s*\.insert/);
  });

  it('laporan memakai get_sales_summary per periode', () => {
    const src = read('app/(admin)/report.tsx');
    expect(src).toMatch(/rpc\(\s*["']get_sales_summary["']/);
    expect(src).toContain('getReportDateRange(');
    expect(src).not.toContain('toISOString().split("T")[0]');
  });

  it('dashboard hanya mengambil order hari ini (WITA)', () => {
    expect(read('app/(admin)/dashboard.tsx')).toContain('getBusinessDayRangeISO(');
  });

  it('tidak ada lagi helper WIB di aplikasi', () => {
    for (const f of ['components/DailyCashScreen.tsx', 'app/(admin)/expense.tsx', 'lib/cash-logic.ts']) {
      expect(read(f)).not.toMatch(/getWIB|WIB_OFFSET/);
    }
  });

  // Hanya TOMBOL (TouchableOpacity) yang diperiksa; wadah ikon hiasan (View) boleh 32px.
  it.each(['app/(admin)/dashboard.tsx', 'app/(admin)/expense.tsx', 'app/(admin)/report.tsx', 'app/(kasir)/pos.tsx'])(
    '%s tanpa tombol 32px',
    (file) => {
      expect(read(file)).not.toMatch(/<TouchableOpacity(?:(?!>)[\s\S])*?className="w-8 h-8/);
    }
  );

  it.each(['app/(admin)/dashboard.tsx', 'app/(admin)/report.tsx'])('%s punya label aksesibilitas', (file) => {
    expect(read(file)).toContain('accessibilityLabel=');
  });
});
