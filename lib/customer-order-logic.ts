/**
 * FANTASI COFFEE - CUSTOMER ORDERING LOGIC
 * Mengelola aturan validasi keranjang belanja, ketersediaan menu,
 * alur checkout mandiri, dan status pelacakan pesanan pelanggan.
 * Sesuai PRD Iterasi 4 (Section 23, 24, 25, 26).
 */

import { OrderStatus, OrderType, PaymentMethod, PaymentStatus, PAYMENT_METHODS } from './order-logic';
import { formatRupiah } from './formatters';

// ----------------------------------------------------------------------------
// Batas pesanan customer (keputusan 2026-11-14; khusus customer, POS tidak terpengaruh).
// Pasangan di database: public.create_order — ubah keduanya bersamaan.
// ----------------------------------------------------------------------------
/** Pesanan belum dibayar (bayar di kasir) yang boleh dimiliki customer sekaligus. */
export const CUSTOMER_MAX_UNPAID_ORDERS = 1;
/** Jumlah maksimal per menu dalam satu pesanan. */
export const CUSTOMER_MAX_ITEM_QUANTITY = 99;
/** Jumlah maksimal menu berbeda dalam satu pesanan. */
export const CUSTOMER_MAX_DISTINCT_PRODUCTS = 10;

export interface CustomerCartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  status?: string;
  is_active?: boolean;
}

export interface CustomerCheckoutPayload {
  cart: CustomerCartItem[];
  customerName: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  tableNumber?: string;
  notes?: string;
}

export interface CustomerOrderStatusMeta {
  step: number;
  label: string;
  tone: 'warning' | 'accent' | 'neutral' | 'success' | 'danger';
  description: string;
}

/**
 * Validasi apakah suatu produk dapat ditambahkan ke keranjang belanja pelanggan.
 * PRD Section 23: "Product dengan status Tidak Tersedia tidak dapat dipesan."
 */
export function canAddProductToCustomerCart(product: {
  id?: string;
  name?: string;
  status?: string;
  is_active?: boolean;
}): { canAdd: boolean; reason?: string } {
  if (product.is_active === false) {
    return {
      canAdd: false,
      reason: 'Produk saat ini sedang tidak aktif dan tidak dapat dipesan.',
    };
  }

  if (product.status === 'Tidak Tersedia' || product.status === 'Habis') {
    return {
      canAdd: false,
      reason: 'Produk sedang tidak tersedia (habis).',
    };
  }

  return { canAdd: true };
}

/**
 * Validasi payload formulir checkout oleh pelanggan.
 * PRD Section 24 & 25:
 * - Keranjang tidak boleh kosong
 * - Kuantitas tiap item harus > 0
 * - Seluruh item wajib berstatus Tersedia
 * - Nama pelanggan wajib diisi
 * - Tipe pesanan wajib Dine In atau Take Away
 * - Metode pembayaran wajib Tunai atau QRIS
 */
export function validateCustomerCheckoutPayload(payload: CustomerCheckoutPayload): {
  isValid: boolean;
  error?: string;
} {
  // 1. Validasi Keranjang
  if (!payload.cart || payload.cart.length === 0) {
    return {
      isValid: false,
      error: 'Keranjang belanja masih kosong. Silakan pilih menu terlebih dahulu.',
    };
  }

  for (const item of payload.cart) {
    if (!item.quantity || item.quantity <= 0) {
      return {
        isValid: false,
        error: `Kuantitas untuk menu '${item.productName}' tidak valid.`,
      };
    }

    if (item.status === 'Tidak Tersedia' || item.status === 'Habis') {
      return {
        isValid: false,
        error: `Menu '${item.productName}' saat ini sedang tidak tersedia. Silakan hapus dari keranjang.`,
      };
    }
  }

  // 1b. Batas pesanan customer (sama dengan create_order di database)
  const limitError = getCartLimitError(payload.cart);
  if (limitError) {
    return { isValid: false, error: limitError };
  }

  // 2. Validasi Nama Pelanggan
  const cleanName = (payload.customerName || '').trim();
  if (!cleanName) {
    return {
      isValid: false,
      error: 'Nama pemesan wajib diisi untuk konfirmasi pesanan.',
    };
  }

  // 3. Validasi Tipe Pesanan
  if (payload.orderType !== 'Dine In' && payload.orderType !== 'Take Away') {
    return {
      isValid: false,
      error: 'Tipe pesanan tidak valid. Pilih antara Dine In atau Take Away.',
    };
  }

  // 4. Validasi Metode Pembayaran
  if (!(PAYMENT_METHODS as readonly string[]).includes(payload.paymentMethod)) {
    return {
      isValid: false,
      error: 'Metode pembayaran tidak valid. Pilih Tunai, QRIS, atau Debit.',
    };
  }

  return { isValid: true };
}

/**
 * Pemetaan metadata alur status pelacakan pesanan pelanggan.
 * PRD Section 26:
 * - Pending (step 1) -> Menunggu Konfirmasi Kasir
 * - Processing (step 2) -> Sedang Disiapkan Barista
 * - Ready (step 3) -> Siap Diambil di Meja/Bar
 * - Completed (step 4) -> Selesai
 * - Cancelled (step 0) -> Dibatalkan
 */
export function getCustomerOrderStatusMeta(status: OrderStatus): CustomerOrderStatusMeta {
  switch (status) {
    case 'Pending':
      return {
        step: 1,
        label: 'Menunggu Konfirmasi',
        tone: 'warning',
        description:
          'Pesanan diterima, menunggu konfirmasi pembayaran oleh kasir. Silakan bayar di kasir; pesanan disiapkan setelah pembayaran dikonfirmasi.',
      };
    case 'Processing':
      return {
        step: 2,
        label: 'Sedang Disiapkan',
        tone: 'accent',
        description: 'Pesanan sedang disiapkan dan diracik oleh barista.',
      };
    case 'Ready':
      return {
        step: 3,
        label: 'Siap Diambil',
        tone: 'neutral',
        description: 'Pesanan Anda sudah siap! Silakan ambil di konter atau tunggu diantar.',
      };
    case 'Completed':
      return {
        step: 4,
        label: 'Selesai',
        tone: 'success',
        description: 'Pesanan telah selesai. Terima kasih telah memesan di Fantasi Coffee!',
      };
    case 'Cancelled':
      return {
        step: 0,
        label: 'Dibatalkan',
        tone: 'danger',
        description: 'Pesanan telah dibatalkan.',
      };
    default:
      return {
        step: 0,
        label: status,
        tone: 'neutral',
        description: 'Status pesanan tidak diketahui.',
      };
  }
}

// ----------------------------------------------------------------------------
// Sinkronisasi keranjang dengan menu terbaru (audit iterasi 4)
// Database selalu menagih harga terbaru, jadi keranjang ikut diperbarui agar total
// yang dilihat customer sama dengan yang ditagih.
// ----------------------------------------------------------------------------

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  status: string;
  is_active: boolean;
}

export function syncCartWithProducts(
  cart: CustomerCartItem[],
  products: CatalogProduct[]
): { cart: CustomerCartItem[]; changes: string[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const changes: string[] = [];
  let changed = false;

  const next = cart.map((item) => {
    const product = byId.get(item.productId);
    const available = !!product && product.is_active && product.status === 'Tersedia';
    const wasAvailable = item.status !== 'Tidak Tersedia' && item.status !== 'Habis' && item.is_active !== false;
    let updated = item;

    if (!available && wasAvailable) {
      changes.push(`${item.productName} sedang tidak tersedia. Hapus dari keranjang untuk melanjutkan.`);
      updated = { ...updated, status: 'Tidak Tersedia', is_active: product ? product.is_active : false };
    }
    if (product && Number(product.price) !== Number(item.unitPrice)) {
      changes.push(`Harga ${item.productName} berubah: ${formatRupiah(item.unitPrice)} → ${formatRupiah(Number(product.price))}.`);
      updated = { ...updated, unitPrice: Number(product.price) };
    }
    if (available && !wasAvailable) {
      updated = { ...updated, status: 'Tersedia', is_active: true };
    }
    if (updated !== item) changed = true;
    return updated;
  });

  return { cart: changed ? next : cart, changes };
}

/** Pemberitahuan bila total yang ditagih database berbeda dari total di keranjang. */
export function getServerTotalNotice(cartTotal: number, serverTotal: number): string | null {
  if (Number(cartTotal) === Number(serverTotal)) return null;
  return `Total disesuaikan dengan harga terbaru menjadi ${formatRupiah(Number(serverTotal))} (sebelumnya ${formatRupiah(Number(cartTotal))}).`;
}

/**
 * Isi tampilan detail produk (tahan kartu menu untuk melihat, lepas untuk menutup).
 * Produk habis tetap ditampilkan tetapi tidak dapat dipesan.
 */
export function getProductDetailView(product: {
  status?: string;
  is_active?: boolean;
  description?: string | null;
}): { statusLabel: 'Tersedia' | 'Habis'; tone: 'success' | 'danger'; canOrder: boolean; description: string } {
  const canOrder = canAddProductToCustomerCart(product).canAdd;
  return {
    statusLabel: canOrder ? 'Tersedia' : 'Habis',
    tone: canOrder ? 'success' : 'danger',
    canOrder,
    description: (product.description || '').trim() || 'Belum ada deskripsi untuk menu ini.',
  };
}

/** Jumlah per menu dijumlah lintas baris keranjang (menu sama, catatan berbeda). */
function quantityByProduct(cart: CustomerCartItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of cart) totals.set(item.productId, (totals.get(item.productId) || 0) + Number(item.quantity || 0));
  return totals;
}

function getCartLimitError(cart: CustomerCartItem[]): string | null {
  const totals = quantityByProduct(cart);
  if (totals.size > CUSTOMER_MAX_DISTINCT_PRODUCTS) {
    return `Maksimal ${CUSTOMER_MAX_DISTINCT_PRODUCTS} menu berbeda per pesanan.`;
  }
  for (const [productId, qty] of totals) {
    if (qty > CUSTOMER_MAX_ITEM_QUANTITY) {
      const name = cart.find((c) => c.productId === productId)?.productName ?? 'menu';
      return `Jumlah ${name} maksimal ${CUSTOMER_MAX_ITEM_QUANTITY} per pesanan.`;
    }
  }
  return null;
}

/** Apakah menambah `addQty` menu `productId` ke keranjang masih dalam batas. */
export function checkCustomerCartChange(
  cart: CustomerCartItem[],
  productId: string,
  addQty: number
): { allowed: boolean; reason?: string } {
  const totals = quantityByProduct(cart);
  if (!totals.has(productId) && totals.size >= CUSTOMER_MAX_DISTINCT_PRODUCTS) {
    return { allowed: false, reason: `Maksimal ${CUSTOMER_MAX_DISTINCT_PRODUCTS} menu berbeda per pesanan.` };
  }
  if ((totals.get(productId) || 0) + addQty > CUSTOMER_MAX_ITEM_QUANTITY) {
    return { allowed: false, reason: `Jumlah per menu maksimal ${CUSTOMER_MAX_ITEM_QUANTITY}.` };
  }
  return { allowed: true };
}

/**
 * Pesanan customer yang belum dibayar dan belum kedaluwarsa. Selama ada, customer
 * tidak dapat membuat pesanan baru (maks. CUSTOMER_MAX_UNPAID_ORDERS).
 */
export function findBlockingUnpaidOrder<
  T extends { order_status: OrderStatus; payment_status: PaymentStatus; payment_due_at?: string | null }
>(orders: T[], now: Date = new Date()): T | null {
  const active = orders.filter(
    (o) =>
      o.order_status === 'Pending' &&
      o.payment_status === 'Pending' &&
      (!o.payment_due_at || new Date(o.payment_due_at).getTime() > now.getTime())
  );
  return active.length >= CUSTOMER_MAX_UNPAID_ORDERS ? active[0] : null;
}
