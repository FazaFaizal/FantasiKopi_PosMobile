/**
 * Pembayaran QRIS online: Edge Function create-midtrans-payment membuat transaksi QRIS di
 * Midtrans (server key ada di Supabase Secrets) dan mengembalikan URL gambar QR, yang
 * ditampilkan di layar /(customer)/payment. Status lunas diperbarui webhook Midtrans.
 */
import { router } from 'expo-router';
import { supabase } from './supabase';

export async function requestOnlinePaymentQr(
  orderId: string
): Promise<{ ok: true; qrUrl: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('create-midtrans-payment', { body: { orderId } });
  if (error) {
    // Ambil pesan error dari function agar mudah dipahami customer.
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    return { ok: false, error: detail?.error || error.message || 'Gagal membuat QRIS.' };
  }
  const qrUrl = (data as { qr_url?: string } | null)?.qr_url;
  if (!qrUrl) return { ok: false, error: 'QRIS tidak tersedia.' };
  return { ok: true, qrUrl };
}

/** Minta QRIS lalu buka layar Bayar QRIS di dalam aplikasi. */
export async function openOnlinePayment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await requestOnlinePaymentQr(orderId);
  if (!result.ok) return result;
  router.push({ pathname: '/(customer)/payment', params: { orderId, qrUrl: result.qrUrl } });
  return { ok: true };
}
