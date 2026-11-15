// Logika murni Midtrans (Core API QRIS), dipakai Edge Function create-midtrans-payment &
// midtrans-webhook (dan diuji Jest). Tanpa import agar berjalan di Deno maupun Node.
// Referensi: docs.midtrans.com (Core API QRIS /v2/charge, Core API Advanced Features
// custom_expiry, HTTP Notification). QR ditampilkan langsung di aplikasi.

/** Batas bayar QRIS online (keputusan 2026-11-14). Pasangan: public.online_payment_timeout(). */
export const ONLINE_PAYMENT_TIMEOUT_MINUTES = 3;

export const CORE_CHARGE_URL = {
  sandbox: 'https://api.sandbox.midtrans.com/v2/charge',
  production: 'https://api.midtrans.com/v2/charge',
};

export function statusUrl(orderId: string, production: boolean): string {
  return `https://api${production ? '' : '.sandbox'}.midtrans.com/v2/${encodeURIComponent(orderId)}/status`;
}

export interface SnapOrder {
  id: string;
  order_number: string;
  total_amount: number;
  customer_name: string | null;
  created_at: string;
}

export interface SnapItem {
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Waktu dalam format Midtrans "YYYY-MM-DD HH:MM:SS +0700". */
export function formatMidtransTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0700`
  );
}

/**
 * Isi charge Core API QRIS (acquirer GoPay): kedaluwarsa 3 menit sejak pesanan dibuat
 * (sama dengan payment_due_at di database), total harus sama dengan jumlah item.
 */
export function buildQrisCharge(
  order: SnapOrder,
  items: SnapItem[],
  options: { email?: string | null }
) {
  const grossAmount = Math.round(Number(order.total_amount));
  const itemDetails = items.map((item, idx) => ({
    id: (item.product_id || `item-${idx + 1}`).slice(0, 50),
    price: Math.round(Number(item.unit_price)),
    quantity: Number(item.quantity),
    name: item.product_name.slice(0, 50),
  }));
  const sum = itemDetails.reduce((s, i) => s + i.price * i.quantity, 0);
  if (sum !== grossAmount) {
    throw new Error(`Total pesanan (${grossAmount}) tidak sesuai dengan jumlah item (${sum}).`);
  }

  const customer: { first_name?: string; email?: string } = {};
  if (order.customer_name) customer.first_name = order.customer_name.slice(0, 50);
  if (options.email) customer.email = options.email;

  return {
    payment_type: 'qris',
    transaction_details: { order_id: order.id, gross_amount: grossAmount },
    item_details: itemDetails,
    customer_details: customer,
    qris: { acquirer: 'gopay' },
    custom_expiry: {
      order_time: formatMidtransTime(order.created_at),
      expiry_duration: ONLINE_PAYMENT_TIMEOUT_MINUTES,
      unit: 'minute',
    },
  };
}

/** URL gambar QR (PNG) dari respons charge: actions[name = "generate-qr-code"]. */
export function extractQrCodeUrl(
  response: { actions?: { name?: string; url?: string }[] } | null | undefined
): string | null {
  const action = response?.actions?.find((a) => a?.name === 'generate-qr-code');
  return action?.url ?? null;
}

export function basicAuthHeader(serverKey: string): string {
  return `Basic ${btoa(`${serverKey}:`)}`;
}

/** Bahan tanda tangan webhook: SHA512(order_id + status_code + gross_amount + ServerKey). */
export function midtransSignatureInput(
  notification: { order_id: string; status_code: string; gross_amount: string },
  serverKey: string
): string {
  return `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`;
}

export type GatewayOutcome = 'paid' | 'pending' | 'failed' | 'ignore';

/** settlement / capture+accept = lunas; expire/cancel/deny/failure = gagal. */
export function mapMidtransStatus(transactionStatus: string, fraudStatus?: string | null): GatewayOutcome {
  switch (transactionStatus) {
    case 'settlement':
      return 'paid';
    case 'capture':
      return !fraudStatus || fraudStatus === 'accept' ? 'paid' : 'failed';
    case 'pending':
      return 'pending';
    case 'expire':
    case 'cancel':
    case 'deny':
    case 'failure':
      return 'failed';
    default:
      return 'ignore';
  }
}
