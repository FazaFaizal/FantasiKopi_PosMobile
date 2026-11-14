/**
 * FANTASI COFFEE - RECENT ACTIVITY (PRD 27: "Aktivitas operasional penting")
 * Baris aktivitas berasal dari RPC public.get_recent_activity (khusus Admin);
 * modul ini mengubahnya menjadi teks, warna, dan tujuan navigasi.
 */
import { formatRupiah } from './formatters';
import { getBusinessDateString } from './timezone';
import { CUSTOMER_PAYMENT_TIMEOUT_MINUTES } from './order-logic';

export type ActivityKind =
  | 'shift_open'
  | 'shift_close'
  | 'order_cancel'
  | 'order_refund'
  | 'order_auto_cancel'
  | 'payment_correction'
  | 'stock_movement'
  | 'expense';

export type ActivityCategory = 'kas' | 'pesanan' | 'stok';

/** Bentuk baris dari get_recent_activity. */
export interface ActivityRow {
  kind: ActivityKind;
  category: ActivityCategory;
  occurred_at: string;
  /** Email / nama pelaku (null untuk proses otomatis). */
  actor: string | null;
  ref_id: string | null;
  /** Nomor order, nama bahan, atau deskripsi pengeluaran. */
  ref_label: string | null;
  /** Kas awal, selisih kas, nilai refund, atau nilai pengeluaran. */
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  /** Alasan / catatan. */
  note: string | null;
  /** Info tambahan: metode bayar, "Tunai → QRIS", jenis mutasi, atau "cash". */
  extra: string | null;
}

export type ActivityTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface ActivityView {
  icon: string;
  tone: ActivityTone;
  title: string;
  detail: string;
  route: string;
}

export const ACTIVITY_FILTERS: { key: string; label: string; category: ActivityCategory | null }[] = [
  { key: 'semua', label: 'Semua', category: null },
  { key: 'kas', label: 'Kas', category: 'kas' },
  { key: 'pesanan', label: 'Pesanan', category: 'pesanan' },
  { key: 'stok', label: 'Stok', category: 'stok' },
];

const STOCK_LABELS: Record<string, string> = {
  'Stock In': 'Stok masuk',
  'Stock Out': 'Stok keluar',
  'Stock Adjustment': 'Penyesuaian stok',
};

const by = (actor: string | null) => (actor ? ` oleh ${actor}` : '');
const withNote = (text: string, note: string | null) => (note ? `${text} · ${note}` : text);
const formatQty = (n: number | null) => (n === null ? '-' : Number(n).toLocaleString('id-ID'));

export function describeActivity(row: ActivityRow): ActivityView {
  const amount = Number(row.amount ?? 0);
  switch (row.kind) {
    case 'shift_open':
      return {
        icon: 'lock-open-outline',
        tone: 'neutral',
        title: `Sif dibuka${by(row.actor)}`,
        detail: withNote(`Kas awal ${formatRupiah(amount)}`, row.note),
        route: '/(admin)/cash',
      };
    case 'shift_close':
      return {
        icon: 'lock-closed-outline',
        tone: amount === 0 ? 'success' : 'warning',
        title: `Sif ditutup${by(row.actor)}`,
        detail: withNote(
          amount === 0
            ? 'Kas sesuai dengan hitungan sistem'
            : `Selisih kas ${amount > 0 ? '+' : '−'}${formatRupiah(Math.abs(amount))}`,
          row.note
        ),
        route: '/(admin)/cash',
      };
    case 'order_refund':
      return {
        icon: 'return-down-back-outline',
        tone: 'danger',
        title: `${row.ref_label ?? 'Pesanan'} dibatalkan & di-refund${by(row.actor)}`,
        detail: withNote(`Refund ${formatRupiah(amount)}${row.extra ? ` (${row.extra})` : ''}`, row.note ? `Alasan: ${row.note}` : null),
        route: '/(admin)/orders',
      };
    case 'order_cancel':
      return {
        icon: 'close-circle-outline',
        tone: 'warning',
        title: `${row.ref_label ?? 'Pesanan'} dibatalkan${by(row.actor)}`,
        detail: row.note ? `Alasan: ${row.note}` : 'Belum dibayar, tidak ada uang yang dikembalikan',
        route: '/(admin)/orders',
      };
    case 'order_auto_cancel':
      return {
        icon: 'timer-outline',
        tone: 'neutral',
        title: `${row.ref_label ?? 'Pesanan'} batal otomatis`,
        detail: row.note?.startsWith('Pembayaran online')
          ? row.note
          : `Customer tidak membayar dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit`,
        route: '/(admin)/orders',
      };
    case 'payment_correction':
      return {
        icon: 'swap-horizontal-outline',
        tone: 'warning',
        title: `${row.ref_label ?? 'Pesanan'}: metode bayar dikoreksi`,
        detail: `${row.extra ?? '-'}${by(row.actor)}`,
        route: '/(admin)/orders',
      };
    case 'stock_movement':
      return {
        icon: 'cube-outline',
        tone: row.extra === 'Stock Adjustment' ? 'warning' : 'neutral',
        title: `${STOCK_LABELS[row.extra ?? ''] ?? 'Mutasi stok'} ${row.ref_label ?? ''}`.trim(),
        detail: withNote(`${formatQty(row.quantity)} ${row.unit ?? ''}`.trim() + by(row.actor), row.note),
        route: '/(admin)/inventory',
      };
    case 'expense':
    default:
      return {
        icon: 'wallet-outline',
        tone: 'neutral',
        title: `Pengeluaran ${formatRupiah(amount)}`,
        detail: `${row.ref_label ?? '-'}${row.extra === 'cash' ? ' · dari kas laci' : ''}${by(row.actor)}`,
        route: '/(admin)/expense',
      };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BUSINESS_UTC_OFFSET_MS = 8 * 60 * 60 * 1000; // WITA, sama dengan lib/timezone.ts

/** Waktu aktivitas (WITA): "HH:mm" untuk hari ini, "DD Mon HH:mm" untuk hari lain. */
export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const local = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  if (getBusinessDateString(date) === getBusinessDateString(now)) return `${hh}:${mm}`;
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${hh}:${mm}`;
}
