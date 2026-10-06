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
 * Validates password rules (minimum 6 characters)
 */
export function validatePassword(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password) {
    return { isValid: false, error: "Password wajib diisi" };
  }
  if (password.length < 6) {
    return { isValid: false, error: "Password minimal 6 karakter" };
  }
  return { isValid: true };
}

/**
 * Validates employee input data
 */
export function validateEmployeeInput(
  name: string,
  phone?: string | null,
): { isValid: boolean; errors: { name?: string; phone?: string } } {
  const errors: { name?: string; phone?: string } = {};

  if (!name || !name.trim()) {
    errors.name = "Nama karyawan wajib diisi";
  }

  if (phone && phone.trim()) {
    const phoneRegex = /^[0-9+\-\s]{8,20}$/;
    if (!phoneRegex.test(phone.trim())) {
      errors.phone = "Nomor telepon tidak valid";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
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
 * Synchronization rule (PRD Section 8):
 * If employee status becomes Nonaktif, user account becomes Nonaktif.
 */
export function syncEmployeeStatusToUser(
  employeeStatus: AccountStatus,
  currentAccountStatus: AccountStatus,
): AccountStatus {
  if (employeeStatus === "Nonaktif") {
    return "Nonaktif";
  }
  return currentAccountStatus;
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
