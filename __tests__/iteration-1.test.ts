import {
  validateEmail,
  validatePassword,
  validateEmployeeInput,
  checkRoleRouteAccess,
  syncEmployeeStatusToUser,
  getDefaultRouteForRole,
} from "../lib/auth-logic";
import { statusTone } from "../components/Badge";
import { Platform } from "react-native";

export function getAuthKeyboardBehavior(
  os: typeof Platform.OS,
): "padding" | "height" | undefined {
  return os === "ios" ? "padding" : undefined;
}

describe("Iterasi 1 - Autentikasi, Karyawan & Akun Pengguna (Auth & User Management)", () => {
  describe("1.1 Validasi Format Email", () => {
    it("menerima alamat email yang valid", () => {
      expect(validateEmail("admin@fantasicoffee.id").isValid).toBe(true);
      expect(validateEmail("kasir1@faza.com").isValid).toBe(true);
      expect(validateEmail("customer.setia@gmail.com").isValid).toBe(true);
    });

    it("menolak email kosong", () => {
      const res = validateEmail("");
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("Email wajib diisi");
    });

    it("menolak format email yang tidak valid", () => {
      expect(validateEmail("bukan-email").isValid).toBe(false);
      expect(validateEmail("admin@").isValid).toBe(false);
      expect(validateEmail("@domain.com").isValid).toBe(false);
      expect(validateEmail("admin@domain").isValid).toBe(false);
    });
  });

  describe("1.2 Validasi Password", () => {
    it("menerima password 6 karakter atau lebih", () => {
      expect(validatePassword("123456").isValid).toBe(true);
      expect(validatePassword("password123").isValid).toBe(true);
    });

    it("menolak password kosong", () => {
      const res = validatePassword("");
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("Password wajib diisi");
    });

    it("menolak password yang kurang dari 6 karakter", () => {
      const res = validatePassword("12345");
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("Password minimal 6 karakter");
    });
  });

  describe("1.3 Validasi Data Karyawan (Employee Management)", () => {
    it("menerima data karyawan lengkap dengan nomor telepon valid", () => {
      const res = validateEmployeeInput("Ahmad Barista", "081234567890");
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it("menerima data karyawan tanpa nomor telepon (opsional)", () => {
      const res = validateEmployeeInput("Siti Kasir", null);
      expect(res.isValid).toBe(true);
    });

    it("menolak jika nama karyawan kosong", () => {
      const res = validateEmployeeInput("", "081234567890");
      expect(res.isValid).toBe(false);
      expect(res.errors.name).toBe("Nama karyawan wajib diisi");
    });

    it("menolak format nomor telepon yang tidak valid", () => {
      const res = validateEmployeeInput("Budi", "nomor-hp-salah");
      expect(res.isValid).toBe(false);
      expect(res.errors.phone).toBe("Nomor telepon tidak valid");
    });
  });

  describe("1.4 Kontrol Hak Akses Berbasis Role (RBAC)", () => {
    it("mengizinkan Admin mengakses grup (admin) dan menolak role lain", () => {
      expect(checkRoleRouteAccess("Admin", "(admin)")).toBe(true);
      expect(checkRoleRouteAccess("Kasir", "(admin)")).toBe(false);
      expect(checkRoleRouteAccess("Customer", "(admin)")).toBe(false);
    });

    it("mengizinkan Kasir mengakses grup (kasir) dan menolak role lain", () => {
      expect(checkRoleRouteAccess("Kasir", "(kasir)")).toBe(true);
      expect(checkRoleRouteAccess("Admin", "(kasir)")).toBe(false);
      expect(checkRoleRouteAccess("Customer", "(kasir)")).toBe(false);
    });

    it("mengizinkan Customer mengakses grup (customer) dan menolak role lain", () => {
      expect(checkRoleRouteAccess("Customer", "(customer)")).toBe(true);
      expect(checkRoleRouteAccess("Admin", "(customer)")).toBe(false);
      expect(checkRoleRouteAccess("Kasir", "(customer)")).toBe(false);
    });

    it("menolak akses jika role tidak terdefinisi", () => {
      expect(checkRoleRouteAccess(undefined, "(admin)")).toBe(false);
    });
  });

  describe("1.5 Sinkronisasi Status Karyawan & Akun Pengguna (PRD Section 8)", () => {
    it("mengubah status akun menjadi Nonaktif jika karyawan dinonaktifkan", () => {
      expect(syncEmployeeStatusToUser("Nonaktif", "Aktif")).toBe("Nonaktif");
      expect(syncEmployeeStatusToUser("Nonaktif", "Nonaktif")).toBe("Nonaktif");
    });

    it("mempertahankan status akun jika status karyawan tetap Aktif", () => {
      expect(syncEmployeeStatusToUser("Aktif", "Aktif")).toBe("Aktif");
      expect(syncEmployeeStatusToUser("Aktif", "Nonaktif")).toBe("Nonaktif");
    });
  });

  describe("1.6 Navigasi Default Berdasarkan Role & Status", () => {
    it("mengarahkan akun Nonaktif ke layar inactive tanpa memandang role", () => {
      expect(getDefaultRouteForRole("Admin", "Nonaktif")).toBe(
        "/(auth)/inactive",
      );
      expect(getDefaultRouteForRole("Kasir", "Nonaktif")).toBe(
        "/(auth)/inactive",
      );
      expect(getDefaultRouteForRole("Customer", "Nonaktif")).toBe(
        "/(auth)/inactive",
      );
    });

    it("mengarahkan akun Aktif ke dashboard masing-masing role", () => {
      expect(getDefaultRouteForRole("Admin", "Aktif")).toBe(
        "/(admin)/dashboard",
      );
      expect(getDefaultRouteForRole("Kasir", "Aktif")).toBe("/(kasir)/pos");
      expect(getDefaultRouteForRole("Customer", "Aktif")).toBe(
        "/(customer)/product",
      );
    });
  });

  describe("1.7 Penanganan Keyboard & Status Tone Akun", () => {
    it("memetakan status Aktif ke tone success dan Nonaktif ke danger", () => {
      expect(statusTone("Aktif")).toBe("success");
      expect(statusTone("Nonaktif")).toBe("danger");
    });

    it("menetapkan keyboard behavior undefined pada Android untuk mencegah glitch double-resize", () => {
      expect(getAuthKeyboardBehavior("android")).toBeUndefined();
    });

    it("menetapkan keyboard behavior padding pada iOS untuk transisi mulus", () => {
      expect(getAuthKeyboardBehavior("ios")).toBe("padding");
    });
  });
});

