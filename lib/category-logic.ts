/**
 * Business logic and validations for Categories (Iterasi 2)
 */

export interface CategoryDeleteGuardResult {
  canDelete: boolean;
  reason?: string;
}

/**
 * Validates category creation and editing input
 */
export function validateCategoryInput(name: string): {
  isValid: boolean;
  error?: string;
} {
  if (!name || !name.trim()) {
    return {
      isValid: false,
      error: "Nama kategori wajib diisi",
    };
  }
  return { isValid: true };
}

/**
 * PRD Section 9 Invariant:
 * Deleting a category with active linked products is strictly PROHIBITED.
 */
export function canDeleteCategory(
  productCount: number,
): CategoryDeleteGuardResult {
  const count = Number(productCount) || 0;
  if (count > 0) {
    return {
      canDelete: false,
      reason: `Kategori masih memiliki ${count} produk yang terhubung. Pindahkan atau hapus produk terlebih dahulu.`,
    };
  }
  return { canDelete: true };
}

/**
 * Toggles category active status
 */
export function toggleCategoryStatus(
  currentStatus: "Aktif" | "Nonaktif",
): "Aktif" | "Nonaktif" {
  return currentStatus === "Aktif" ? "Nonaktif" : "Aktif";
}

export interface FilterableCategory {
  id: string;
  name: string;
  description: string | null;
  status: "Aktif" | "Nonaktif";
}

/**
 * Filters categories by search query and status filter
 */
export function filterCategories<T extends FilterableCategory>(
  categories: T[],
  searchQuery: string,
  statusFilter: string = "Semua",
): T[] {
  const cleanQuery = searchQuery.toLowerCase().trim();

  return categories.filter((cat) => {
    if (statusFilter !== "Semua" && cat.status !== statusFilter) {
      return false;
    }

    if (!cleanQuery) return true;
    const nameMatch = cat.name.toLowerCase().includes(cleanQuery);
    const descMatch = cat.description
      ? cat.description.toLowerCase().includes(cleanQuery)
      : false;

    return nameMatch || descMatch;
  });
}
