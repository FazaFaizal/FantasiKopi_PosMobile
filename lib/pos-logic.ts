import type { PaymentMethod } from "./order-logic";

export interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

export interface PosProduct {
  id: string;
  name: string;
  price: number;
  category_id?: string | null;
  status?: string;
  is_active?: boolean;
  /** URL foto produk; null bila Admin belum mengunggah foto. */
  image?: string | null;
}

/**
 * Menambahkan produk ke dalam keranjang.
 * Jika produk dengan productId dan notes yang sama sudah ada, naikkan quantity.
 * Jika notes berbeda, item akan dicatat terpisah agar instruksi barista jelas.
 */
export function addToCart(
  cart: CartItem[],
  product: PosProduct,
  notes: string = ""
): CartItem[] {
  const cleanNotes = notes ? notes.trim() : "";
  const existingIndex = cart.findIndex(
    (item) => item.productId === product.id && (item.notes || "") === cleanNotes
  );

  if (existingIndex > -1) {
    const nextCart = [...cart];
    nextCart[existingIndex] = {
      ...nextCart[existingIndex],
      quantity: nextCart[existingIndex].quantity + 1,
    };
    return nextCart;
  }

  return [
    ...cart,
    {
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      quantity: 1,
      notes: cleanNotes,
    },
  ];
}

/**
 * Memperbarui quantity item pada keranjang (+1 atau -1).
 * Jika kuantitas akhir <= 0, item otomatis dihapus dari keranjang.
 */
export function updateCartItemQuantity(
  cart: CartItem[],
  productId: string,
  delta: number
): CartItem[] {
  return cart
    .map((item) => {
      if (item.productId === productId) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : null;
      }
      return item;
    })
    .filter((item): item is CartItem => item !== null);
}

/**
 * Menghapus item tertentu dari keranjang belanja.
 */
export function removeFromCart(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

/**
 * Memperbarui catatan kustom pesanan item (misal: Less Sweet, Extra Ice).
 */
export function updateCartItemNotes(
  cart: CartItem[],
  productId: string,
  notes: string
): CartItem[] {
  return cart.map((item) =>
    item.productId === productId ? { ...item, notes: notes.trim() } : item
  );
}

/**
 * Menghitung subtotal untuk 1 baris item (unitPrice * quantity).
 */
export function calculateItemSubtotal(item: CartItem): number {
  return Math.round(Number(item.unitPrice || 0) * Number(item.quantity || 0));
}

/**
 * Menghitung ringkasan keranjang: total item, subtotal, dan grand total.
 */
export function calculateCartTotals(cart: CartItem[]): {
  totalItems: number;
  subtotal: number;
  total: number;
} {
  let totalItems = 0;
  let total = 0;

  for (const item of cart) {
    totalItems += item.quantity || 0;
    total += calculateItemSubtotal(item);
  }

  return {
    totalItems,
    subtotal: total,
    total,
  };
}

/**
 * Menghitung validitas uang tunai yang diberikan dan nominal uang kembalian.
 */
export function calculateCashChange(
  totalAmount: number,
  cashGiven: number
): {
  isValid: boolean;
  change: number;
  error?: string;
} {
  const safeTotal = Math.max(0, Math.round(totalAmount));
  const safeCash = Math.max(0, Math.round(cashGiven));

  if (safeCash < safeTotal) {
    return {
      isValid: false,
      change: 0,
      error: `Nominal uang tunai kurang dari total tagihan (Kurang Rp ${(
        safeTotal - safeCash
      ).toLocaleString("id-ID")})`,
    };
  }

  return {
    isValid: true,
    change: safeCash - safeTotal,
  };
}

/**
 * Memberikan saran nominal pecahan uang tunai cepat untuk mempermudah kasir.
 */
export function getQuickCashSuggestions(totalAmount: number): number[] {
  if (totalAmount <= 0) return [10000, 20000, 50000, 100000];

  const suggestions = new Set<number>();
  suggestions.add(totalAmount); // Uang pas

  const standardBills = [10000, 20000, 50000, 100000];
  for (const bill of standardBills) {
    if (bill > totalAmount) {
      suggestions.add(bill);
    }
  }

  // Tambahkan pembulatan puluhan ribu terdekat jika totalAmount bukan kelipatan 10.000
  const nextTenThousand = Math.ceil(totalAmount / 10000) * 10000;
  if (nextTenThousand > totalAmount) {
    suggestions.add(nextTenThousand);
  }

  return Array.from(suggestions).sort((a, b) => a - b);
}

/**
 * Memvalidasi keabsahan data transaksi sebelum disimpan ke Supabase.
 */
export function validateOrderPayload(payload: {
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  cashGiven?: number;
  customerName?: string;
}): { isValid: boolean; error?: string } {
  if (!payload.cart || payload.cart.length === 0) {
    return { isValid: false, error: "Keranjang belanja masih kosong" };
  }

  for (const item of payload.cart) {
    if (!item.quantity || item.quantity <= 0) {
      return {
        isValid: false,
        error: `Jumlah item '${item.productName}' tidak valid`,
      };
    }
  }

  const { total } = calculateCartTotals(payload.cart);

  if (payload.paymentMethod === "Tunai") {
    const cash = Number(payload.cashGiven || 0);
    const changeCalc = calculateCashChange(total, cash);
    if (!changeCalc.isValid) {
      return { isValid: false, error: changeCalc.error };
    }
  }

  return { isValid: true };
}

/**
 * Menghasilkan nomor order berformat ORD-YYYYMMDD-XXXX
 */
export function generateOrderNumber(
  date: Date = new Date(),
  sequence: number = 1
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const seqPadded = String(sequence).padStart(4, "0");
  return `ORD-${yyyy}${mm}${dd}-${seqPadded}`;
}

/**
 * Memfilter katalog produk untuk kasir:
 * - Hanya produk aktif (is_active !== false)
 * - Filter kategori opsional
 * - Pencarian nama produk
 */
export function filterPosProducts(
  products: PosProduct[],
  categoryId: string | null = null,
  searchQuery: string = ""
): PosProduct[] {
  const cleanSearch = (searchQuery || "").trim().toLowerCase();

  return products.filter((product) => {
    // 1. Wajib berstatus aktif
    if (product.is_active === false) return false;

    // 2. Filter Kategori
    if (categoryId && product.category_id !== categoryId) {
      return false;
    }

    // 3. Filter Pencarian Nama
    if (cleanSearch) {
      const matchName = product.name.toLowerCase().includes(cleanSearch);
      if (!matchName) return false;
    }

    return true;
  });
}


/**
 * Parameter RPC create_order (audit iterasi 3, PRD 18).
 * Hanya produk, jumlah, dan catatan yang dikirim: harga, subtotal, total, nomor order,
 * dan status dihitung database dalam satu transaksi.
 */
export function buildCreateOrderParams(
  cart: CartItem[],
  options: {
    customerName: string;
    orderType: "Dine In" | "Take Away";
    paymentMethod: PaymentMethod;
    notes?: string | null;
    /** Khusus pesanan customer: 'Online' = QRIS lewat Midtrans. Default database: 'Kasir'. */
    paymentChannel?: "Kasir" | "Online";
  }
): {
  p_items: { product_id: string; quantity: number; notes: string | null }[];
  p_customer_name: string;
  p_order_type: "Dine In" | "Take Away";
  p_payment_method: PaymentMethod;
  p_notes: string | null;
  p_payment_channel?: "Kasir" | "Online";
} {
  return {
    ...(options.paymentChannel ? { p_payment_channel: options.paymentChannel } : {}),
    p_items: cart.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      notes: (item.notes || "").trim() || null,
    })),
    p_customer_name: (options.customerName || "").trim(),
    p_order_type: options.orderType,
    p_payment_method: options.paymentMethod,
    p_notes: (options.notes || "").trim() || null,
  };
}

/** Hasil RPC create_order (nomor order & total dibuat database). */
export interface CreatedOrder {
  id: string;
  order_number: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  created_at: string;
  /** Batas bayar (khusus pesanan customer); null untuk order POS yang langsung lunas. */
  payment_due_at?: string | null;
  payment_channel?: "Kasir" | "Online";
}
