/**
 * FANTASI COFFEE - PEMBAYARAN ONLINE (MIDTRANS)
 * Customer memilih: QRIS online lewat Midtrans (lunas otomatis lewat webhook), atau
 * bayar di kasir (alur lama, batas 15 menit). Server key Midtrans hanya ada di
 * Supabase Secrets (Edge Function), tidak pernah di aplikasi.
 */
import type { PaymentMethod } from './order-logic';

export type PaymentChannel = 'Kasir' | 'Online';

export interface CustomerPaymentOption {
  key: 'online_qris' | 'kasir_tunai' | 'kasir_qris' | 'kasir_debit';
  label: string;
  description: string;
  channel: PaymentChannel;
  method: PaymentMethod;
  icon: string;
}

export const CUSTOMER_PAYMENT_OPTIONS: CustomerPaymentOption[] = [
  {
    key: 'online_qris',
    label: 'QRIS Online',
    description: 'Bayar sekarang lewat Midtrans; pesanan langsung diproses setelah lunas.',
    channel: 'Online',
    method: 'QRIS',
    icon: 'qr-code-outline',
  },
  {
    key: 'kasir_tunai',
    label: 'Tunai di Kasir',
    description: 'Bayar tunai di kasir dalam 15 menit.',
    channel: 'Kasir',
    method: 'Tunai',
    icon: 'cash-outline',
  },
  {
    key: 'kasir_qris',
    label: 'QRIS di Kasir',
    description: 'Scan QRIS kedai di kasir dalam 15 menit.',
    channel: 'Kasir',
    method: 'QRIS',
    icon: 'scan-outline',
  },
  {
    key: 'kasir_debit',
    label: 'Debit di Kasir',
    description: 'Bayar dengan kartu debit di kasir dalam 15 menit.',
    channel: 'Kasir',
    method: 'Debit',
    icon: 'card-outline',
  },
];

export function getCustomerPaymentOption(key: CustomerPaymentOption['key']): CustomerPaymentOption {
  return CUSTOMER_PAYMENT_OPTIONS.find((o) => o.key === key) ?? CUSTOMER_PAYMENT_OPTIONS[1];
}

export function isOnlineOrder(order: { payment_channel?: string | null }): boolean {
  return order.payment_channel === 'Online';
}

/** Pesanan online yang belum lunas belum perlu ditangani kasir. */
export function isHiddenFromKasir(order: { payment_channel?: string | null; payment_status: string }): boolean {
  return isOnlineOrder(order) && order.payment_status === 'Pending';
}

/**
 * Navigasi di dalam WebView pembayaran:
 * - 'load'     : halaman https (Midtrans) dimuat di dalam aplikasi;
 * - 'external' : tautan aplikasi e-wallet (gojek://, shopeeid://, intent://) dibuka di aplikasinya;
 * - 'block'    : http tanpa enkripsi dan skema lain (javascript:, file:, data:) diblokir.
 */
export function classifyPaymentNavigation(url: string): 'load' | 'external' | 'block' {
  const lower = (url || '').trim().toLowerCase();
  if (lower.startsWith('https://') || lower === 'about:blank') return 'load';
  if (/^(javascript|file|data|http|about|blob|content):/.test(lower)) return 'block';
  if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return 'external';
  return 'block';
}
