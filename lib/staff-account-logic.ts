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
  errors: Partial<Record<'email' | 'password' | 'role', string>>;
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

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    value: isValid
      ? { email, password: input.password, role: input.role, employeeId: input.employeeId || null }
      : undefined,
  };
}
