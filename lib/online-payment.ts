/**
 * Membuka halaman pembayaran QRIS Midtrans di dalam aplikasi (layar /(customer)/payment, WebView).
 * Token dibuat Edge Function create-midtrans-payment (server key ada di Supabase Secrets);
 * status lunas diperbarui webhook Midtrans, bukan oleh aplikasi.
 */
import { router } from 'expo-router';
import { supabase } from './supabase';

export async function requestOnlinePaymentUrl(
  orderId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('create-midtrans-payment', { body: { orderId } });
  if (error) {
    // Ambil pesan error dari function agar mudah dipahami customer.
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    return { ok: false, error: detail?.error || error.message || 'Gagal membuka pembayaran online.' };
  }
  const url = (data as { redirect_url?: string } | null)?.redirect_url;
  if (!url) return { ok: false, error: 'Halaman pembayaran tidak tersedia.' };
  return { ok: true, url };
}

/** Minta halaman bayar lalu buka layar pembayaran di dalam aplikasi. */
export async function openOnlinePayment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await requestOnlinePaymentUrl(orderId);
  if (!result.ok) return result;
  router.push({ pathname: '/(customer)/payment', params: { orderId, url: result.url } });
  return { ok: true };
}
