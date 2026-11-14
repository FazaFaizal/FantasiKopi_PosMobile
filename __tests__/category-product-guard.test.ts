/**
 * ATURAN KATEGORI & PRODUK (keputusan 2026-11-14)
 * - Kategori tidak dapat dinonaktifkan selama masih ada produk yang terhubung.
 * - Produk tidak dapat ditambahkan / dipindahkan / diaktifkan ke kategori Nonaktif.
 * Ditegakkan di aplikasi (pesan jelas) dan di database (trigger).
 */
import { canDeactivateCategory } from '../lib/category-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
const MIGRATION = 'supabase/migrations/20261114000002_category_product_guard.sql';

describe('canDeactivateCategory', () => {
  it('boleh dinonaktifkan bila tidak ada produk terhubung', () => {
    expect(canDeactivateCategory('Snack', 0)).toEqual({ allowed: true });
  });

  it('ditolak bila masih ada produk, dengan jumlah & saran tindakan', () => {
    const res = canDeactivateCategory('Snack', 3);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Snack');
    expect(res.reason).toContain('3 produk');
    expect(res.reason).toMatch(/pindahkan/i);
  });

  it('jumlah tidak valid dianggap 0', () => {
    expect(canDeactivateCategory('Snack', NaN as unknown as number).allowed).toBe(true);
  });
});

describe('Database menegakkan aturan kategori', () => {
  const sql = normalize(read(MIGRATION));
  const schema = normalize(read('supabase/schema.sql'));

  it('trigger penolak penonaktifan kategori yang masih dipakai produk', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create or replace function public.guard_category_deactivation()');
      expect(s).toContain('create trigger guard_category_deactivation before update on public.categories');
      expect(s).toMatch(/exists \(select 1 from public\.products p where p\.category_id = new\.id\)/);
    }
  });

  it('trigger penolak produk aktif di kategori nonaktif', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create or replace function public.guard_product_category_active()');
      expect(s).toContain('create trigger guard_product_category_active before insert or update on public.products');
    }
  });

  it('fungsi trigger tidak dapat dipanggil langsung', () => {
    expect(sql).toContain('revoke execute on function public.guard_category_deactivation() from public, anon, authenticated');
    expect(sql).toContain('revoke execute on function public.guard_product_category_active() from public, anon, authenticated');
  });
});

describe('Layar kategori', () => {
  const src = read('app/(admin)/category.tsx');

  it('memeriksa produk terhubung sebelum menonaktifkan', () => {
    expect(src).toContain('canDeactivateCategory(');
  });

  it('jumlah produk menghitung semua produk yang terhubung (sama dengan aturan database)', () => {
    expect(src).not.toMatch(/\.select\("id, category_id"\)\s*\.eq\("is_active", true\)/);
  });
});
