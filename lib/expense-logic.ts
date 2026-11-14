/**
 * Logika Pengeluaran Kedai Kopi (Expense Logic) - Iterasi 3.7
 * Mengatur validasi, kategori, dan pemfilteran biaya operasional
 * Sesuai PRD Section 21 & Section 22
 */

export type ExpenseCategory =
  | "Raw Material"
  | "Operational"
  | "Equipment"
  | "Other";

export interface ExpenseInput {
  description: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Raw Material",
  "Operational",
  "Equipment",
  "Other",
];

export interface ExpenseCategoryMeta {
  category: ExpenseCategory;
  label: string;
  description: string;
  tone: "accent" | "warning" | "success" | "neutral";
  color: string;
}

export function getExpenseCategoryMeta(
  category: ExpenseCategory
): ExpenseCategoryMeta {
  switch (category) {
    case "Raw Material":
      return {
        category,
        label: "Bahan Baku",
        description: "Biji kopi, susu, sirup, gula, dan bahan racikan menu",
        tone: "accent",
        color: "#D1001F",
      };
    case "Operational":
      return {
        category,
        label: "Operasional & Utilitas",
        description: "Listrik PLN, air PDAM, internet Wi-Fi, dan sewa tempat",
        tone: "warning",
        color: "#D97706",
      };
    case "Equipment":
      return {
        category,
        label: "Peralatan & Aset",
        description: "Mesin espresso, grinder, portafilter, blender, dan servis alat",
        tone: "neutral",
        color: "#4B5563",
      };
    case "Other":
    default:
      return {
        category: "Other",
        label: "Lain-lain",
        description: "Pengeluaran insidental dan kebutuhan kedai tak terduga",
        tone: "neutral",
        color: "#6B7280",
      };
  }
}

/**
 * Validasi input form pencatatan biaya operasional
 */
export function validateExpenseInput(input: Partial<ExpenseInput>): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const cleanDesc = (input.description || "").trim();
  if (!cleanDesc) {
    errors.description = "Deskripsi pengeluaran wajib diisi";
  } else if (cleanDesc.length < 3) {
    errors.description = "Deskripsi pengeluaran minimal 3 karakter";
  }

  if (!input.category || !EXPENSE_CATEGORIES.includes(input.category as ExpenseCategory)) {
    errors.category = "Kategori pengeluaran tidak valid";
  }

  const numAmount = Number(input.amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    errors.amount = "Nominal biaya harus berupa angka lebih dari 0";
  }

  const dateStr = (input.expense_date || "").trim();
  if (!dateStr) {
    errors.expense_date = "Tanggal pengeluaran wajib diisi";
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr) || isNaN(new Date(dateStr).getTime())) {
      errors.expense_date = "Format tanggal tidak valid (YYYY-MM-DD)";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export type ExpensePeriodFilter = "Hari Ini" | "7 Hari Terakhir" | "Bulan Ini" | "Semua";

export interface ExpenseFilterOptions {
  category?: string;
  searchQuery?: string;
  period?: ExpensePeriodFilter;
  currentDate?: Date;
}

/**
 * Memfilter daftar pengeluaran berdasarkan kategori, pencarian, dan periode waktu
 */
export function filterExpenses<T extends { description: string; category: string; expense_date: string }>(
  expenses: T[],
  filters?: ExpenseFilterOptions
): T[] {
  if (!expenses || expenses.length === 0) return [];
  const { category, searchQuery, period = "Semua", currentDate = new Date() } = filters || {};

  const now = new Date(currentDate);
  const todayStr = now.toISOString().split("T")[0];

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const currentYearMonth = todayStr.substring(0, 7); // YYYY-MM

  return expenses.filter((exp) => {
    // 1. Filter Kategori
    if (category && category !== "Semua" && exp.category !== category) {
      return false;
    }

    // 2. Filter Pencarian Deskripsi
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (!exp.description.toLowerCase().includes(q)) {
        return false;
      }
    }

    // 3. Filter Periode Tanggal
    if (period === "Hari Ini") {
      const expDate = exp.expense_date.split("T")[0];
      return expDate === todayStr;
    }

    if (period === "7 Hari Terakhir") {
      const expDate = exp.expense_date.split("T")[0];
      return expDate >= sevenDaysAgoStr && expDate <= todayStr;
    }

    if (period === "Bulan Ini") {
      const expDate = exp.expense_date.split("T")[0];
      return expDate.startsWith(currentYearMonth);
    }

    return true;
  });
}

/**
 * Menghitung total akumulasi biaya pengeluaran
 */
export function calculateTotalExpenses(expenses: { amount: number }[]): number {
  return expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

