// Edge Function: create-midtrans-payment
// Membuat transaksi QRIS (Midtrans Core API /v2/charge) untuk pesanan online milik customer
// dan mengembalikan URL gambar QR yang ditampilkan langsung di aplikasi.
// Server key Midtrans dibaca dari Supabase Secrets (MIDTRANS_SERVER_KEY) dan tidak pernah
// dikirim ke aplikasi; key butuh izin "Core API: Write". MIDTRANS_IS_PRODUCTION=true untuk
// mode produksi (default sandbox).
import { withSupabase } from 'npm:@supabase/server@1';
import { CORE_CHARGE_URL, basicAuthHeader, buildQrisCharge, extractQrCodeUrl } from '../_shared/midtrans.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan.' }, 405);

    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY');
    if (!serverKey) {
      return json({ error: 'Pembayaran online belum dikonfigurasi. Silakan bayar di kasir.' }, 503);
    }
    const production = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

    const body = await req.json().catch(() => null);
    const orderId = String(body?.orderId ?? '');
    if (!UUID.test(orderId)) return json({ error: 'Pesanan tidak valid.' }, 400);

    // Klien milik pengguna (RLS): customer hanya dapat membaca pesanannya sendiri.
    const { data: order } = await ctx.supabase
      .from('orders')
      .select('id, order_number, total_amount, customer_name, created_at, payment_channel, payment_status, order_status, payment_due_at, gateway_redirect_url')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return json({ error: 'Pesanan tidak ditemukan.' }, 404);
    if (order.payment_channel !== 'Online') return json({ error: 'Pesanan ini dibayar di kasir.' }, 400);
    if (order.payment_status !== 'Pending' || order.order_status !== 'Pending') {
      return json({ error: 'Pesanan sudah dibayar atau dibatalkan.' }, 409);
    }
    if (order.payment_due_at && new Date(order.payment_due_at).getTime() <= Date.now()) {
      return json({ error: 'Batas waktu pembayaran sudah habis. Silakan pesan kembali.' }, 410);
    }
    // QR sudah dibuat sebelumnya (mis. customer membuka ulang layar bayar).
    if (order.gateway_redirect_url) {
      return json({ qr_url: order.gateway_redirect_url, due_at: order.payment_due_at });
    }

    const { data: items } = await ctx.supabase
      .from('order_items')
      .select('product_id, product_name, unit_price, quantity')
      .eq('order_id', orderId);
    const { data: profile } = await ctx.supabase.from('users').select('email').maybeSingle();

    let payload;
    try {
      payload = buildQrisCharge(order, items ?? [], { email: profile?.email ?? null });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }

    const res = await fetch(production ? CORE_CHARGE_URL.production : CORE_CHARGE_URL.sandbox, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(serverKey),
      },
      body: JSON.stringify(payload),
    });
    const charge = await res.json().catch(() => null);
    const qrUrl = extractQrCodeUrl(charge);
    // Core API dapat membalas HTTP 200 dengan status_code di badan respons.
    if (!res.ok || !qrUrl || (charge?.status_code && !String(charge.status_code).startsWith('2'))) {
      const detail = charge?.status_message ?? (Array.isArray(charge?.validation_messages) ? charge.validation_messages.join(', ') : '');
      return json({ error: `Gagal membuat QRIS Midtrans. ${detail}`.trim() }, 502);
    }

    // Simpan URL gambar QR (proses sistem) agar layar bayar bisa dibuka ulang.
    await ctx.supabaseAdmin
      .from('orders')
      .update({
        gateway_redirect_url: qrUrl,
        gateway_status: charge.transaction_status ?? 'pending',
        gateway_payment_type: charge.payment_type ?? 'qris',
        gateway_transaction_id: charge.transaction_id ?? null,
        gateway_updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return json({ qr_url: qrUrl, due_at: order.payment_due_at }, 201);
  }),
};
