/**
 * PEMBAYARAN QRIS ONLINE (MIDTRANS SNAP) — keputusan 2026-11-14
 * - Customer memilih: QRIS online lewat Midtrans, atau bayar di kasir (alur lama, 15 menit).
 * - Batas bayar QRIS online: 3 menit.
 * - Pesanan online baru tampil di kasir setelah lunas; lunas hanya lewat webhook Midtrans
 *   yang tanda tangannya terverifikasi.
 */
import {
  ONLINE_PAYMENT_TIMEOUT_MINUTES,
  basicAuthHeader,
  buildSnapTransaction,
  formatMidtransTime,
  mapMidtransStatus,
  midtransSignatureInput,
} from '../supabase/functions/_shared/midtrans';
import {
  CUSTOMER_PAYMENT_OPTIONS,
  classifyPaymentNavigation,
  getCustomerPaymentOption,
  isHiddenFromKasir,
  isOnlineOrder,
} from '../lib/payment-gateway-logic';
import { canConfirmPayment, canCustomerCancelOrder, describeCancellation } from '../lib/order-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();
const MIGRATION = 'supabase/migrations/20261114000005_midtrans_online_payment.sql';

// ---------------------------------------------------------------------------
// Logika Midtrans (dipakai Edge Function)
// ---------------------------------------------------------------------------
describe('Midtrans: transaksi Snap', () => {
  const order = {
    id: '11111111-1111-1111-1111-111111111111',
    order_number: 'ORD-20261114-0007',
    total_amount: 51000,
    customer_name: 'Sari',
    created_at: '2026-11-14T04:00:05Z',
  };
  const items = [
    { product_id: 'p1', product_name: 'Kopi Susu Gula Aren Spesial Dengan Nama Yang Sangat Panjang Sekali', unit_price: 18000, quantity: 2 },
    { product_id: 'p2', product_name: 'Roti Bakar', unit_price: 15000, quantity: 1 },
  ];

  it('batas waktu 3 menit', () => {
    expect(ONLINE_PAYMENT_TIMEOUT_MINUTES).toBe(3);
  });

  it('format waktu Midtrans (WIB, +0700)', () => {
    expect(formatMidtransTime('2026-11-14T04:00:05Z')).toBe('2026-11-14 11:00:05 +0700');
  });

  it('isi transaksi: QRIS saja, kedaluwarsa 3 menit dari pesanan dibuat, total = jumlah item', () => {
    const body = buildSnapTransaction(order, items, { email: 'sari@x.id' });
    expect(body.transaction_details).toEqual({ order_id: order.id, gross_amount: 51000 });
    expect(body.enabled_payments).toEqual(['other_qris']);
    expect(body.expiry).toEqual({ start_time: '2026-11-14 11:00:05 +0700', unit: 'minute', duration: 3 });
    const sum = body.item_details.reduce((s, i) => s + i.price * i.quantity, 0);
    expect(sum).toBe(51000);
    expect(body.item_details.every((i) => i.name.length <= 50)).toBe(true);
    expect(body.customer_details).toEqual({ first_name: 'Sari', email: 'sari@x.id' });
  });

  it('menolak total yang tidak cocok dengan item', () => {
    expect(() => buildSnapTransaction({ ...order, total_amount: 50000 }, items, {})).toThrow(/tidak sesuai/);
  });

  it('header otorisasi Basic dari server key', () => {
    // "SB-Mid-server-abc:" dalam Base64
    expect(basicAuthHeader('SB-Mid-server-abc')).toBe('Basic U0ItTWlkLXNlcnZlci1hYmM6');
  });

  it('tanda tangan webhook: order_id + status_code + gross_amount + server key', () => {
    expect(
      midtransSignatureInput({ order_id: 'abc', status_code: '200', gross_amount: '51000.00' }, 'KEY')
    ).toBe('abc20051000.00KEY');
  });

  it('pemetaan status transaksi', () => {
    expect(mapMidtransStatus('settlement')).toBe('paid');
    expect(mapMidtransStatus('capture', 'accept')).toBe('paid');
    expect(mapMidtransStatus('capture', 'deny')).toBe('failed');
    expect(mapMidtransStatus('pending')).toBe('pending');
    for (const s of ['expire', 'cancel', 'deny', 'failure']) expect(mapMidtransStatus(s)).toBe('failed');
    expect(mapMidtransStatus('refund')).toBe('ignore');
  });
});

// ---------------------------------------------------------------------------
// Logika aplikasi
// ---------------------------------------------------------------------------
describe('Navigasi di dalam halaman pembayaran', () => {
  it('halaman https dimuat di WebView', () => {
    expect(classifyPaymentNavigation('https://app.sandbox.midtrans.com/snap/v4/redirection/abc#/other-qris')).toBe('load');
    expect(classifyPaymentNavigation('about:blank')).toBe('load');
  });
  it('tautan aplikasi e-wallet dibuka di aplikasinya', () => {
    expect(classifyPaymentNavigation('gojek://gopay/merchanttransfer?tref=1')).toBe('external');
    expect(classifyPaymentNavigation('shopeeid://main')).toBe('external');
    expect(classifyPaymentNavigation('intent://pay#Intent;scheme=gojek;end')).toBe('external');
  });
  it('http tanpa enkripsi & skema berbahaya diblokir', () => {
    expect(classifyPaymentNavigation('http://contoh.com')).toBe('block');
    expect(classifyPaymentNavigation('javascript:alert(1)')).toBe('block');
    expect(classifyPaymentNavigation('file:///etc/passwd')).toBe('block');
  });
});

describe('Pilihan bayar customer', () => {
  it('QRIS online + bayar di kasir', () => {
    expect(CUSTOMER_PAYMENT_OPTIONS.map((o) => o.key)).toEqual(['online_qris', 'kasir_tunai', 'kasir_qris', 'kasir_debit']);
    expect(getCustomerPaymentOption('online_qris')).toMatchObject({ channel: 'Online', method: 'QRIS' });
    expect(getCustomerPaymentOption('kasir_debit')).toMatchObject({ channel: 'Kasir', method: 'Debit' });
  });

  it('pesanan online yang belum lunas disembunyikan dari kasir', () => {
    expect(isOnlineOrder({ payment_channel: 'Online' })).toBe(true);
    expect(isHiddenFromKasir({ payment_channel: 'Online', payment_status: 'Pending' })).toBe(true);
    expect(isHiddenFromKasir({ payment_channel: 'Online', payment_status: 'Paid' })).toBe(false);
    expect(isHiddenFromKasir({ payment_channel: 'Kasir', payment_status: 'Pending' })).toBe(false);
  });

  it('kasir tidak dapat mengonfirmasi pembayaran pesanan online', () => {
    const res = canConfirmPayment({ order_status: 'Pending', payment_status: 'Pending', payment_channel: 'Online' }, 'Kasir');
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/Midtrans/);
  });

  it('customer tidak membatalkan pesanan online (batal sendiri bila tidak dibayar)', () => {
    const res = canCustomerCancelOrder({ order_status: 'Pending', payment_status: 'Pending', payment_channel: 'Online' });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/3 menit/);
  });

  it('keterangan pembatalan pembayaran online', () => {
    const d = describeCancellation(
      { cancelled_by: null, cancellation_reason: 'Pembayaran online tidak selesai (expire).' },
      'me'
    );
    expect(d.title).toBe('Dibatalkan otomatis');
    expect(d.detail).toContain('Pembayaran online tidak selesai');
  });
});

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
describe('Migration pembayaran online', () => {
  const mig = read(MIGRATION);
  const sql = normalize(mig);
  const schema = normalize(read('supabase/schema.sql'));

  it('kolom kanal & data gateway', () => {
    for (const s of [sql, schema]) {
      expect(s).toContain("add column if not exists payment_channel text not null default 'kasir'");
      expect(s).toContain('add column if not exists gateway_redirect_url text');
    }
  });

  it('batas bayar online 3 menit', () => {
    expect(sql).toMatch(/function public\.online_payment_timeout\(\).*interval '3 minutes'/);
  });

  it('create_order punya parameter kanal; POS tidak boleh online; online wajib QRIS', () => {
    expect(sql).toContain('drop function if exists public.create_order(jsonb, text, text, text, text)');
    expect(sql).toContain("p_payment_channel text default 'kasir'");
    expect(mig).toContain('POS tidak memakai pembayaran online');
    expect(mig).toContain('Pembayaran online hanya dengan QRIS');
  });

  it('hanya proses sistem (webhook) yang dapat melunasi pesanan online', () => {
    expect(mig).toContain('Pesanan online dibayar lewat Midtrans');
    expect(sql).toContain('create or replace function public.apply_midtrans_notification(');
    expect(sql).toContain('revoke execute on function public.apply_midtrans_notification(uuid, text, text, numeric, text, text) from public, anon, authenticated');
    expect(sql).toContain("rolname = 'service_role'");
  });

  it('nominal webhook harus sama dengan total pesanan', () => {
    expect(mig).toContain('amount_mismatch');
  });

  it('pembayaran online tidak butuh sif & tidak masuk laci', () => {
    expect(sql).toMatch(/new\.payment_channel = 'online'/);
  });

  it('customer tidak dapat membatalkan pesanan online', () => {
    expect(mig).toContain('Pesanan online dibatalkan otomatis bila tidak dibayar');
  });

  it('isi plpgsql tidak rusak oleh penggantian $$', () => {
    expect(mig).not.toMatch(/ AS \$\n| as \$;|^\$;/m);
  });
});

// ---------------------------------------------------------------------------
// Edge Function & layar
// ---------------------------------------------------------------------------
describe('Edge Function & layar', () => {
  it('create-midtrans-payment: server key dari Secrets, pesanan milik sendiri', () => {
    const src = read('supabase/functions/create-midtrans-payment/index.ts');
    expect(src).toContain("Deno.env.get('MIDTRANS_SERVER_KEY')");
    expect(src).toContain('buildSnapTransaction(');
    expect(src).toContain("withSupabase({ auth: 'user' }");
  });

  it('midtrans-webhook: verifikasi SHA-512 & cek ulang status ke Midtrans', () => {
    const src = read('supabase/functions/midtrans-webhook/index.ts');
    expect(src).toContain("'SHA-512'");
    // Sejak 28 Okt 2026 notifikasi ditandatangani Signature Secret Key (terpisah dari Server Key).
    expect(src).toContain("Deno.env.get('MIDTRANS_SIGNATURE_KEY')");
    expect(src).toContain('midtransSignatureInput(');
    expect(src).toContain('/status');
    expect(src).toContain("rpc('apply_midtrans_notification'");
  });

  it('server key tidak pernah ada di aplikasi', () => {
    for (const f of ['app/(customer)/product.tsx', 'app/(customer)/orders.tsx', 'app/(customer)/payment.tsx', 'lib/payment-gateway-logic.ts', 'lib/online-payment.ts']) {
      expect(read(f)).not.toMatch(/SB-Mid-server|MIDTRANS_SERVER_KEY/);
    }
  });

  it('helper meminta halaman pembayaran lewat Edge Function (tanpa tab browser)', () => {
    const src = read('lib/online-payment.ts');
    expect(src).toContain("functions.invoke('create-midtrans-payment'");
    expect(src).not.toContain('expo-web-browser');
    expect(src).toContain("pathname: '/(customer)/payment'");
  });

  it('halaman pembayaran Midtrans tampil di dalam aplikasi (WebView)', () => {
    const src = read('app/(customer)/payment.tsx');
    expect(src).toContain("from 'react-native-webview'");
    expect(src).toContain('<WebView');
    expect(src).toContain('onShouldStartLoadWithRequest');
    expect(src).toContain('classifyPaymentNavigation(');
    // status lunas/batal diikuti lewat realtime, bukan dari halaman Midtrans
    expect(src).toContain('postgres_changes');
    expect(read('app/(customer)/_layout.tsx')).toContain('name="payment"');
  });

  it('checkout customer memakai pilihan bayar & membuka pembayaran online', () => {
    const src = read('app/(customer)/product.tsx');
    expect(src).toContain('CUSTOMER_PAYMENT_OPTIONS');
    expect(src).toContain('openOnlinePayment(');
    expect(src).toContain('paymentChannel: paymentOption.channel');
  });

  it('pesanan customer: tombol bayar ulang untuk pesanan online', () => {
    expect(read('app/(customer)/orders.tsx')).toContain('openOnlinePayment(');
  });

  it('kasir: pesanan online belum lunas disembunyikan', () => {
    const src = read('components/OrdersScreen.tsx');
    expect(src).toContain('isHiddenFromKasir(');
    expect(src).toContain("payment_channel.eq.Kasir,payment_status.neq.Pending");
    expect(read('hooks/useAwaitingCustomerOrders.ts')).toContain("eq('payment_channel', 'Kasir')");
  });
});
