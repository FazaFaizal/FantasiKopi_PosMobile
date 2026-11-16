/**
 * Business logic and validations for Authentication & User Roles (Iterasi 1)
 */

export type UserRole = "Admin" | "Kasir" | "Customer";
export type AccountStatus = "Aktif" | "Nonaktif";

/**
 * Validates email address format
 */
export function validateEmail(email: string): {
  isValid: boolean;
  error?: string;
} {
  if (!email || !email.trim()) {
    return { isValid: false, error: "Email wajib diisi" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { isValid: false, error: "Format email tidak valid" };
  }
  return { isValid: true };
}

/**
 * Panjang minimum password BARU (register & pembuatan akun staf).
 * Tidak diterapkan saat login agar pengguna lama tetap bisa masuk.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password) {
    return { isValid: false, error: "Password wajib diisi" };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { isValid: false, error: `Password minimal ${PASSWORD_MIN_LENGTH} karakter` };
  }
  return { isValid: true };
}

/**
 * Admin tidak boleh menghapus akunnya sendiri dari aplikasi.
 * (Menghapus profil juga menghapus akun login — lihat trigger on_profile_deleted.)
 */
export function canDeleteUserAccount(
  target: { id: string },
  currentUser: { id: string } | null | undefined
): { allowed: boolean; reason?: string } {
  if (!currentUser) return { allowed: false, reason: 'Sesi tidak valid.' };
  if (target.id === currentUser.id) {
    return { allowed: false, reason: 'Anda tidak dapat menghapus akun Anda sendiri.' };
  }
  return { allowed: true };
}

/**
 * Route protection and role authorization
 */
export function checkRoleRouteAccess(
  userRole: UserRole | undefined,
  routeGroup: string,
): boolean {
  if (!userRole) return false;

  if (routeGroup === "(admin)") {
    return userRole === "Admin";
  }
  if (routeGroup === "(kasir)") {
    return userRole === "Kasir";
  }
  if (routeGroup === "(customer)") {
    return userRole === "Customer";
  }

  return true;
}

/**
 * Returns default landing route based on role and account status
 */
export function getDefaultRouteForRole(
  userRole: UserRole,
  accountStatus: AccountStatus,
): string {
  if (accountStatus === "Nonaktif") {
    return "/(auth)/inactive";
  }
  switch (userRole) {
    case "Admin":
      return "/(admin)/dashboard";
    case "Kasir":
      return "/(kasir)/pos";
    case "Customer":
      return "/(customer)/product";
    default:
      return "/(auth)/login";
  }
}

/**
 * Ganti password dari halaman Profil: password lama wajib (diverifikasi ulang ke server),
 * password baru minimal PASSWORD_MIN_LENGTH, berbeda dari yang lama, dan dikonfirmasi.
 */
export function validatePasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): {
  isValid: boolean;
  errors: Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;
} {
  const errors: Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>> = {};
  if (!input.currentPassword) errors.currentPassword = 'Password lama wajib diisi';

  const check = validatePassword(input.newPassword);
  if (!check.isValid) errors.newPassword = check.error;
  else if (input.newPassword === input.currentPassword) errors.newPassword = 'Password baru harus berbeda dari password lama';

  if (input.confirmPassword !== input.newPassword) errors.confirmPassword = 'Konfirmasi password tidak cocok';

  return { isValid: Object.keys(errors).length === 0, errors };
}
