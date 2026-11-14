/**
 * ATURAN KARYAWAN & AKUN PENGGUNA (keputusan 2026-11-14)
 * - Akun Customer terpisah total dari data karyawan (tidak pernah terhubung, tidak bisa
 *   diubah menjadi akun karyawan atau sebaliknya).
 * - Setiap akun karyawan (Admin/Kasir) wajib terhubung ke tepat satu data karyawan aktif.
 * - Karyawan tidak dapat dihapus, hanya dinonaktifkan; mengaktifkan kembali karyawan
 *   tidak otomatis mengaktifkan akunnya.
 * - Admin tidak dapat mengubah role atau menonaktifkan akunnya sendiri.
 * - Nama customer saat registrasi tersimpan di profil.
 */
import { validateEmployeeInput, getEmployeeStatusChangeMessage } from '../lib/employee-logic';
import {
  validateStaffAccountPayload,
  getLinkableEmployees,
  validateUserAccountUpdate,
  describeAccountRelation,
} from '../lib/staff-account-logic';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
};
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
const MIGRATION = 'supabase/migrations/20261114000003_employee_account_rules.sql';

// ---------------------------------------------------------------------------
// Data karyawan
// ---------------------------------------------------------------------------
describe('validateEmployeeInput', () => {
  const today = new Date('2026-11-14T04:00:00Z');

  it('nama wajib', () => {
    expect(validateEmployeeInput({ name: '  ' }, today).errors.name).toBeTruthy();
    expect(validateEmployeeInput({ name: 'Ahmad' }, today)).toEqual({ isValid: true, errors: {} });
  });

  it('telepon opsional, bila diisi 8–15 digit', () => {
    expect(validateEmployeeInput({ name: 'A', phone: '0812-3456-7890' }, today).isValid).toBe(true);
    expect(validateEmployeeInput({ name: 'A', phone: '+62 812 3456 7890' }, today).isValid).toBe(true);
    expect(validateEmployeeInput({ name: 'A', phone: '12345' }, today).errors.phone).toBeTruthy();
    expect(validateEmployeeInput({ name: 'A', phone: '0812abc' }, today).errors.phone).toBeTruthy();
  });

  it('email opsional, bila diisi harus valid', () => {
    expect(validateEmployeeInput({ name: 'A', email: 'a@b.co' }, today).isValid).toBe(true);
    expect(validateEmployeeInput({ name: 'A', email: 'salah' }, today).errors.email).toBeTruthy();
  });

  it('tanggal mulai bekerja opsional, format YYYY-MM-DD dan tidak di masa depan (WITA)', () => {
    expect(validateEmployeeInput({ name: 'A', startDate: '2026-11-14' }, today).isValid).toBe(true);
    expect(validateEmployeeInput({ name: 'A', startDate: '2026-11-15' }, today).errors.startDate).toBeTruthy();
    expect(validateEmployeeInput({ name: 'A', startDate: '14-11-2026' }, today).errors.startDate).toBeTruthy();
    expect(validateEmployeeInput({ name: 'A', startDate: '2026-02-30' }, today).errors.startDate).toBeTruthy();
  });
});

describe('getEmployeeStatusChangeMessage', () => {
  it('menonaktifkan: akun login ikut nonaktif', () => {
    expect(getEmployeeStatusChangeMessage('Ahmad', 'Nonaktif', 1)).toMatch(/akun login.*ikut dinonaktifkan/i);
  });
  it('mengaktifkan kembali: akun tetap nonaktif sampai diaktifkan manual', () => {
    const msg = getEmployeeStatusChangeMessage('Ahmad', 'Aktif', 1);
    expect(msg).toMatch(/tetap nonaktif/i);
    expect(msg).toContain('Akun Pengguna');
    expect(msg).not.toMatch(/dihubungkan ke akun login/);
  });
  it('tanpa akun: tidak menyebut akun', () => {
    expect(getEmployeeStatusChangeMessage('Ahmad', 'Nonaktif', 0)).not.toMatch(/akun login/i);
  });
});

// ---------------------------------------------------------------------------
// Akun karyawan
// ---------------------------------------------------------------------------
describe('Pembuatan akun karyawan', () => {
  it('wajib memilih data karyawan', () => {
    const res = validateStaffAccountPayload({ email: 'a@b.co', password: '12345678', role: 'Kasir', employeeId: null });
    expect(res.isValid).toBe(false);
    expect(res.errors.employee).toMatch(/karyawan/i);
    expect(
      validateStaffAccountPayload({ email: 'a@b.co', password: '12345678', role: 'Kasir', employeeId: 'e1' }).isValid
    ).toBe(true);
  });

  it('hanya karyawan aktif yang belum punya akun yang bisa dipilih', () => {
    const employees = [
      { id: 'e1', status: 'Aktif' as const },
      { id: 'e2', status: 'Nonaktif' as const },
      { id: 'e3', status: 'Aktif' as const },
    ];
    const users = [{ id: 'u3', employee_id: 'e3' }];
    expect(getLinkableEmployees(employees, users).map((e) => e.id)).toEqual(['e1']);
    // saat mengedit akun u3, karyawannya sendiri tetap boleh dipilih
    expect(getLinkableEmployees(employees, users, 'u3').map((e) => e.id)).toEqual(['e1', 'e3']);
  });
});

describe('validateUserAccountUpdate', () => {
  const employees = [
    { id: 'e1', name: 'Ahmad', status: 'Aktif' as const },
    { id: 'e2', name: 'Budi', status: 'Nonaktif' as const },
    { id: 'e3', name: 'Citra', status: 'Aktif' as const },
  ];
  const users = [
    { id: 'kasir', employee_id: 'e1' },
    { id: 'kasir2', employee_id: 'e3' },
  ];
  const kasir = { id: 'kasir', role: 'Kasir' as const, status: 'Aktif' as const, employee_id: 'e1' };
  const customer = { id: 'cust', role: 'Customer' as const, status: 'Aktif' as const, employee_id: null };
  const base = { currentUserId: 'admin', employees, users };

  it('Kasir → Admin dengan karyawan yang sama: boleh', () => {
    expect(validateUserAccountUpdate({ ...base, target: kasir, next: { role: 'Admin', status: 'Aktif', employeeId: 'e1' } }).allowed).toBe(true);
  });

  it('Customer tidak bisa diubah menjadi akun karyawan, dan sebaliknya', () => {
    const r1 = validateUserAccountUpdate({ ...base, target: customer, next: { role: 'Kasir', status: 'Aktif', employeeId: null } });
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toMatch(/Customer/);
    const r2 = validateUserAccountUpdate({ ...base, target: kasir, next: { role: 'Customer', status: 'Aktif', employeeId: null } });
    expect(r2.allowed).toBe(false);
  });

  it('Customer tidak bisa dihubungkan ke karyawan', () => {
    const r = validateUserAccountUpdate({ ...base, target: customer, next: { role: 'Customer', status: 'Aktif', employeeId: 'e1' } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/tidak dapat dihubungkan/);
  });

  it('akun karyawan wajib terhubung ke data karyawan', () => {
    const r = validateUserAccountUpdate({ ...base, target: kasir, next: { role: 'Kasir', status: 'Aktif', employeeId: null } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/wajib terhubung/);
  });

  it('akun tidak bisa Aktif bila karyawannya Nonaktif', () => {
    const r = validateUserAccountUpdate({ ...base, target: { ...kasir, status: 'Nonaktif' }, next: { role: 'Kasir', status: 'Aktif', employeeId: 'e2' } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('Budi');
    // akun nonaktif boleh tetap terhubung ke karyawan nonaktif
    expect(validateUserAccountUpdate({ ...base, target: kasir, next: { role: 'Kasir', status: 'Nonaktif', employeeId: 'e2' } }).allowed).toBe(true);
  });

  it('satu karyawan hanya untuk satu akun', () => {
    const r = validateUserAccountUpdate({ ...base, target: kasir, next: { role: 'Kasir', status: 'Aktif', employeeId: 'e3' } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/sudah memiliki akun/);
  });

  it('Admin tidak bisa mengubah role / menonaktifkan akun sendiri', () => {
    const me = { id: 'admin', role: 'Admin' as const, status: 'Aktif' as const, employee_id: 'e3' };
    const self = { ...base, users: [{ id: 'admin', employee_id: 'e3' }] };
    expect(validateUserAccountUpdate({ ...self, target: me, next: { role: 'Kasir', status: 'Aktif', employeeId: 'e3' } }).allowed).toBe(false);
    expect(validateUserAccountUpdate({ ...self, target: me, next: { role: 'Admin', status: 'Nonaktif', employeeId: 'e3' } }).allowed).toBe(false);
    // pindah tautan tetap butuh karyawan aktif & bebas: e2 Nonaktif → ditolak
    expect(validateUserAccountUpdate({ ...self, target: me, next: { role: 'Admin', status: 'Aktif', employeeId: 'e2' } }).allowed).toBe(false);
    expect(validateUserAccountUpdate({ ...self, target: me, next: { role: 'Admin', status: 'Aktif', employeeId: 'e3' } }).allowed).toBe(true);
  });
});

describe('describeAccountRelation', () => {
  it('akun karyawan menampilkan nama & jabatan', () => {
    expect(describeAccountRelation({ role: 'Kasir', full_name: null }, { name: 'Ahmad', position: 'Barista' })).toBe(
      'Karyawan: Ahmad (Barista)'
    );
  });
  it('akun karyawan tanpa data karyawan ditandai', () => {
    expect(describeAccountRelation({ role: 'Admin', full_name: null }, null)).toMatch(/belum terhubung/i);
  });
  it('akun customer tidak pernah disebut karyawan', () => {
    expect(describeAccountRelation({ role: 'Customer', full_name: 'Sari' }, null)).toBe('Customer: Sari');
    expect(describeAccountRelation({ role: 'Customer', full_name: null }, null)).toBe('Customer');
  });
});

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
describe('Migration aturan karyawan & akun', () => {
  const mig = read(MIGRATION);
  const sql = normalize(mig);
  const schema = normalize(read('supabase/schema.sql'));

  it('nama customer tersimpan di profil', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('add column if not exists full_name text');
      expect(s).toContain("new.raw_user_meta_data ->> 'name'");
    }
  });

  it('satu karyawan maksimal satu akun', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create unique index if not exists users_employee_id_unique on public.users(employee_id) where employee_id is not null');
    }
  });

  it('trigger aturan akun', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create trigger guard_user_account_rules before insert or update on public.users');
    }
    for (const msg of [
      'Akun Customer tidak dapat dihubungkan dengan data karyawan',
      'Akun karyawan wajib terhubung dengan data karyawan',
      'tidak dapat mengubah role atau menonaktifkan akun Anda sendiri',
    ]) {
      expect(mig).toContain(msg);
    }
  });

  it('karyawan tidak dapat dihapus', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain('create trigger prevent_employee_delete before delete on public.employees');
    }
  });

  it('akun karyawan lama tanpa data karyawan dibuatkan datanya', () => {
    expect(sql).toMatch(/insert into public\.employees/);
    expect(sql).toMatch(/role in \('admin', 'kasir'\) and u\.employee_id is null/);
  });

  it('fungsi trigger tidak dapat dipanggil langsung', () => {
    expect(sql).toContain('revoke execute on function public.guard_user_account_rules() from public, anon, authenticated');
    expect(sql).toContain('revoke execute on function public.prevent_employee_delete() from public, anon, authenticated');
  });
});

describe('Edge Function create-staff-user', () => {
  const src = read('supabase/functions/create-staff-user/index.ts');
  it('wajib memilih karyawan aktif yang belum punya akun', () => {
    expect(src).toMatch(/Pilih data karyawan/);
    expect(src).toMatch(/sudah memiliki akun/);
    expect(src).toContain('full_name');
  });
});

// ---------------------------------------------------------------------------
// Layar
// ---------------------------------------------------------------------------
describe('Layar karyawan & akun', () => {
  it('karyawan: tidak ada hapus permanen, ada tanggal mulai & tombol buat akun', () => {
    const src = read('app/(admin)/employee.tsx');
    expect(src).not.toContain('.delete()');
    expect(src).not.toContain('Hapus Permanen');
    expect(src).toContain('start_date');
    expect(src).toContain('validateEmployeeInput(');
    expect(src).toContain('getEmployeeStatusChangeMessage(');
    expect(src).toMatch(/pathname: ["']\/\(admin\)\/user["']/);
  });

  it('akun: aturan relasi & role, karyawan wajib, label benar', () => {
    const src = read('app/(admin)/user.tsx');
    expect(src).toContain('validateUserAccountUpdate(');
    expect(src).toContain('getLinkableEmployees(');
    expect(src).toContain('describeAccountRelation(');
    expect(src).toContain('useLocalSearchParams');
    expect(src).not.toContain('Minimal 6 karakter');
    expect(src).not.toContain('Customer Mandiri');
    expect(src).not.toContain('Akun Mandiri');
  });

  it('status akun diperiksa ulang saat aplikasi kembali dibuka', () => {
    const src = read('lib/AuthContext.tsx');
    expect(src).toContain('AppState');
    expect(src).toContain('refreshUser');
  });

  it('profil menampilkan nama', () => {
    expect(read('components/ProfileScreen.tsx')).toContain('full_name');
    expect(read('types/database.ts')).toContain('full_name');
  });
});
