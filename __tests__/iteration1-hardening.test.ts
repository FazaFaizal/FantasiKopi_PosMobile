/**
 * AUDIT ITERASI 1 — PENGERASAN AKUN
 * 1. Hapus profil (Admin) → akun login ikut terhapus.
 *    Hapus akun login (mis. dari Dashboard) → profil TETAP ada, ditandai Nonaktif.
 * 2. Tidak boleh menghapus/menurunkan/menonaktifkan Admin aktif terakhir.
 * 3. Password baru minimal 8 karakter (register & akun staf).
 * 4. Policy users memakai (select auth.uid()); index users.employee_id.
 * 5. Layar autentikasi punya accessibilityLabel.
 */
import { validatePassword, PASSWORD_MIN_LENGTH } from '../lib/auth-logic';
import { validateStaffAccountPayload, STAFF_PASSWORD_MIN_LENGTH } from '../lib/staff-account-logic';
import { canDeleteUserAccount } from '../lib/auth-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('Password minimal 8 karakter', () => {
  it('validatePassword', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePassword('1234567').isValid).toBe(false);
    expect(validatePassword('1234567').error).toMatch(/8 karakter/);
    expect(validatePassword('12345678').isValid).toBe(true);
  });

  it('akun staf memakai aturan yang sama', () => {
    expect(STAFF_PASSWORD_MIN_LENGTH).toBe(PASSWORD_MIN_LENGTH);
    const base = { email: 'kasir@fantasi.id', role: 'Kasir' as const, employeeId: 'emp-1' };
    expect(validateStaffAccountPayload({ ...base, password: '1234567' }).errors.password).toBeDefined();
    expect(validateStaffAccountPayload({ ...base, password: '12345678' }).isValid).toBe(true);
  });

  it('register memakai validatePassword; Edge Function memakai batas 8', () => {
    expect(read('app/(auth)/register.tsx')).toContain('validatePassword(');
    expect(read('supabase/functions/create-staff-user/index.ts')).toContain('const PASSWORD_MIN_LENGTH = 8;');
  });

  it('login TIDAK memvalidasi panjang password (pengguna lama tetap bisa masuk)', () => {
    expect(read('app/(auth)/login.tsx')).not.toMatch(/validatePassword\(|password\.length\s*</);
  });
});

describe('Hapus akun dari aplikasi', () => {
  it('Admin tidak dapat menghapus akunnya sendiri', () => {
    expect(canDeleteUserAccount({ id: 'a1' }, { id: 'a1' }).allowed).toBe(false);
    expect(canDeleteUserAccount({ id: 'u2' }, { id: 'a1' }).allowed).toBe(true);
  });

  it('layar Akun memakai pengecekan & menjelaskan login ikut terhapus', () => {
    const src = read('app/(admin)/user.tsx');
    expect(src).toContain('canDeleteUserAccount(');
    expect(src).toMatch(/akun login/i);
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261113000002_iteration1_account_hardening.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('profil tidak lagi terhapus saat akun login dihapus', () => {
    expect(sql).not.toContain('references auth.users(id) on delete cascade');
    expect(sql).toMatch(/create trigger on_auth_user_deleted after delete on auth\.users/);
    expect(sql).toContain("set status = 'nonaktif'");
  });

  it('hapus profil → akun login ikut terhapus', () => {
    expect(sql).toMatch(/create trigger on_profile_deleted after delete on public\.users/);
    expect(sql).toContain('delete from auth.users where id = old.id');
  });

  it('pengaman Admin aktif terakhir', () => {
    expect(sql).toMatch(/create trigger protect_last_admin before update or delete on public\.users/);
    expect(sql).toContain('admin aktif terakhir');
  });

  it('policy users memakai (select auth.uid()) dan index employee_id', () => {
    expect(sql).toContain('using ((select auth.uid()) = id)');
    expect(sql).toContain('create index if not exists idx_users_employee_id on public.users(employee_id)');
  });
});

describe('Aksesibilitas layar autentikasi', () => {
  it.each(['login', 'register', 'inactive', 'unauthorized'])('app/(auth)/%s.tsx punya accessibilityLabel', (name) => {
    expect(read(`app/(auth)/${name}.tsx`)).toContain('accessibilityLabel=');
  });
});
