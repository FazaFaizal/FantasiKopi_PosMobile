/**
 * Business logic and validations for Products (Iterasi 2)
 */

export interface ProductInputErrors {
  name?: string;
  categoryId?: string;
  price?: string;
}

/**
 * Validates product creation and editing input
 */
export function validateProductInput(
  name: string,
  categoryId: string | null | undefined,
  price: number | string,
): { isValid: boolean; errors: ProductInputErrors } {
  const errors: ProductInputErrors = {};

  if (!name || !name.trim()) {
    errors.name = "Nama produk wajib diisi";
  }

  if (!categoryId || !categoryId.trim()) {
    errors.categoryId = "Kategori produk wajib dipilih";
  }

  const numPrice = Number(price);
  if (price === "" || price === null || price === undefined || isNaN(numPrice) || numPrice < 0) {
    errors.price = "Harga harus berupa angka valid (>= 0)";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Toggles product availability status (manual switch per PRD Section 10)
 */
export function toggleProductAvailability(
  currentStatus: "Tersedia" | "Tidak Tersedia",
): "Tersedia" | "Tidak Tersedia" {
  return currentStatus === "Tersedia" ? "Tidak Tersedia" : "Tersedia";
}

export interface FilterableProduct {
  name: string;
  description: string | null;
  category_id: string | null;
  status: "Tersedia" | "Tidak Tersedia";
  category?: { name: string } | null;
}

/**
 * Filter daftar produk Admin: status, kategori ("Semua" = tanpa filter), dan
 * pencarian pada nama, deskripsi, atau nama kategori.
 */
export function filterProducts<T extends FilterableProduct>(
  products: T[],
  searchQuery: string,
  categoryFilterId: string = "Semua",
  statusFilter: string = "Semua",
): T[] {
  const cleanQuery = searchQuery.toLowerCase().trim();

  return products.filter((prod) => {
    if (statusFilter !== "Semua" && prod.status !== statusFilter) return false;
    if (categoryFilterId !== "Semua" && prod.category_id !== categoryFilterId) return false;
    if (!cleanQuery) return true;

    return (
      prod.name.toLowerCase().includes(cleanQuery) ||
      (prod.description ?? "").toLowerCase().includes(cleanQuery) ||
      (prod.category?.name ?? "").toLowerCase().includes(cleanQuery)
    );
  });
}
