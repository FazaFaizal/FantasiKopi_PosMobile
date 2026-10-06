/**
 * Business logic and validations for Inventory & Stock Movements (Iterasi 2)
 */

export type StockStatusLabel = "Aman" | "Low Stock" | "Out of Stock";
export type StockStatusTone = "success" | "warning" | "danger";

export interface StockStatus {
  label: StockStatusLabel;
  tone: StockStatusTone;
}

/**
 * Computes raw material inventory health status based on PRD Section 11:
 * - current_stock <= 0 -> Out of Stock (danger)
 * - current_stock <= min_stock -> Low Stock (warning)
 * - current_stock > min_stock -> Aman (success)
 */
export function computeStockStatus(current: number, min: number): StockStatus {
  const currentNum = Number(current);
  const minNum = Number(min);

  if (currentNum <= 0) {
    return { label: "Out of Stock", tone: "danger" };
  }
  if (currentNum <= minNum) {
    return { label: "Low Stock", tone: "warning" };
  }
  return { label: "Aman", tone: "success" };
}

export type MovementType = "Stock In" | "Stock Out" | "Stock Adjustment";

export interface StockCalculationResult {
  isValid: boolean;
  stockAfter: number;
  error?: string;
}

/**
 * Calculates stock balance after a movement
 */
export function calculateStockMovement(
  movementType: MovementType,
  currentStock: number,
  quantity: number,
): StockCalculationResult {
  const current = Number(currentStock);
  const qty = Number(quantity);

  if (isNaN(qty) || qty <= 0) {
    return {
      isValid: false,
      stockAfter: current,
      error: "Jumlah perubahan harus berupa angka lebih besar dari 0",
    };
  }

  if (movementType === "Stock In") {
    return {
      isValid: true,
      stockAfter: current + qty,
    };
  }

  if (movementType === "Stock Out") {
    if (qty > current) {
      return {
        isValid: false,
        stockAfter: current,
        error: `Stok tidak mencukupi. Stok saat ini: ${current}`,
      };
    }
    return {
      isValid: true,
      stockAfter: current - qty,
    };
  }

  if (movementType === "Stock Adjustment") {
    return {
      isValid: true,
      stockAfter: qty,
    };
  }

  return {
    isValid: false,
    stockAfter: current,
    error: "Jenis pergerakan stok tidak valid",
  };
}

/**
 * Validates movement notes:
 * - Stock In: Optional
 * - Stock Out: Mandatory (e.g. usage, spilled, expired)
 * - Stock Adjustment: Mandatory (e.g. opname discrepancy reason)
 */
export function validateMovementNotes(
  movementType: MovementType,
  notes: string,
): { isValid: boolean; error?: string } {
  const cleanNotes = (notes || "").trim();

  if (movementType === "Stock In") {
    return { isValid: true };
  }

  if (movementType === "Stock Out") {
    if (!cleanNotes) {
      return {
        isValid: false,
        error:
          "Keterangan wajib diisi untuk Stock Out (misal: Pemakaian harian, Rusak, Expired)",
      };
    }
    return { isValid: true };
  }

  if (movementType === "Stock Adjustment") {
    if (!cleanNotes) {
      return {
        isValid: false,
        error: "Keterangan wajib diisi untuk Penyesuaian / Stock Opname",
      };
    }
    return { isValid: true };
  }

  return { isValid: true };
}

/**
 * Validates raw material item input
 */
export function validateInventoryItemInput(
  name: string,
  unit: string,
  minStock: number | string,
): {
  isValid: boolean;
  errors: { name?: string; unit?: string; minStock?: string };
} {
  const errors: { name?: string; unit?: string; minStock?: string } = {};

  if (!name || !name.trim()) {
    errors.name = "Nama bahan baku wajib diisi";
  }

  if (!unit || !unit.trim()) {
    errors.unit = "Satuan unit wajib diisi";
  }

  const numMin = Number(minStock);
  if (
    minStock === "" ||
    minStock === null ||
    minStock === undefined ||
    isNaN(numMin) ||
    numMin < 0
  ) {
    errors.minStock = "Batas minimum stock harus berupa angka valid (>= 0)";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Role-based permission check:
 * Kasir can manage stock movements, but CANNOT delete inventory items (PRD Section 11.3)
 */
export function canUserDeleteInventoryItem(
  userRole: string | undefined,
): boolean {
  return userRole === "Admin";
}
