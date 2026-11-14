/**
 * SIF KASIR (BUKA / TUTUP SIF)
 * - Satu laci, sif bergantian; uang terakumulasi lintas sif.
 * - Modal awal sif = sisa kas sif sebelumnya (dihitung − disetor); jika berbeda wajib catatan.
 * - Kas seharusnya = modal awal + tunai diterima − refund tunai − pengeluaran dari kas.
 * - Tutup sif dengan selisih wajib catatan; yang boleh menutup: kasir pembuka atau Admin.
 * - POS terkunci tanpa sif aktif.
 */
import {
  getSuggestedOpeningCash,
  validateOpenShift,
  calculateShiftExpectedCash,
  validateCloseShift,
  canCloseShift,
  isPosLocked,
} from '../lib/shift-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('Buka sif', () => {
  it('modal awal disarankan = uang dihitung − disetor pada sif terakhir', () => {
    expect(getSuggestedOpeningCash(null)).toBeNull();
    expect(getSuggestedOpeningCash({ counted_cash: 1200000, cash_withdrawn: 0 })).toBe(1200000);
    expect(getSuggestedOpeningCash({ counted_cash: 2500000, cash_withdrawn: 2300000 })).toBe(200000);
  });

  it('modal awal wajib angka ≥ 0', () => {
    expect(validateOpenShift({ openingText: '', noteText: '', suggested: null }).errors.opening).toBeDefined();
    expect(validateOpenShift({ openingText: '0', noteText: '', suggested: null }).isValid).toBe(true);
  });

  it('sif pertama: modal awal bebas tanpa catatan', () => {
    const r = validateOpenShift({ openingText: '200.000', noteText: '', suggested: null });
    expect(r).toEqual({ isValid: true, errors: {}, params: { p_opening_cash: 200000, p_note: null } });
  });

  it('modal awal sama dengan sisa sif sebelumnya → tanpa catatan', () => {
    expect(validateOpenShift({ openingText: '1.200.000', noteText: '', suggested: 1200000 }).isValid).toBe(true);
  });

  it('modal awal berbeda dari sisa sif sebelumnya → wajib catatan', () => {
    const r = validateOpenShift({ openingText: '1.150.000', noteText: ' ', suggested: 1200000 });
    expect(r.isValid).toBe(false);
    expect(r.errors.note).toMatch(/catatan/i);
    const ok = validateOpenShift({ openingText: '1.150.000', noteText: 'Uang kembalian ditukar', suggested: 1200000 });
    expect(ok.params).toEqual({ p_opening_cash: 1150000, p_note: 'Uang kembalian ditukar' });
  });
});

describe('Kas seharusnya selama sif', () => {
  it('modal awal + tunai diterima − refund tunai − pengeluaran kas', () => {
    expect(
      calculateShiftExpectedCash({ openingCash: 200000, cashIn: 1150000, cashRefunds: 50000, cashExpenses: 100000 })
    ).toBe(1200000);
  });
});

describe('Tutup sif', () => {
  it('kas cocok → tanpa catatan', () => {
    const r = validateCloseShift({ countedText: '1.200.000', withdrawnText: '', noteText: '', expectedCash: 1200000 });
    expect(r.isValid).toBe(true);
    expect(r.difference).toBe(0);
    expect(r.params).toEqual({ p_counted: 1200000, p_withdrawn: 0, p_note: null });
  });

  it('ada selisih → wajib catatan', () => {
    const r = validateCloseShift({ countedText: '1.195.000', withdrawnText: '', noteText: '', expectedCash: 1200000 });
    expect(r.isValid).toBe(false);
    expect(r.difference).toBe(-5000);
    expect(r.errors.note).toMatch(/selisih/i);
    expect(
      validateCloseShift({ countedText: '1.195.000', withdrawnText: '', noteText: 'Kembalian salah', expectedCash: 1200000 }).isValid
    ).toBe(true);
  });

  it('uang disetor tidak boleh melebihi uang dihitung', () => {
    const r = validateCloseShift({ countedText: '2.500.000', withdrawnText: '3.000.000', noteText: '', expectedCash: 2500000 });
    expect(r.errors.withdrawn).toBeDefined();
    const ok = validateCloseShift({ countedText: '2.500.000', withdrawnText: '2.300.000', noteText: '', expectedCash: 2500000 });
    expect(ok.params).toEqual({ p_counted: 2500000, p_withdrawn: 2300000, p_note: null });
  });

  it('uang dihitung wajib diisi', () => {
    expect(validateCloseShift({ countedText: '', withdrawnText: '', noteText: '', expectedCash: 0 }).errors.counted).toBeDefined();
  });

  it('yang boleh menutup: kasir pembuka atau Admin', () => {
    const shift = { opened_by: 'kasir-1' };
    expect(canCloseShift(shift, { id: 'kasir-1', role: 'Kasir' })).toBe(true);
    expect(canCloseShift(shift, { id: 'kasir-2', role: 'Kasir' })).toBe(false);
    expect(canCloseShift(shift, { id: 'admin-1', role: 'Admin' })).toBe(true);
  });
});

describe('POS', () => {
  it('terkunci tanpa sif aktif', () => {
    expect(isPosLocked(null)).toBe(true);
    expect(isPosLocked({ id: 's1', status: 'Open' })).toBe(false);
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261111000006_cash_shifts.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL sif kasir (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('tabel cash_shifts dengan RLS dan hanya satu sif terbuka', () => {
    expect(sql).toContain('create table if not exists public.cash_shifts');
    expect(sql).toContain('alter table public.cash_shifts enable row level security');
    expect(sql).toMatch(/create unique index if not exists uniq_cash_shifts_one_open on public\.cash_shifts \(\(true\)\) where status = 'open'/);
  });

  it('pembayaran & refund dicatat ke sif aktif (dan ditolak tanpa sif)', () => {
    expect(sql).toContain('add column if not exists paid_shift_id uuid references public.cash_shifts(id)');
    expect(sql).toContain('add column if not exists refunded_shift_id uuid references public.cash_shifts(id)');
    expect(sql).toMatch(/create trigger track_order_payment_shift before insert or update on public\.orders/);
    expect(sql).toContain('sif kasir belum dibuka');
  });

  it('pengeluaran dari kas dicatat ke sif aktif', () => {
    expect(sql).toContain('add column if not exists shift_id uuid references public.cash_shifts(id)');
    expect(sql).toMatch(/create trigger assign_expense_shift before insert or update on public\.expenses/);
  });

  it.each(['open_cash_shift', 'close_cash_shift', 'get_shift_summary'])('fungsi %s: security definer & hanya staf', (fn) => {
    const start = sql.indexOf(`create or replace function public.${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('security definer');
    expect(body).toContain('set search_path = public');
    expect(body).toContain('public.is_staff()');
  });

  it('tutup sif: selisih wajib catatan, hanya pembuka atau admin', () => {
    const start = sql.indexOf('create or replace function public.close_cash_shift(');
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('public.is_admin()');
    expect(body).toContain('for update');
    expect(body).toMatch(/v_difference <> 0 and nullif\(btrim\(p_note\), ''\) is null/);
  });
});

describe('Integrasi layar', () => {
  it('POS terkunci sampai sif dibuka', () => {
    const src = read('app/(kasir)/pos.tsx');
    expect(src).toContain('isPosLocked(');
    expect(src).toContain('<ShiftRequiredNotice');
  });

  it('layar Kas memakai RPC buka/tutup sif & ringkasan sif', () => {
    const src = read('components/DailyCashScreen.tsx');
    expect(src).toMatch(/rpc\(\s*'open_cash_shift'/);
    expect(src).toMatch(/rpc\(\s*'close_cash_shift'/);
    expect(src).toMatch(/rpc\(\s*'get_shift_summary'/);
    expect(src).toContain('validateOpenShift(');
    expect(src).toContain('validateCloseShift(');
  });
});
