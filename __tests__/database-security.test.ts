/**
 * Invarian keamanan & integritas skema database (Supabase / PostgreSQL).
 *
 * Test ini membaca file SQL secara statis untuk memastikan:
 * - Customer bisa membuat pesanan sendiri (RLS INSERT) dengan batasan yang ketat.
 * - Nomor order dibuat di database secara atomik (bukan di klien).
 * - schema.sql aman dijalankan ulang (idempotent).
 * - Role `anon` tidak diberi hak tulis ke tabel publik.
 */
// Project tidak memakai @types/node; deklarasi minimal cukup untuk test berbasis Jest (Node).
declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;

const fs = require('fs');
const ROOT = `${__dirname}/..`;
const read = (rel: string) => fs.readFileSync(`${ROOT}/${rel}`, 'utf8');

const MIGRATION_FILE = 'supabase/migrations/20261111000001_customer_checkout_and_order_number.sql';
const EXPENSES_MIGRATION = 'supabase/migrations/20261109000001_iteration_3_expenses.sql';

const normalize = (sql: string) =>
  sql
    .replace(/--.*$/gm, '') // buang komentar baris
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** Ambil isi satu statement CREATE POLICY berdasarkan namanya. */
function getPolicy(sql: string, name: string): string {
  const norm = normalize(sql);
  const start = norm.indexOf(`create policy "${name.toLowerCase()}"`);
  if (start === -1) return '';
  const end = norm.indexOf(';', start);
  return norm.slice(start, end);
}

describe('KEAMANAN DATABASE: Checkout Customer & Nomor Order', () => {
  const sources = {
    migration: () => read(MIGRATION_FILE),
    schema: () => read('supabase/schema.sql'),
  };

  describe.each(Object.entries(sources))('%s', (_label, load) => {
    let sql: string;
    beforeAll(() => {
      sql = load();
    });

    it('mengizinkan customer aktif INSERT order miliknya sendiri berstatus Pending', () => {
      const policy = getPolicy(sql, 'Customers can create own orders');
      expect(policy).toContain('on public.orders for insert');
      expect(policy).toContain('public.is_active_customer()');
      // auth.uid() atau (select auth.uid()) — bentuk kedua dievaluasi sekali per query.
      expect(policy).toMatch(/user_id = (\(select auth\.uid\(\)\)|auth\.uid\(\))/);
      expect(policy).toContain("order_status = 'pending'");
      expect(policy).toContain('cancelled_by is null');
    });

    it('mengizinkan customer INSERT item hanya ke order Pending miliknya dengan harga resmi produk', () => {
      const policy = getPolicy(sql, 'Customers can add items to own pending orders');
      expect(policy).toContain('on public.order_items for insert');
      expect(policy).toMatch(/o\.user_id = (\(select auth\.uid\(\)\)|auth\.uid\(\))/);
      expect(policy).toContain("o.order_status = 'pending'");
      // Anti manipulasi harga dari klien
      expect(policy).toContain('p.price = order_items.unit_price');
      expect(policy).toContain("p.status = 'tersedia'");
      expect(policy).toContain('order_items.subtotal = order_items.unit_price * order_items.quantity');
    });

    it('membuat nomor order di database secara atomik lewat trigger BEFORE INSERT', () => {
      const norm = normalize(sql);
      expect(norm).toContain('create table if not exists public.order_number_counters');
      expect(norm).toMatch(/on conflict \(order_date\) do update set last_seq = c\.last_seq \+ 1/);
      expect(norm).toMatch(
        /create trigger assign_order_number_before_insert before insert on public\.orders for each row execute function public\.assign_order_number\(\)/
      );
      // Counter tidak boleh bisa diakses langsung oleh klien
      expect(norm).toContain('alter table public.order_number_counters enable row level security');
    });

    it('mendefinisikan handle_updated_at() sebelum dipakai trigger', () => {
      const norm = normalize(sql);
      const def = norm.indexOf('create or replace function public.handle_updated_at()');
      expect(def).toBeGreaterThan(-1);
    });
  });

  describe('supabase/schema.sql', () => {
    const sql = read('supabase/schema.sql');
    const norm = normalize(sql);

    it('idempotent: setiap CREATE POLICY didahului DROP POLICY IF EXISTS dengan nama yang sama', () => {
      const policies = [...norm.matchAll(/create policy "([^"]+)" on ([a-z_.]+)/g)];
      expect(policies.length).toBeGreaterThan(0);
      for (const [, name, table] of policies) {
        expect(norm).toContain(`drop policy if exists "${name}" on ${table}`);
      }
    });

    it('idempotent: setiap CREATE TRIGGER didahului DROP TRIGGER IF EXISTS', () => {
      const triggers = [...norm.matchAll(/create trigger ([a-z_]+) (?:before|after) [a-z ]+? on ([a-z_.]+)/g)];
      expect(triggers.length).toBeGreaterThan(0);
      for (const [, name, table] of triggers) {
        expect(norm).toContain(`drop trigger if exists ${name} on ${table}`);
      }
    });

    it('handle_updated_at() didefinisikan sebelum trigger pertama yang memakainya', () => {
      const def = norm.indexOf('create or replace function public.handle_updated_at()');
      const use = norm.indexOf('execute function public.handle_updated_at()');
      expect(def).toBeGreaterThan(-1);
      expect(def).toBeLessThan(use);
    });

    it('setiap tabel publik mengaktifkan Row Level Security', () => {
      const tables = [...norm.matchAll(/create table if not exists (public\.[a-z_]+)/g)].map((m) => m[1]);
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(norm).toContain(`alter table ${table} enable row level security`);
      }
    });

    it('tidak memberikan hak akses tabel ke role anon (semua policy hanya untuk authenticated)', () => {
      expect(norm).not.toMatch(/grant [a-z, ]+ on all tables in schema public to [a-z, ]*anon/);
      expect(norm).toContain('revoke all on all tables in schema public from anon');
    });
  });

  describe.each([
    ['migration hardening', 'supabase/migrations/20261111000003_harden_function_privileges.sql'],
    ['schema', 'supabase/schema.sql'],
  ])('Hak eksekusi fungsi (%s)', (_label, file) => {
    const TRIGGER_FUNCTIONS = [
      'apply_stock_movement',
      'assign_order_number',
      'enforce_payment_before_processing',
      'handle_employee_status_change',
      'handle_new_user',
      'handle_updated_at',
    ];
    const RLS_HELPERS = ['is_admin', 'is_staff', 'is_active_customer'];

    it.each(TRIGGER_FUNCTIONS)('fungsi trigger %s tidak bisa dipanggil lewat RPC', (fn) => {
      const sql = normalize(read(file));
      expect(sql).toContain(`revoke execute on function public.${fn}() from public, anon, authenticated`);
    });

    it.each(RLS_HELPERS)('helper RLS %s hanya untuk authenticated', (fn) => {
      const sql = normalize(read(file));
      expect(sql).toContain(`revoke execute on function public.${fn}() from public, anon`);
      expect(sql).toContain(`grant execute on function public.${fn}() to authenticated`);
    });

    it('handle_employee_status_change memakai search_path tetap', () => {
      const sql = normalize(read(file));
      expect(sql).toMatch(/alter function public\.handle_employee_status_change\(\) set search_path = public|create or replace function public\.handle_employee_status_change\(\) returns trigger language plpgsql security definer set search_path = public/);
    });
  });

  describe('migration expenses', () => {
    it('handle_updated_at() didefinisikan sebelum trigger set_expenses_updated_at', () => {
      const norm = normalize(read(EXPENSES_MIGRATION));
      const def = norm.indexOf('create or replace function public.handle_updated_at()');
      const use = norm.indexOf('execute function public.handle_updated_at()');
      expect(def).toBeGreaterThan(-1);
      expect(def).toBeLessThan(use);
    });
  });

  describe('Klien tidak lagi membuat nomor order sendiri', () => {
    it.each(['app/(kasir)/pos.tsx', 'app/(customer)/product.tsx'])(
      '%s tidak mengirim order_number saat insert dan membaca nomor dari database',
      (file) => {
        const src = read(file);
        expect(src).not.toMatch(/order_number\s*:/);
        expect(src).not.toContain('generateOrderNumber(');
        // Nomor order dibaca dari hasil database: .select(...) atau RPC create_order (audit iterasi 3).
        expect(src).toMatch(/\.select\([^)]*order_number|rpc\(\s*['"]create_order['"]/);
      }
    );
  });
});
