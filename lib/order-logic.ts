/**
 * FANTASI COFFEE - ORDER & TRANSACTION LIFECYCLE LOGIC
 * Mengelola aturan transisi status pesanan, pembatalan, refund, dan filter riwayat transaksi.
 * Sesuai PRD Iterasi 3 (Section 15, 16, 17, 18, 19).
 */

export type OrderStatus = 'Pending' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
export type OrderType = 'Dine In' | 'Take Away';
export type PaymentStatus = 'Pending' | 'Paid' | 'Lunas' | 'Failed' | 'Refunded' | 'Batal';

export interface OrderRecord {
  id: string;
  order_number: string;
  user_id?: string | null;
  cashier_name?: string | null;
  customer_name?: string | null;
  total_amount: number;
  payment_method: 'Tunai' | 'QRIS';
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  order_type?: OrderType;
  notes?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

/**
 * Validasi apakah transisi alur status pesanan diizinkan.
 * Sesuai PRD Section 17:
 * - Alur normal: Pending -> Processing -> Ready -> Completed
 * - Perubahan alur normal hanya dapat dilakukan oleh Kasir atau Admin.
 * - Customer tidak boleh mengubah status pesanan.
 * - Pesanan yang sudah Completed atau Cancelled tidak dapat diubah statusnya lagi.
 */
export function canTransitionOrderStatus(
  current: OrderStatus,
  target: OrderStatus,
  userRole: 'Admin' | 'Kasir' | 'Customer'
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

  return { allowed: true };
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
        const isSameDay =
          orderDate.getFullYear() === now.getFullYear() &&
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getDate() === now.getDate();
        if (!isSameDay) return false;
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
export function getOrderStatusBadgeTone(
  status: OrderStatus
): 'success' | 'danger' | 'neutral' | 'accent' | 'warning' {
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
