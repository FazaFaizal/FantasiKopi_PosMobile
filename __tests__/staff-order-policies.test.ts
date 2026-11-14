/**
 * AUDIT ITERASI 3 — KRITIS
 * Di server, policy "Staff can manage orders" / "Staff can manage order items"
 * ternyata USING (true): customer yang login bisa membaca, mengubah, dan menghapus
 * semua order. Policy staf wajib dibatasi is_staff() untuk USING dan WITH CHECK.
 */
declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

function policy(sql: string, name: string): string {
  const start = sql.lastIndexOf(`create policy "${name.toLowerCase()}"`);
  if (start < 0) return '';
  return sql.slice(start, sql.indexOf(';', start));
}

describe.each([
  ['migration', 'supabase/migrations/20261113000003_fix_staff_order_policies.sql'],
  ['schema', 'supabase/schema.sql'],
])('Policy staf untuk order (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it.each([
    ['Staff can manage orders', 'public.orders'],
    ['Staff can manage order items', 'public.order_items'],
  ])('%s dibatasi is_staff() pada USING dan WITH CHECK', (name, table) => {
    const p = policy(sql, name);
    expect(p).toContain(`on ${table} for all`);
    expect(p).toContain('using ((select public.is_staff()))');
    expect(p).toContain('with check ((select public.is_staff()))');
    expect(p).not.toMatch(/using \(true\)/);
  });
});
