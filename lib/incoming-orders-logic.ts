import { getPaymentTimeLeftMs, type OrderStatus, type PaymentStatus } from './order-logic';

/** Baris pesanan yang dibutuhkan panel "Pesanan masuk" di POS. */
export interface IncomingOrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_amount: number;
  payment_method: string | null;
  payment_channel: 'Kasir' | 'Online' | string | null;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  order_type: string | null;
  created_at: string;
  payment_due_at: string | null;
}

export interface IncomingOrderGroups {
  /** Pesanan customer yang harus dibayar di kasir, batas bayar terdekat lebih dulu. */
  awaitingPayment: IncomingOrderRow[];
  /** Pesanan QRIS online yang sudah lunas dan tinggal disiapkan, terlama lebih dulu. */
  paidOnlineToPrepare: IncomingOrderRow[];
  /** Angka badge: semua pesanan customer yang perlu ditindaklanjuti kasir. */
  total: number;
}

/** Filter Supabase `.or()` untuk mengambil kedua kelompok pesanan sekaligus. */
export const INCOMING_ORDERS_FILTER =
  'and(order_status.eq.Pending,payment_status.eq.Pending,payment_channel.eq.Kasir),' +
  'and(order_status.eq.Processing,payment_status.eq.Paid,payment_channel.eq.Online)';

/**
 * Kelompokkan pesanan masuk untuk kasir. Pesanan bayar-di-kasir yang batas bayarnya
 * sudah lewat tidak ditampilkan karena database akan membatalkannya.
 */
export function groupIncomingOrders(rows: IncomingOrderRow[], now: Date = new Date()): IncomingOrderGroups {
  const awaitingPayment = rows
    .filter(
      (r) =>
        r.payment_channel === 'Kasir' &&
        r.order_status === 'Pending' &&
        r.payment_status === 'Pending' &&
        (getPaymentTimeLeftMs(r, now) ?? 1) > 0
    )
    .sort((a, b) => dueTime(a) - dueTime(b));

  const paidOnlineToPrepare = rows
    .filter((r) => r.payment_channel === 'Online' && r.order_status === 'Processing' && r.payment_status === 'Paid')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return {
    awaitingPayment,
    paidOnlineToPrepare,
    total: awaitingPayment.length + paidOnlineToPrepare.length,
  };
}

/** Teks badge: angka di atas 99 diringkas. */
export function formatBadgeCount(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

function dueTime(r: IncomingOrderRow): number {
  const t = r.payment_due_at ? new Date(r.payment_due_at).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
