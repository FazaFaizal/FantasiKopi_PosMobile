// Edge Function: create-midtrans-payment
// Membuat halaman pembayaran QRIS (Midtrans Snap) untuk pesanan online milik customer.
// Server key Midtrans dibaca dari Supabase Secrets (MIDTRANS_SERVER_KEY) dan tidak pernah
// dikirim ke aplikasi. MIDTRANS_IS_PRODUCTION=true untuk mode produksi (default sandbox).
import { withSupabase } from 'npm:@supabase/server@1';
import { SNAP_URL, basicAuthHeader, buildSnapTransaction } from '../_shared/midtrans.ts';

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
    if (order.gateway_redirect_url) {
      return json({ redirect_url: order.gateway_redirect_url });
    }

    const { data: items } = await ctx.supabase
      .from('order_items')
      .select('product_id, product_name, unit_price, quantity')
      .eq('order_id', orderId);
    const { data: profile } = await ctx.supabase.from('users').select('email').maybeSingle();

    let payload;
    try {
      payload = buildSnapTransaction(order, items ?? [], { email: profile?.email ?? null });
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }

    const res = await fetch(production ? SNAP_URL.production : SNAP_URL.sandbox, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(serverKey),
      },
      body: JSON.stringify(payload),
    });
    const snap = await res.json().catch(() => null);
    if (!res.ok || !snap?.redirect_url) {
      const detail = Array.isArray(snap?.error_messages) ? snap.error_messages.join(', ') : '';
      return json({ error: `Gagal membuat pembayaran Midtrans. ${detail}`.trim() }, 502);
    }

    // Simpan tautan agar customer bisa membuka ulang halaman bayar (proses sistem).
    await ctx.supabaseAdmin
      .from('orders')
      .update({ gateway_redirect_url: snap.redirect_url, gateway_status: 'created', gateway_updated_at: new Date().toISOString() })
      .eq('id', orderId);

    return json({ redirect_url: snap.redirect_url, token: snap.token }, 201);
  }),
};
