/**
 * FANTASI COFFEE - ORDER & TRANSACTION LIFECYCLE LOGIC
 * Mengelola aturan transisi status pesanan, pembatalan, refund, dan filter riwayat transaksi.
 * Sesuai PRD Iterasi 3 (Section 15, 16, 17, 18, 19).
 */

import { getBusinessDateString, getBusinessDayStartISO, toBusinessDateString } from './timezone';

export type OrderStatus = 'Pending' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
export type OrderType = 'Dine In' | 'Take Away';

/** Status pembayaran baku (PRD Section 16). Label tampilan: getPaymentStatusMeta. */
export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Metode pembayaran (PRD Section 16). Hanya Tunai yang masuk laci kas. */
export const PAYMENT_METHODS = ['Tunai', 'QRIS', 'Debit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

type BadgeTone = 'success' | 'danger' | 'neutral' | 'accent' | 'warning';

export function getPaymentMethodMeta(method: PaymentMethod | string): {
  label: string;
  isCash: boolean;
  icon: 'cash-outline' | 'qr-code-outline' | 'card-outline';
} {
  switch (method) {
    case 'Tunai':
      return { label: 'Tunai', isCash: true, icon: 'cash-outline' };
    case 'QRIS':
      return { label: 'QRIS', isCash: false, icon: 'qr-code-outline' };
    case 'Debit':
      return { label: 'Debit', isCash: false, icon: 'card-outline' };
    default:
      return { label: String(method), isCash: false, icon: 'card-outline' };
  }
}

/**
 * Label pembayaran untuk tampilan. Order belum dibayar yang dibatalkan
 * tetap berstatus Pending di database, tetapi ditampilkan "Tidak Dibayar".
 */
export function getPaymentStatusMeta(
  paymentStatus: PaymentStatus | string,
  orderStatus?: OrderStatus | string
): { label: string; tone: BadgeTone } {
  switch (paymentStatus) {
    case 'Paid':
      return { label: 'Lunas', tone: 'success' };
    case 'Refunded':
      return { label: 'Dikembalikan', tone: 'danger' };
    case 'Failed':
      return { label: 'Gagal', tone: 'danger' };
    case 'Pending':
      return orderStatus === 'Cancelled'
        ? { label: 'Tidak Dibayar', tone: 'neutral' }
        : { label: 'Belum Dibayar', tone: 'warning' };
    default:
      return { label: String(paymentStatus), tone: 'neutral' };
  }
}

/**
 * Status pembayaran setelah order dibatalkan (PRD 17.1):
 * sudah Paid → Refunded; selain itu tidak berubah (tidak ada uang yang berpindah).
 */
export function getCancellationPaymentStatus(current: PaymentStatus | string): PaymentStatus {
  if (current === 'Paid') return 'Refunded';
  return (PAYMENT_STATUSES as readonly string[]).includes(current) ? (current as PaymentStatus) : 'Pending';
}

export interface OrderRecord {
  id: string;
  order_number: string;
  user_id?: string | null;
  cashier_name?: string | null;
  customer_name?: string | null;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  order_type?: OrderType;
  notes?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  /** Waktu pembayaran diterima (diisi database). Dasar pengakuan omzet. */
  paid_at?: string | null;
  /** Batas bayar pesanan customer (created_at + 15 menit, diisi database). */
  payment_due_at?: string | null;
  /** 'Kasir' (bayar di kasir) atau 'Online' (QRIS online lewat Midtrans). */
  payment_channel?: 'Kasir' | 'Online';
  created_at: string;
  updated_at?: string;
}

type StaffOrCustomer = 'Admin' | 'Kasir' | 'Customer';

/** Status order yang hanya boleh dicapai bila pembayaran sudah lunas. */
const PAYMENT_GATED_STATUSES: OrderStatus[] = ['Processing', 'Ready', 'Completed'];

/** Pembayaran dianggap lunas hanya bila `Paid`. */
export function isPaymentSettled(status: PaymentStatus | string | null | undefined): boolean {
  return status === 'Paid';
}

/**
 * Aturan pengakuan omzet (PRD Section 21 & 22, revisi):
 * Order diakui sebagai penjualan saat pembayarannya lunas dan tidak dibatalkan,
 * terlepas dari status dapur (Processing / Ready / Completed).
 */
export function isRecognizedSale(order: {
  order_status?: OrderStatus | string | null;
  payment_status?: PaymentStatus | string | null;
}): boolean {
  return order.order_status !== 'Cancelled' && isPaymentSettled(order.payment_status);
}

/**
 * Validasi apakah transisi alur status pesanan diizinkan.
 * Sesuai PRD Section 17:
 * - Alur normal: Pending -> Processing -> Ready -> Completed
 * - Perubahan alur normal hanya dapat dilakukan oleh Kasir atau Admin.
 * - Customer tidak boleh mengubah status pesanan.
 * - Pesanan yang sudah Completed atau Cancelled tidak dapat diubah statusnya lagi.
 * - Order tidak boleh maju ke Processing/Ready/Completed sebelum pembayaran lunas
 *   (jika `paymentStatus` diberikan; database juga menegakkan aturan ini).
 */
export function canTransitionOrderStatus(
  current: OrderStatus,
  target: OrderStatus,
  userRole: StaffOrCustomer,
  paymentStatus?: PaymentStatus
): { allowed: boolean; reason?: string } {
  if (userRole === 'Customer') {
    return {
      allowed: false,
      reason: 'Customer tidak memiliki izin mengubah status pesanan.',
    };
  }

  if (current === target) {
    return { allowed: true };
  }

  if (current === 'Completed') {
    return {
      allowed: false,
      reason: 'Pesanan yang sudah Completed tidak dapat diubah statusnya lagi.',
    };
  }

  if (current === 'Cancelled') {
    return {
      allowed: false,
      reason: 'Pesanan yang sudah dibatalkan tidak dapat diaktifkan kembali.',
    };
  }

  // Alur normal bertahap
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    Pending: ['Processing', 'Cancelled'],
    Processing: ['Ready', 'Completed', 'Cancelled'],
    Ready: ['Completed', 'Cancelled'],
    Completed: [],
    Cancelled: [],
  };

  const allowedTargets = validTransitions[current] || [];
  if (!allowedTargets.includes(target)) {
    return {
      allowed: false,
      reason: `Transisi status tidak valid dari '${current}' ke '${target}'.`,
    };
  }

  if (
    paymentStatus !== undefined &&
    PAYMENT_GATED_STATUSES.includes(target) &&
    !isPaymentSettled(paymentStatus)
  ) {
    return {
      allowed: false,
      reason: 'Pembayaran belum dikonfirmasi. Konfirmasi pembayaran terlebih dahulu sebelum pesanan diproses.',
    };
  }

  return { allowed: true };
}

/**
 * Apakah staf boleh mengonfirmasi pembayaran sebuah order.
 * Hanya untuk order aktif (bukan Completed/Cancelled) yang pembayarannya masih Pending.
 */
export function canConfirmPayment(
  order: Pick<OrderRecord, 'order_status' | 'payment_status' | 'payment_due_at' | 'payment_channel'>,
  userRole: StaffOrCustomer,
  now?: Date
): { allowed: boolean; reason?: string } {
  if (userRole !== 'Admin' && userRole !== 'Kasir') {
    return { allowed: false, reason: 'Hanya Admin dan Kasir yang dapat mengonfirmasi pembayaran.' };
  }
  if (order.payment_channel === 'Online') {
    return {
      allowed: false,
      reason: 'Pesanan online dibayar lewat Midtrans dan terkonfirmasi otomatis setelah lunas.',
    };
  }
  if (order.order_status === 'Cancelled' || order.order_status === 'Completed') {
    return { allowed: false, reason: 'Pembayaran tidak dapat dikonfirmasi untuk pesanan yang sudah ditutup.' };
  }
  if (order.payment_status !== 'Pending') {
    return { allowed: false, reason: 'Pembayaran pesanan ini sudah tidak berstatus Pending.' };
  }
  if (now && isPaymentExpired(order, now)) {
    return {
      allowed: false,
      reason: `Pesanan sudah kedaluwarsa (tidak dibayar dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit). Buat pesanan baru lewat POS.`,
    };
  }
  return { allowed: true };
}

/**
 * Payload update saat kasir mengonfirmasi pembayaran.
 * Untuk order Pending, konfirmasi sekaligus menerima order (masuk Processing)
 * agar kasir cukup satu kali tekan.
 */
export function buildPaymentConfirmationUpdate(
  order: Pick<OrderRecord, 'order_status'>
): { payment_status: 'Paid'; order_status: OrderStatus } {
  return {
    payment_status: 'Paid',
    order_status: order.order_status === 'Pending' ? 'Processing' : order.order_status,
  };
}

/**
 * Order yang aman diselesaikan secara massal: status Ready dan sudah lunas.
 */
export function getBulkCompletableOrders<T extends Pick<OrderRecord, 'order_status' | 'payment_status'>>(
  orders: T[]
): T[] {
  return (orders || []).filter(
    (o) => o.order_status === 'Ready' && isPaymentSettled(o.payment_status)
  );
}

/**
 * Validasi apakah pesanan dapat dibatalkan.
 * Sesuai PRD Section 17.1:
 * - Pembatalan dapat dilakukan oleh Admin dan Kasir.
 * - Status Pending, Processing, atau Ready dapat dibatalkan.
 * - Status Completed atau Cancelled TIDAK DAPAT dibatalkan.
 */
export function canCancelOrder(
  order: Pick<OrderRecord, 'order_status'>,
  userRole: 'Admin' | 'Kasir' | 'Customer'
): { canCancel: boolean; error?: string } {
  if (userRole !== 'Admin' && userRole !== 'Kasir') {
    return {
      canCancel: false,
      error: 'Hanya Admin dan Kasir yang memiliki wewenang membatalkan pesanan.',
    };
  }

  if (order.order_status === 'Completed') {
    return {
      canCancel: false,
      error: 'Pesanan yang sudah Completed tidak dapat dibatalkan.',
    };
  }

  if (order.order_status === 'Cancelled') {
    return {
      canCancel: false,
      error: 'Pesanan sudah dibatalkan sebelumnya.',
    };
  }

  return { canCancel: true };
}

/**
 * Validasi data pembatalan pesanan.
 * Alasan pembatalan wajib diisi (minimal 3 karakter).
 */
export function validateCancellationPayload(reason: string): {
  isValid: boolean;
  error?: string;
} {
  const cleanReason = (reason || '').trim();
  if (!cleanReason) {
    return {
      isValid: false,
      error: 'Alasan pembatalan wajib diisi.',
    };
  }

  if (cleanReason.length < 3) {
    return {
      isValid: false,
      error: 'Alasan pembatalan minimal 3 karakter.',
    };
  }

  return { isValid: true };
}

/**
 * Filter riwayat pesanan berdasarkan rentang tanggal, status, dan pencarian nomor/nama.
 */
export function filterOrderHistory(
  orders: OrderRecord[],
  filters: {
    dateFilter?: 'all' | 'today' | '7days';
    statusFilter?: 'all' | OrderStatus;
    searchQuery?: string;
    now?: Date;
  }
): OrderRecord[] {
  const { dateFilter = 'all', statusFilter = 'all', searchQuery = '', now = new Date() } = filters;
  const cleanSearch = searchQuery.trim().toLowerCase();

  return orders.filter((order) => {
    // 1. Filter Status
    if (statusFilter !== 'all' && order.order_status !== statusFilter) {
      return false;
    }

    // 2. Filter Rentang Waktu
    if (dateFilter !== 'all') {
      const orderDate = new Date(order.created_at);
      if (isNaN(orderDate.getTime())) return false;

      if (dateFilter === 'today') {
        // Hari dihitung menurut zona waktu bisnis (WITA), bukan zona waktu perangkat.
        if (toBusinessDateString(order.created_at) !== getBusinessDateString(now)) return false;
      } else if (dateFilter === '7days') {
        const diffMs = now.getTime() - orderDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < 0 || diffDays > 7) return false;
      }
    }

    // 3. Filter Pencarian (Nomor Order atau Nama Pelanggan)
    if (cleanSearch) {
      const matchNumber = order.order_number.toLowerCase().includes(cleanSearch);
      const matchCustomer = (order.customer_name || '').toLowerCase().includes(cleanSearch);
      if (!matchNumber && !matchCustomer) return false;
    }

    return true;
  });
}

/**
 * Pemetaan warna/tone Badge status pesanan.
 */
export function getOrderStatusBadgeTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case 'Pending':
      return 'warning';
    case 'Processing':
      return 'accent';
    case 'Ready':
      return 'neutral';
    case 'Completed':
      return 'success';
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/**
 * Batas bawah created_at untuk query riwayat order (dipakai bersama paginasi keyset).
 * today = awal hari bisnis (WITA); 7days = 7×24 jam terakhir; all = tanpa batas.
 */
export function getOrderHistoryStartISO(
  dateFilter: 'all' | 'today' | '7days',
  now: Date = new Date()
): string | null {
  if (dateFilter === 'today') return getBusinessDayStartISO(getBusinessDateString(now));
  if (dateFilter === '7days') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

/**
 * #6: Customer boleh membatalkan pesanannya sendiri selama masih Pending dan belum dibayar.
 * Setelah dibayar/diproses, pembatalan (dan refund) dilakukan oleh Kasir/Admin.
 */
export function canCustomerCancelOrder(
  order: Pick<OrderRecord, 'order_status' | 'payment_status' | 'payment_channel'>
): { allowed: boolean; reason?: string } {
  if (order.order_status === 'Cancelled') {
    return { allowed: false, reason: 'Pesanan ini sudah dibatalkan.' };
  }
  if (order.payment_channel === 'Online' && order.payment_status === 'Pending') {
    // Mencegah kasus dibatalkan lalu QR tetap dibayar; QR kedaluwarsa sendiri.
    return {
      allowed: false,
      reason: `Pesanan online dibatalkan otomatis bila tidak dibayar dalam ${ONLINE_PAYMENT_TIMEOUT_MINUTES} menit.`,
    };
  }
  if (order.order_status !== 'Pending' || order.payment_status !== 'Pending') {
    return {
      allowed: false,
      reason: 'Pesanan sudah dibayar atau sedang diproses. Hubungi kasir untuk pembatalan.',
    };
  }
  return { allowed: true };
}

/**
 * PRD 15.1: Admin dapat mengoreksi data Payment, yaitu metode pembayaran order yang
 * sudah lunas (mis. tercatat Tunai padahal QRIS). Database mencatat koreksinya di catatan order.
 */
export function canCorrectPaymentMethod(
  order: Pick<OrderRecord, 'payment_status' | 'payment_method'>,
  userRole: StaffOrCustomer,
  newMethod: PaymentMethod
): { allowed: boolean; reason?: string } {
  if (userRole !== 'Admin') {
    return { allowed: false, reason: 'Hanya Admin yang dapat mengoreksi data pembayaran.' };
  }
  if (order.payment_status !== 'Paid') {
    return { allowed: false, reason: 'Koreksi hanya untuk pesanan yang sudah lunas.' };
  }
  if (order.payment_method === newMethod) {
    return { allowed: false, reason: 'Metode pembayaran baru sama dengan yang tercatat.' };
  }
  return { allowed: true };
}

// ----------------------------------------------------------------------------
// Batas waktu pembayaran pesanan customer & pengakuan omzet (audit iterasi 4)
// ----------------------------------------------------------------------------

/** Pesanan customer yang belum dibayar dibatalkan otomatis setelah batas ini. */
export const CUSTOMER_PAYMENT_TIMEOUT_MINUTES = 15;

/**
 * Batas bayar QRIS online (Midtrans). Pasangan: public.online_payment_timeout() &
 * supabase/functions/_shared/midtrans.ts — ubah ketiganya bersamaan.
 */
export const ONLINE_PAYMENT_TIMEOUT_MINUTES = 3;

/** Alasan pembatalan otomatis — harus sama dengan public.expire_unpaid_orders(). */
export const AUTO_CANCEL_REASON = `Otomatis dibatalkan: tidak dibayar dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit.`;

type PaymentDeadlineOrder = Pick<OrderRecord, 'order_status' | 'payment_status' | 'payment_due_at'>;

/** Pesanan customer yang masih menunggu dibayar di kasir. */
export function isAwaitingCustomerPayment(order: Pick<OrderRecord, 'order_status' | 'payment_status'>): boolean {
  return order.order_status === 'Pending' && order.payment_status === 'Pending';
}

/** Sisa waktu bayar dalam milidetik (boleh negatif), atau null bila tidak sedang menunggu bayar. */
export function getPaymentTimeLeftMs(order: PaymentDeadlineOrder, now: Date = new Date()): number | null {
  if (!isAwaitingCustomerPayment(order) || !order.payment_due_at) return null;
  const due = new Date(order.payment_due_at).getTime();
  if (Number.isNaN(due)) return null;
  return due - now.getTime();
}

/** Batas bayar sudah lewat (database akan/sudah membatalkannya). */
export function isPaymentExpired(order: PaymentDeadlineOrder, now: Date = new Date()): boolean {
  const left = getPaymentTimeLeftMs(order, now);
  return left !== null && left <= 0;
}

/** Hitung mundur "mm:ss", dibulatkan ke atas per detik. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Omzet diakui saat uang diterima; data lama tanpa paid_at memakai waktu order dibuat. */
export function getRevenueTimestamp(order: { paid_at?: string | null; created_at: string }): string {
  return order.paid_at || order.created_at;
}

/** Keterangan pembatalan untuk customer. */
export function describeCancellation(
  order: Pick<OrderRecord, 'cancelled_by' | 'cancellation_reason'>,
  viewerUserId?: string | null
): { title: string; detail: string } {
  const reason = (order.cancellation_reason || '').trim();
  if (!order.cancelled_by && reason === AUTO_CANCEL_REASON) {
    return {
      title: 'Dibatalkan otomatis',
      detail: `Pesanan tidak dibayar dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit. Silakan pesan kembali bila masih ingin membeli.`,
    };
  }
  if (!order.cancelled_by && (reason.startsWith('Otomatis dibatalkan') || reason.startsWith('Pembayaran online'))) {
    return { title: 'Dibatalkan otomatis', detail: `${reason} Silakan pesan kembali bila masih ingin membeli.` };
  }
  const title = viewerUserId && order.cancelled_by === viewerUserId ? 'Dibatalkan oleh Anda' : 'Dibatalkan oleh kasir';
  return { title, detail: reason ? `Alasan: ${reason}` : 'Pesanan ini telah dibatalkan.' };
}
