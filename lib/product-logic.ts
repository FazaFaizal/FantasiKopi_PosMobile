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
  if (
    price === "" ||
    price === null ||
    price === undefined ||
    isNaN(numPrice)
  ) {
    errors.price = "Harga produk harus berupa angka";
  } else if (numPrice < 0) {
    errors.price = "Harga produk tidak boleh bernilai negatif";
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
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  status: "Tersedia" | "Tidak Tersedia";
  is_active?: boolean;
}

/**
 * Filters product list by search query, category, and availability status
 */
export function filterProducts<T extends FilterableProduct>(
  products: T[],
  searchQuery: string,
  categoryFilterId: string = "all",
  statusFilter: string = "Semua",
): T[] {
  const cleanQuery = searchQuery.toLowerCase().trim();

  return products.filter((prod) => {
    // 1. Filter out explicitly inactive products
    if (prod.is_active === false) return false;

    // 2. Status filter
    if (statusFilter !== "Semua" && prod.status !== statusFilter) {
      return false;
    }

    // 3. Category filter
    if (categoryFilterId !== "all" && prod.category_id !== categoryFilterId) {
      return false;
    }

    // 4. Search query
    if (!cleanQuery) return true;
    const nameMatch = prod.name.toLowerCase().includes(cleanQuery);
    const descMatch = prod.description
      ? prod.description.toLowerCase().includes(cleanQuery)
      : false;

    return nameMatch || descMatch;
  });
}
