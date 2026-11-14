/**
 * FANTASI COFFEE - CUSTOMER ORDERING LOGIC
 * Mengelola aturan validasi keranjang belanja, ketersediaan menu,
 * alur checkout mandiri, dan status pelacakan pesanan pelanggan.
 * Sesuai PRD Iterasi 4 (Section 23, 24, 25, 26).
 */

import { OrderStatus, OrderType, PaymentMethod, PaymentStatus, PAYMENT_METHODS } from './order-logic';

/**
 * Status awal pesanan customer (PRD Section 16 & 25, revisi).
 * Customer tidak bisa menandai pembayarannya sendiri sebagai lunas, termasuk QRIS:
 * pembayaran selalu dikonfirmasi kasir (cek uang tunai / mutasi QRIS di aplikasi merchant).
 */
export function getCustomerOrderInitialStatus(
  _paymentMethod: PaymentMethod
): { order_status: OrderStatus; payment_status: PaymentStatus } {
  return { order_status: 'Pending', payment_status: 'Pending' };
}

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

