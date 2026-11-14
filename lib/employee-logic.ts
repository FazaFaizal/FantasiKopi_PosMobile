/**
 * FANTASI COFFEE - EMPLOYEE LOGIC
 * Validasi data karyawan (PRD 4.1 & 7) dan pesan perubahan status.
 * Karyawan tidak dapat dihapus, hanya dinonaktifkan (ditegakkan juga oleh database).
 */
import { getBusinessDateString } from './timezone';

export interface EmployeeInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Tanggal mulai bekerja, format YYYY-MM-DD. */
  startDate?: string | null;
}

export type EmployeeInputErrors = Partial<Record<'name' | 'phone' | 'email' | 'startDate', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(ymd: string): boolean {
  const m = DATE_PATTERN.exec(ymd);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function validateEmployeeInput(
  input: EmployeeInput,
  now: Date = new Date()
): { isValid: boolean; errors: EmployeeInputErrors } {
  const errors: EmployeeInputErrors = {};

  if (!(input.name || '').trim()) {
    errors.name = 'Nama lengkap karyawan wajib diisi';
  }

  const phone = (input.phone || '').trim();
  if (phone) {
    const digits = phone.replace(/[\s\-+]/g, '');
    if (!/^[0-9+\-\s]+$/.test(phone) || !/^\d+$/.test(digits) || digits.length < 8 || digits.length > 15) {
      errors.phone = 'Nomor telepon tidak valid (8–15 digit)';
    }
  }

  const email = (input.email || '').trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Format email tidak valid';
  }

  const startDate = (input.startDate || '').trim();
  if (startDate) {
    if (!isRealDate(startDate)) {
      errors.startDate = 'Gunakan format tanggal YYYY-MM-DD, mis. 2026-01-15';
    } else if (startDate > getBusinessDateString(now)) {
      errors.startDate = 'Tanggal mulai bekerja tidak boleh di masa depan';
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/** Pesan konfirmasi saat status karyawan diubah. */
export function getEmployeeStatusChangeMessage(
  employeeName: string,
  nextStatus: 'Aktif' | 'Nonaktif',
  linkedAccountCount: number
): string {
  const hasAccount = linkedAccountCount > 0;
  if (nextStatus === 'Nonaktif') {
    return hasAccount
      ? `Nonaktifkan "${employeeName}"? Akun login karyawan ini akan ikut dinonaktifkan sehingga tidak dapat masuk ke aplikasi.`
      : `Nonaktifkan "${employeeName}"? Karyawan nonaktif tidak dapat dibuatkan akun.`;
  }
  return hasAccount
    ? `Aktifkan kembali "${employeeName}"? Akun loginnya tetap nonaktif; aktifkan secara manual di menu Akun Pengguna bila karyawan ini perlu masuk ke aplikasi lagi.`
    : `Aktifkan kembali "${employeeName}"?`;
}
