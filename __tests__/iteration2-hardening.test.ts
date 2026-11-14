/**
 * AUDIT ITERASI 2 — PENGERASAN BAHAN BAKU & PRODUK
 * 1. Angka stok hanya berubah lewat riwayat mutasi (tidak bisa ditimpa langsung).
 * 2. Stock Out & Opname dihitung di database (record_stock_movement), dengan baris terkunci.
 * 3. Non-Admin hanya boleh mengubah kolom status produk.
 * 4. Bahan baku punya status Aktif/Nonaktif (is_active); sisa soft delete → Nonaktif, bukan dihapus.
 * 5. Policy memakai (select ...) & index stock_movements.user_id.
 * 6. Area sentuh tombol ikon di layar produk ≥ 44px.
 */
import { buildStockMovementParams } from '../lib/inventory-logic';
import { calculateTodayDashboardMetrics } from '../lib/dashboard-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('buildStockMovementParams (Stock Out & Opname)', () => {
  const base = { inventoryId: 'inv-1', currentStock: 1000, notes: 'Pemakaian harian' };

  it('Stock Out valid', () => {
    const r = buildStockMovementParams({ ...base, type: 'Stock Out', quantityText: '250' });
    expect(r.isValid).toBe(true);
    expect(r.params).toEqual({
      p_inventory_id: 'inv-1',
      p_movement_type: 'Stock Out',
      p_quantity: 250,
      p_notes: 'Pemakaian harian',
    });
  });

  it('Stock Out: jumlah > 0 dan tidak melebihi stok', () => {
    expect(buildStockMovementParams({ ...base, type: 'Stock Out', quantityText: '0' }).errors.quantity).toBeDefined();
    expect(buildStockMovementParams({ ...base, type: 'Stock Out', quantityText: '1001' }).errors.quantity).toMatch(/tidak mencukupi/i);
  });

  it('keterangan wajib untuk Stock Out & Opname', () => {
    expect(buildStockMovementParams({ ...base, notes: ' ', type: 'Stock Out', quantityText: '1' }).errors.notes).toBeDefined();
    expect(buildStockMovementParams({ ...base, notes: '', type: 'Stock Adjustment', quantityText: '900' }).errors.notes).toBeDefined();
  });

  it('Opname memakai stok fisik aktual; 0 diperbolehkan (bahan habis)', () => {
    const r = buildStockMovementParams({ ...base, notes: 'Hitung fisik', type: 'Stock Adjustment', quantityText: '0' });
    expect(r.isValid).toBe(true);
    expect(r.params?.p_quantity).toBe(0);
  });

  it('Opname ditolak jika sama dengan stok sistem atau negatif', () => {
    expect(buildStockMovementParams({ ...base, type: 'Stock Adjustment', quantityText: '1000' }).errors.quantity).toMatch(/sama/i);
    expect(buildStockMovementParams({ ...base, type: 'Stock Adjustment', quantityText: '-1' }).errors.quantity).toBeDefined();
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261113000004_iteration2_inventory_hardening.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('angka stok hanya boleh berubah lewat mutasi', () => {
    expect(sql).toMatch(/create trigger guard_inventory_stock_change before update on public\.inventory_items/);
    expect(sql).toContain("set_config('app.stock_movement', 'on', true)");
  });

  it('record_stock_movement: security definer, staf, baris terkunci', () => {
    const start = sql.indexOf('create or replace function public.record_stock_movement(');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    expect(body).toContain('security definer');
    expect(body).toContain('if not public.is_staff() then');
    expect(body).toContain('for update');
    expect(sql).toContain('grant execute on function public.record_stock_movement(uuid, text, numeric, text) to authenticated');
  });

  it('riwayat mutasi tidak bisa ditulis langsung dari aplikasi', () => {
    expect(sql).not.toContain('create policy "staff can insert stock movements"');
  });

  it('non-Admin hanya boleh mengubah status produk', () => {
    expect(sql).toMatch(/create trigger guard_product_staff_update before update on public\.products/);
    expect(sql).toContain("- 'status' - 'updated_at'");
  });

  it('bahan baku Aktif/Nonaktif: hanya Admin yang mengubah; nonaktif tidak bisa dimutasi', () => {
    expect(sql).toContain('add column if not exists is_active boolean not null default true');
    expect(sql).toContain('new.is_active is distinct from old.is_active');
    expect(sql).toMatch(/record_stock_movement[\s\S]*not v_item\.is_active/);
    // Fungsi yang disalin tidak boleh kehilangan dollar-quote ($$ → $).
    expect(sql).not.toMatch(/ as \$ | \$;/);
    expect(sql).toMatch(/where id = p_inventory_id and is_active = true/);
    expect(sql).toContain('using ((select public.is_staff()) and (is_active or (select public.is_admin())))');
  });

  it('policy memakai (select ...) & index stock_movements.user_id', () => {
    expect(sql).toContain('using ((select public.is_staff()))');
    expect(sql).toContain('create index if not exists idx_stock_movements_user_id on public.stock_movements(user_id)');
  });
});

describe('Migration: sisa soft delete menjadi Nonaktif (tidak dihapus)', () => {
  it('tidak menghapus data; menandai bahan lama sebagai nonaktif', () => {
    const sql = normalize(read('supabase/migrations/20261113000004_iteration2_inventory_hardening.sql'));
    expect(sql).not.toContain('delete from public.inventory_items');
    expect(sql).toContain('update public.inventory_items set is_active = false where is_deleted');
  });
});

describe('Dashboard mengabaikan bahan nonaktif', () => {
  it('bahan nonaktif tidak dihitung dalam status stok', () => {
    const m = calculateTodayDashboardMetrics([], [], [
      { id: 'a', name: 'Susu', current_stock: 0, min_stock: 5, is_active: true },
      { id: 'b', name: 'Paper Cup', current_stock: 0, min_stock: 5, is_active: false },
    ]);
    expect(m.outOfStockCount).toBe(1);
  });
});

describe('Integrasi layar', () => {
  it.each(['app/(admin)/inventory.tsx', 'app/(kasir)/inventory.tsx'])('%s memakai RPC dan tidak menulis stok langsung', (file) => {
    const src = read(file);
    expect(src).toMatch(/rpc\(\s*'record_stock_movement'/);
    expect(src).toContain('buildStockMovementParams(');
    expect(src).not.toContain('current_stock: after');
    expect(src).not.toMatch(/from\('stock_movements'\)\s*\.insert/);
    expect(src).not.toContain("eq('is_deleted', false)");
  });

  it('kasir hanya memuat bahan aktif; Admin bisa mengaktifkan/menonaktifkan', () => {
    expect(read('app/(kasir)/inventory.tsx')).toContain(".eq('is_active', true)");
    const admin = read('app/(admin)/inventory.tsx');
    expect(admin).toContain('handleToggleActive(');
    expect(admin).toContain('Nonaktif');
    expect(admin).not.toMatch(/className="p-1.5 rounded-button bg-danger-soft/);
    expect(read('app/(admin)/dashboard.tsx')).not.toContain('is_deleted');
  });

  it('layar produk: tombol filter status setinggi minimal 44px (min-h-11)', () => {
    const src = read('app/(admin)/product.tsx');
    expect(src).not.toMatch(/p-1\.5 rounded-full|w-8 h-8/);
    expect(src).toContain('flex-1 min-h-11 py-1.5 rounded-chip');
    expect(src).toContain('accessibilityState={{ selected: active }}');
  });
});
