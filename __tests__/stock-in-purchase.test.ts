/**
 * #4 STOCK IN SEKALIGUS PENCATATAN BIAYA PEMBELIAN
 * - Stock In opsional ditandai sebagai pembelian (harga total per bahan).
 * - Mutasi stok + expense disimpan atomik lewat fungsi DB record_stock_in.
 * - Kasir boleh mencatat; ubah/hapus expense tetap khusus Admin.
 * - Expense bertanggal hari ini WIB (expense = uang keluar pada hari itu).
 */
import {
  parseRupiahInput,
  validateStockInPurchase,
  buildPurchaseExpenseDescription,
  buildRecordStockInParams,
} from '../lib/inventory-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('#4 Stock In sebagai pembelian (logika murni)', () => {
  it('parseRupiahInput mengabaikan titik ribuan, spasi, dan prefiks Rp', () => {
    expect(parseRupiahInput('90.000')).toBe(90000);
    expect(parseRupiahInput('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiahInput('')).toBe(0);
    expect(parseRupiahInput('abc')).toBe(0);
  });

  it('Stock In biasa (bukan pembelian) valid tanpa harga', () => {
    const r = validateStockInPurchase({ quantityText: '5000', isPurchase: false, amountText: '' });
    expect(r.isValid).toBe(true);
    expect(r.value).toEqual({ quantity: 5000, purchaseAmount: null });
  });

  it('pembelian wajib punya total harga > 0', () => {
    const r = validateStockInPurchase({ quantityText: '5000', isPurchase: true, amountText: '' });
    expect(r.isValid).toBe(false);
    expect(r.errors.amount).toMatch(/harga/i);
    expect(validateStockInPurchase({ quantityText: '5', isPurchase: true, amountText: '0' }).isValid).toBe(false);
  });

  it('pembelian valid mengembalikan jumlah dan harga', () => {
    const r = validateStockInPurchase({ quantityText: '2.5', isPurchase: true, amountText: '90.000' });
    expect(r.isValid).toBe(true);
    expect(r.value).toEqual({ quantity: 2.5, purchaseAmount: 90000 });
  });

  it('jumlah Stock In harus > 0', () => {
    for (const q of ['', '0', '-3', 'abc']) {
      const r = validateStockInPurchase({ quantityText: q, isPurchase: false, amountText: '' });
      expect(r.isValid).toBe(false);
      expect(r.errors.quantity).toBeDefined();
    }
  });

  it('deskripsi expense dibuat otomatis (format sama dengan fungsi DB)', () => {
    expect(buildPurchaseExpenseDescription('Susu Segar', 5000, 'ml')).toBe('Pembelian Susu Segar 5000 ml');
    expect(buildPurchaseExpenseDescription('Gula Aren', 2.5, 'kg')).toBe('Pembelian Gula Aren 2.5 kg');
  });

  it('parameter RPC record_stock_in', () => {
    expect(
      buildRecordStockInParams('inv-1', { quantity: 5000, purchaseAmount: 90000 }, '  Beli di pasar ')
    ).toEqual({ p_inventory_id: 'inv-1', p_quantity: 5000, p_notes: 'Beli di pasar', p_purchase_amount: 90000 });
    expect(
      buildRecordStockInParams('inv-1', { quantity: 10, purchaseAmount: null }, '')
    ).toEqual({ p_inventory_id: 'inv-1', p_quantity: 10, p_notes: null, p_purchase_amount: null });
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261111000004_stock_in_purchase_expense.sql'],
  ['schema', 'supabase/schema.sql'],
])('#4 SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('expense terhubung ke mutasi stok (satu Stock In = maksimal satu expense)', () => {
    expect(sql).toMatch(/stock_movement_id uuid unique references public\.stock_movements\(id\) on delete set null/);
  });

  it('record_stock_in: security definer, hanya staf, mengunci baris bahan', () => {
    expect(sql).toContain('create or replace function public.record_stock_in(');
    expect(sql).toMatch(/record_stock_in\([^)]*\) returns json language plpgsql security definer set search_path = public/);
    expect(sql).toContain('if not public.is_staff() then');
    expect(sql).toContain('for update');
  });

  it('expense pembelian: Raw Material, tanggal hari ini WIB, terhubung ke mutasi', () => {
    expect(sql).toContain("'raw material'");
    // Migration historis memakai Asia/Jakarta; schema & migration baru memakai business_today().
    expect(sql).toMatch(/public\.business_today\(\)|\(now\(\) at time zone 'asia\/jakarta'\)::date/);
    expect(sql).toMatch(/insert into public\.expenses \(description, category, amount, expense_date, created_by, stock_movement_id\)/);
  });

  it('hanya authenticated yang dapat memanggil record_stock_in', () => {
    expect(sql).toContain('revoke execute on function public.record_stock_in(uuid, numeric, text, numeric) from public, anon');
    expect(sql).toContain('grant execute on function public.record_stock_in(uuid, numeric, text, numeric) to authenticated');
  });
});

describe('#4 Integrasi layar', () => {
  it.each(['app/(admin)/inventory.tsx', 'app/(kasir)/inventory.tsx'])(
    '%s mencatat Stock In lewat RPC record_stock_in dengan opsi pembelian',
    (file) => {
      const src = read(file);
      expect(src).toMatch(/rpc\(\s*'record_stock_in'/);
      expect(src).toContain('<StockInPurchaseFields');
      expect(src).toContain('validateStockInPurchase(');
    }
  );

  it('daftar Expense menandai biaya yang berasal dari Stock In', () => {
    const src = read('app/(admin)/expense.tsx');
    expect(src).toContain('stock_movement_id');
    expect(src).toContain('Dari Stock In');
  });
});
