/**
 * FANTASI COFFEE - STAFF ACCOUNT LOGIC
 * Validasi pembuatan akun internal (Admin / Kasir) oleh Admin.
 * Akun dibuat lewat Edge Function `create-staff-user` (PRD Section 4.2 & 8),
 * karena `auth.signUp` di klien akan mengganti sesi Admin dengan akun baru.
 *
 * Catatan: Edge Function menerapkan aturan yang sama di sisi server
 * (supabase/functions/create-staff-user/index.ts). Ubah keduanya bersamaan.
 */

import { PASSWORD_MIN_LENGTH } from './auth-logic';

export const STAFF_ROLES = ['Admin', 'Kasir'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;

export interface StaffAccountInput {
  email: string;
  password: string;
  role: StaffRole;
  employeeId: string | null;
}

export interface StaffAccountValidation {
  isValid: boolean;
  errors: Partial<Record<'email' | 'password' | 'role' | 'employee', string>>;
  value?: StaffAccountInput;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStaffAccountPayload(input: StaffAccountInput): StaffAccountValidation {
  const errors: StaffAccountValidation['errors'] = {};
  const email = (input.email || '').trim().toLowerCase();

  if (!email) {
    errors.email = 'Alamat email wajib diisi';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Format email tidak valid';
  }

  if (!input.password || input.password.length < STAFF_PASSWORD_MIN_LENGTH) {
    errors.password = `Password minimal ${STAFF_PASSWORD_MIN_LENGTH} karakter`;
  }

  if (!STAFF_ROLES.includes(input.role)) {
    errors.role = 'Role akun internal harus Admin atau Kasir';
  }

  // Akun karyawan dibuat berdasarkan data karyawan (keputusan 2026-11-14).
  if (!input.employeeId) {
    errors.employee = 'Pilih data karyawan untuk akun ini';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    value: isValid
      ? { email, password: input.password, role: input.role, employeeId: input.employeeId || null }
      : undefined,
  };
}

// ----------------------------------------------------------------------------
// Aturan akun karyawan vs akun customer (keputusan 2026-11-14)
// - Akun Customer terpisah total dari data karyawan.
// - Akun karyawan (Admin/Kasir) wajib terhubung ke tepat satu data karyawan.
// Ditegakkan juga oleh trigger database guard_user_account_rules.
// ----------------------------------------------------------------------------

export type AccountRole = 'Admin' | 'Kasir' | 'Customer';
export type AccountStatus = 'Aktif' | 'Nonaktif';

interface EmployeeRef {
  id: string;
  name?: string;
  status: AccountStatus;
}

interface UserLink {
  id: string;
  employee_id: string | null;
}

const isStaffRole = (role: AccountRole) => role === 'Admin' || role === 'Kasir';

/**
 * Karyawan yang dapat ditautkan ke akun: berstatus Aktif dan belum punya akun
 * (kecuali akun yang sedang diedit).
 */
export function getLinkableEmployees<T extends EmployeeRef>(
  employees: T[],
  users: UserLink[],
  exceptUserId?: string | null
): T[] {
  const taken = new Set(
    users.filter((u) => u.employee_id && u.id !== exceptUserId).map((u) => u.employee_id as string)
  );
  return employees.filter((e) => e.status === 'Aktif' && !taken.has(e.id));
}

export function validateUserAccountUpdate(input: {
  target: { id: string; role: AccountRole; status: AccountStatus; employee_id: string | null };
  next: { role: AccountRole; status: AccountStatus; employeeId: string | null };
  currentUserId?: string | null;
  employees: EmployeeRef[];
  users: UserLink[];
}): { allowed: boolean; reason?: string } {
  const { target, next, currentUserId, employees, users } = input;
  const deny = (reason: string) => ({ allowed: false, reason });

  if (currentUserId && target.id === currentUserId) {
    if (next.role !== target.role || next.status !== target.status) {
      return deny('Anda tidak dapat mengubah role atau menonaktifkan akun Anda sendiri. Minta Admin lain melakukannya.');
    }
  }

  if (isStaffRole(target.role) !== isStaffRole(next.role)) {
    return deny(
      'Akun Customer terpisah dari akun karyawan, sehingga tidak dapat diubah menjadi Admin/Kasir (atau sebaliknya). Buat akun karyawan lewat tombol "Buat Akun Staf".'
    );
  }

  if (next.role === 'Customer') {
    if (next.employeeId) return deny('Akun Customer tidak dapat dihubungkan dengan data karyawan.');
    return { allowed: true };
  }

  if (!next.employeeId) {
    return deny('Akun karyawan wajib terhubung dengan data karyawan.');
  }

  const employee = employees.find((e) => e.id === next.employeeId);
  if (!employee) return deny('Data karyawan tidak ditemukan.');

  const label = employee.name ? `Karyawan ${employee.name}` : 'Karyawan ini';
  if (users.some((u) => u.id !== target.id && u.employee_id === next.employeeId)) {
    return deny(`${label} sudah memiliki akun lain. Satu karyawan hanya boleh memiliki satu akun.`);
  }

  if (next.status === 'Aktif' && employee.status !== 'Aktif') {
    return deny(
      `${label} berstatus Nonaktif. Aktifkan data karyawannya terlebih dahulu sebelum mengaktifkan akun ini.`
    );
  }

  return { allowed: true };
}

/** Keterangan relasi akun pada daftar akun pengguna. */
export function describeAccountRelation(
  user: { role: AccountRole; full_name?: string | null },
  employee: { name: string; position: string | null } | null | undefined
): string {
  if (user.role === 'Customer') {
    return user.full_name ? `Customer: ${user.full_name}` : 'Customer';
  }
  if (!employee) return 'Belum terhubung dengan data karyawan';
  return `Karyawan: ${employee.name}${employee.position ? ` (${employee.position})` : ''}`;
}
