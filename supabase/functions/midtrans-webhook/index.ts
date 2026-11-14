// Edge Function: midtrans-webhook
// Menerima HTTP Notification Midtrans (Payment Notification URL di dashboard Midtrans:
// https://<project-ref>.supabase.co/functions/v1/midtrans-webhook). Dideploy dengan
// verify_jwt = false karena Midtrans tidak mengirim JWT Supabase; keaslian dipastikan dengan:
//   1. signature_key = SHA512(order_id + status_code + gross_amount + Signature Secret Key), dan
//   2. konfirmasi ulang ke Get Status API Midtrans (GET /v2/{order_id}/status).
// Sejak 28 Okt 2026 Midtrans menandatangani notifikasi dengan Signature Secret Key
// (Settings → Access Keys → Payment), terpisah dari Server Key → secret MIDTRANS_SIGNATURE_KEY.
// Akun lama yang kedua kuncinya masih sama boleh hanya mengisi MIDTRANS_SERVER_KEY.
// Status lalu diterapkan lewat public.apply_midtrans_notification (hanya service_role).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuthHeader, mapMidtransStatus, midtransSignatureInput, statusUrl } from '../_shared/midtrans.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function sha512Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan.' }, 405);

  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY');
  if (!serverKey) return json({ error: 'MIDTRANS_SERVER_KEY belum diatur.' }, 503);
  const signatureKey = Deno.env.get('MIDTRANS_SIGNATURE_KEY') || serverKey;
  const production = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

  const n = await req.json().catch(() => null);
  if (!n?.order_id || !n?.status_code || !n?.gross_amount || !n?.signature_key) {
    return json({ error: 'Notifikasi tidak lengkap.' }, 400);
  }

  // 1. Tanda tangan
  const expected = await sha512Hex(
    midtransSignatureInput(
      { order_id: String(n.order_id), status_code: String(n.status_code), gross_amount: String(n.gross_amount) },
      signatureKey
    )
  );
  if (expected !== String(n.signature_key).toLowerCase()) {
    return json({ error: 'Tanda tangan tidak valid.' }, 401);
  }

  // Notifikasi uji dari dashboard Midtrans memakai order_id acak → abaikan dengan 200.
  if (!UUID.test(String(n.order_id))) return json({ result: 'ignored' });

  // 2. Konfirmasi ulang status ke Midtrans
  const res = await fetch(statusUrl(String(n.order_id), production), {
    headers: { Accept: 'application/json', Authorization: basicAuthHeader(serverKey) },
  });
  const status = await res.json().catch(() => null);
  if (res.status === 404 || status?.status_code === '404') return json({ result: 'ignored' });
  if (!res.ok || !status?.transaction_status) {
    // Bukan 2xx → Midtrans mengirim ulang notifikasi nanti.
    return json({ error: 'Gagal memeriksa status ke Midtrans.' }, 502);
  }

  // 3. Terapkan ke pesanan
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc('apply_midtrans_notification', {
    p_order_id: String(n.order_id),
    p_transaction_status: String(status.transaction_status),
    p_fraud_status: status.fraud_status ?? null,
    p_gross_amount: Number(status.gross_amount),
    p_payment_type: status.payment_type ?? null,
    p_transaction_id: status.transaction_id ?? null,
  });
  if (error) return json({ error: error.message }, 500);

  return json({ result: data, outcome: mapMidtransStatus(String(status.transaction_status), status.fraud_status) });
});
