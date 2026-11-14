/**
 * KAS HARIAN
 * - Kasir mencatat pengeluaran harian (hari ini WITA, dibayar dari kas laci).
 * - Rekap kas: penjualan tunai lunas − pengeluaran dari kas = uang seharusnya di laci.
 * - Expense punya penanda paid_from_cash (Admin dapat mematikan untuk transfer/sumber lain).
 */
import { getBusinessDateString, getBusinessDayStartISO } from '../lib/timezone';
import {
  calculateDailyCashRecap,
  calculateCashDifference,
  validateCashExpense,
} from '../lib/cash-logic';
import { SIDEBAR_NAV_ITEMS, KASIR_NAV_ITEMS } from '../components/SidebarDrawer';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('Tanggal bisnis (WITA)', () => {
  it('getBusinessDateString memakai UTC+8, bukan zona waktu perangkat/server', () => {
    expect(getBusinessDateString(new Date('2026-11-11T15:59:00Z'))).toBe('2026-11-11');
    expect(getBusinessDateString(new Date('2026-11-11T16:00:00Z'))).toBe('2026-11-12'); // 00:00 WITA
  });

  it('getBusinessDayStartISO: awal hari WITA dalam UTC (untuk query created_at)', () => {
    expect(getBusinessDayStartISO('2026-11-12')).toBe('2026-11-11T16:00:00.000Z');
  });
});

describe('Rekap kas harian (calculateDailyCashRecap)', () => {
  const orders = [
    // hari ini WITA (12 Nov)
    { payment_method: 'Tunai', payment_status: 'Paid', order_status: 'Completed', total_amount: 50000, created_at: '2026-11-11T18:00:00Z' },
    { payment_method: 'Tunai', payment_status: 'Paid', order_status: 'Processing', total_amount: 25000, created_at: '2026-11-12T02:00:00Z' },
    { payment_method: 'QRIS', payment_status: 'Paid', order_status: 'Ready', total_amount: 40000, created_at: '2026-11-12T03:00:00Z' },
    { payment_method: 'Tunai', payment_status: 'Pending', order_status: 'Pending', total_amount: 30000, created_at: '2026-11-12T04:00:00Z' }, // belum bayar
    { payment_method: 'Tunai', payment_status: 'Refunded', order_status: 'Cancelled', total_amount: 20000, created_at: '2026-11-12T05:00:00Z' }, // dikembalikan
    // kemarin WITA (11 Nov 23:00 WITA)
    { payment_method: 'Tunai', payment_status: 'Paid', order_status: 'Completed', total_amount: 99000, created_at: '2026-11-11T15:00:00Z' },
  ];
  const expenses = [
    { amount: 15000, expense_date: '2026-11-12', paid_from_cash: true },
    { amount: 90000, expense_date: '2026-11-12', paid_from_cash: true },
    { amount: 500000, expense_date: '2026-11-12', paid_from_cash: false }, // transfer
    { amount: 7000, expense_date: '2026-11-11', paid_from_cash: true }, // kemarin
  ];

  const recap = calculateDailyCashRecap(orders, expenses, '2026-11-12');

  it('memisahkan penjualan tunai & QRIS yang sudah lunas pada hari WITA tersebut', () => {
    expect(recap.cashSales).toBe(75000);
    expect(recap.cashOrderCount).toBe(2);
    expect(recap.qrisSales).toBe(40000);
    expect(recap.qrisOrderCount).toBe(1);
    expect(recap.totalSales).toBe(115000);
  });

  it('memisahkan pengeluaran dari kas laci dan dari sumber lain', () => {
    expect(recap.cashExpenses).toBe(105000);
    expect(recap.otherExpenses).toBe(500000);
  });

  it('uang seharusnya di laci = penjualan tunai − pengeluaran dari kas', () => {
    expect(recap.expectedCash).toBe(-30000);
  });

  it('menghitung order yang masih menunggu pembayaran', () => {
    expect(recap.awaitingPaymentCount).toBe(1);
  });
});

describe('Selisih kas (calculateCashDifference)', () => {
  it('kosong → belum dihitung', () => {
    expect(calculateCashDifference(100000, '')).toBeNull();
  });
  it('pas, lebih, kurang', () => {
    expect(calculateCashDifference(100000, '100.000')).toEqual({ counted: 100000, difference: 0, status: 'Pas' });
    expect(calculateCashDifference(100000, '105000')).toEqual({ counted: 105000, difference: 5000, status: 'Lebih' });
    expect(calculateCashDifference(100000, 'Rp 98.000')).toEqual({ counted: 98000, difference: -2000, status: 'Kurang' });
  });
});

describe('Pengeluaran harian kasir (validateCashExpense)', () => {
  const now = new Date('2026-11-12T03:00:00Z');

  it('payload valid: tanggal hari ini WIB, dari kas laci, tercatat atas nama pengguna', () => {
    const r = validateCashExpense({ description: ' Es batu 2 kantong ', category: 'Raw Material', amountText: '15.000' }, 'kasir-1', now);
    expect(r.isValid).toBe(true);
    expect(r.payload).toEqual({
      description: 'Es batu 2 kantong',
      category: 'Raw Material',
      amount: 15000,
      expense_date: '2026-11-12',
      created_by: 'kasir-1',
      paid_from_cash: true,
    });
  });

  it('menolak deskripsi kosong dan nominal 0', () => {
    const r = validateCashExpense({ description: '', category: 'Operational', amountText: '' }, 'kasir-1', now);
    expect(r.isValid).toBe(false);
    expect(r.errors.description).toBeDefined();
    expect(r.errors.amount).toBeDefined();
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261111000005_daily_cash_expenses.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL kas harian (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('kolom paid_from_cash (default dari kas laci)', () => {
    expect(sql).toContain('add column if not exists paid_from_cash boolean not null default true');
  });

  it('staf hanya dapat melihat pengeluaran hari ini (WIB)', () => {
    const start = sql.indexOf('create policy "staff can view expenses today"');
    const policy = sql.slice(start, sql.indexOf(';', start));
    expect(start).toBeGreaterThan(-1);
    expect(policy).toContain('for select');
    expect(policy).toContain('public.is_staff()');
    // Migration historis memakai Asia/Jakarta; schema & migration baru memakai business_today().
    expect(policy).toMatch(/expense_date = (\(select public\.business_today\(\)\)|\(now\(\) at time zone 'asia\/jakarta'\)::date)/);
  });

  it('staf hanya dapat mencatat pengeluaran kas hari ini atas namanya sendiri', () => {
    const start = sql.indexOf('create policy "staff can record cash expenses today"');
    const policy = sql.slice(start, sql.indexOf(';', start));
    expect(start).toBeGreaterThan(-1);
    expect(policy).toContain('for insert');
    expect(policy).toContain('public.is_staff()');
    // Migration historis memakai Asia/Jakarta; schema & migration baru memakai business_today().
    expect(policy).toMatch(/expense_date = (\(select public\.business_today\(\)\)|\(now\(\) at time zone 'asia\/jakarta'\)::date)/);
    expect(policy).toMatch(/created_by = (\(select auth\.uid\(\)\)|auth\.uid\(\))/);
    expect(policy).toContain('paid_from_cash = true');
    expect(policy).toContain('stock_movement_id is null');
  });
});

describe('Integrasi layar & navigasi', () => {
  it('menu Kas Harian tersedia untuk Kasir dan Admin', () => {
    expect(KASIR_NAV_ITEMS.main.map((i) => i.route)).toContain('/(kasir)/cash');
    expect(SIDEBAR_NAV_ITEMS.main.map((i) => i.route)).toContain('/(admin)/cash');
  });

  it.each(['app/(kasir)/cash.tsx', 'app/(admin)/cash.tsx'])('%s memakai layar Kas Harian bersama', (file) => {
    expect(read(file)).toContain('<DailyCashScreen');
  });

  it('layar Kas Harian memakai rekap & validasi dari cash-logic', () => {
    const src = read('components/DailyCashScreen.tsx');
    expect(src).toContain('calculateDailyCashRecap(');
    expect(src).toContain('calculateCashDifference(');
    expect(src).toContain('validateCashExpense(');
  });

  it('form Expense Admin: tanggal default WIB & penanda dibayar dari kas', () => {
    const src = read('app/(admin)/expense.tsx');
    expect(src).toContain('getBusinessDateString(');
    expect(src).toContain('paid_from_cash');
    expect(src).not.toContain('new Date().toISOString().split("T")[0]');
  });
});
