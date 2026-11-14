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

// ----------------------------------------------------------------------------
// Stock In sebagai pembelian (PRD Section 12.1 & 20, revisi #4)
// Stock In dapat ditandai sebagai pembelian beserta total harga per bahan.
// Fungsi DB `record_stock_in` menyimpan mutasi stok + expense (Raw Material,
// tanggal hari ini WIB) dalam satu transaksi.
// ----------------------------------------------------------------------------

/** Mengubah input nominal Rupiah ("Rp 90.000") menjadi angka (90000). */
export function parseRupiahInput(text: string): number {
  const digits = (text || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export interface StockInPurchaseInput {
  quantityText: string;
  isPurchase: boolean;
  amountText: string;
}

export interface StockInPurchaseValue {
  quantity: number;
  purchaseAmount: number | null;
}

export function validateStockInPurchase(input: StockInPurchaseInput): {
  isValid: boolean;
  errors: Partial<Record<"quantity" | "amount", string>>;
  value?: StockInPurchaseValue;
} {
  const errors: Partial<Record<"quantity" | "amount", string>> = {};
  const quantity = Number((input.quantityText || "").trim().replace(",", "."));

  if (!input.quantityText?.trim() || isNaN(quantity) || quantity <= 0) {
    errors.quantity = "Jumlah perubahan harus lebih besar dari 0";
  }

  let purchaseAmount: number | null = null;
  if (input.isPurchase) {
    purchaseAmount = parseRupiahInput(input.amountText);
    if (purchaseAmount <= 0) {
      errors.amount = "Total harga pembelian wajib diisi dan lebih dari 0";
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return { isValid, errors, value: isValid ? { quantity, purchaseAmount } : undefined };
}

/** Deskripsi expense otomatis. Format harus sama dengan fungsi DB record_stock_in. */
export function buildPurchaseExpenseDescription(itemName: string, quantity: number, unit: string): string {
  return `Pembelian ${itemName} ${quantity} ${unit}`;
}

export function buildRecordStockInParams(
  inventoryId: string,
  value: StockInPurchaseValue,
  notes: string
): {
  p_inventory_id: string;
  p_quantity: number;
  p_notes: string | null;
  p_purchase_amount: number | null;
} {
  return {
    p_inventory_id: inventoryId,
    p_quantity: value.quantity,
    p_notes: (notes || "").trim() || null,
    p_purchase_amount: value.purchaseAmount,
  };
}

// ----------------------------------------------------------------------------
// Stock Out & Opname (audit iterasi 2)
// Dihitung dan dicatat oleh fungsi DB `record_stock_movement` (baris terkunci),
// fungsi ini hanya memvalidasi form dan menyiapkan parameternya.
// Opname memakai stok fisik aktual (0 diperbolehkan = bahan habis).
// ----------------------------------------------------------------------------
export function buildStockMovementParams(input: {
  inventoryId: string;
  type: 'Stock Out' | 'Stock Adjustment';
  quantityText: string;
  notes: string;
  currentStock: number;
}): {
  isValid: boolean;
  errors: Partial<Record<'quantity' | 'notes', string>>;
  params?: {
    p_inventory_id: string;
    p_movement_type: 'Stock Out' | 'Stock Adjustment';
    p_quantity: number;
    p_notes: string;
  };
} {
  const errors: Partial<Record<'quantity' | 'notes', string>> = {};
  const raw = (input.quantityText || '').trim().replace(',', '.');
  const qty = Number(raw);
  const current = Number(input.currentStock);
  const notes = (input.notes || '').trim();

  if (!raw || isNaN(qty)) {
    errors.quantity = 'Jumlah wajib diisi dengan angka';
  } else if (input.type === 'Stock Out') {
    if (qty <= 0) errors.quantity = 'Jumlah perubahan harus lebih besar dari 0';
    else if (qty > current) errors.quantity = `Stok tidak mencukupi. Stok saat ini: ${current}`;
  } else {
    if (qty < 0) errors.quantity = 'Stok fisik tidak boleh negatif';
    else if (qty === current) errors.quantity = 'Stok fisik sama dengan stok sistem, tidak ada yang perlu disesuaikan';
  }

  if (!notes) {
    errors.notes =
      input.type === 'Stock Out'
        ? 'Keterangan wajib diisi untuk Stock Out (misal: Pemakaian harian, Rusak, dll)'
        : 'Keterangan wajib diisi untuk Stock Opname';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    params: isValid
      ? { p_inventory_id: input.inventoryId, p_movement_type: input.type, p_quantity: qty, p_notes: notes }
      : undefined,
  };
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
