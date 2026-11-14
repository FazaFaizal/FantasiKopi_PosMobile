import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OrderRecord, isAwaitingCustomerPayment } from '../lib/order-logic';

export interface IncomingCustomerOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_amount: number;
  payment_method: string;
  /** true = sudah lunas lewat QRIS online, tinggal disiapkan. */
  paidOnline?: boolean;
}

/** Jeda minimum antar pemanggilan expire_unpaid_orders dari perangkat ini. */
const SWEEP_INTERVAL_MS = 30_000;

/**
 * Pesanan customer yang menunggu dibayar di kasir (Kasir & Admin).
 * - `count`: jumlah pesanan yang menunggu pembayaran (badge sidebar).
 * - `latest`: pesanan baru yang masuk lewat realtime (banner notifikasi).
 * Sekaligus menjalankan pembatalan otomatis pesanan yang melewati batas 15 menit,
 * sehingga tetap berjalan walaupun pg_cron belum aktif di Supabase.
 */
export function useAwaitingCustomerOrders(enabled: boolean = true) {
  const [count, setCount] = useState(0);
  const [latest, setLatest] = useState<IncomingCustomerOrder | null>(null);
  const lastSweep = useRef(0);
  const channelName = useRef(`awaiting-customer-orders-${Math.random().toString(36).slice(2)}`);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (Date.now() - lastSweep.current >= SWEEP_INTERVAL_MS) {
      lastSweep.current = Date.now();
      await supabase.rpc('expire_unpaid_orders');
    }
    const { count: total, error } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('order_status', 'Pending')
      .eq('payment_status', 'Pending')
      // Pesanan QRIS online menunggu pembayaran di Midtrans, bukan di kasir.
      .eq('payment_channel', 'Kasir');
    if (!error) setCount(total ?? 0);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();

    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new as Partial<OrderRecord> | null;
        const isNewKasirOrder =
          payload.eventType === 'INSERT' &&
          !!row?.id &&
          row.payment_channel !== 'Online' &&
          !!row.order_status &&
          !!row.payment_status &&
          isAwaitingCustomerPayment({ order_status: row.order_status, payment_status: row.payment_status });
        // Pesanan QRIS online yang baru saja lunas (webhook Midtrans) → siapkan pesanan.
        const isOnlineJustPaid =
          payload.eventType === 'UPDATE' &&
          !!row?.id &&
          row.payment_channel === 'Online' &&
          row.payment_status === 'Paid' &&
          row.order_status === 'Processing' &&
          !!row.paid_at &&
          Date.now() - new Date(row.paid_at).getTime() < 2 * 60_000;
        if (row?.id && (isNewKasirOrder || isOnlineJustPaid)) {
          setLatest({
            id: row.id,
            order_number: row.order_number ?? '-',
            customer_name: row.customer_name ?? null,
            total_amount: Number(row.total_amount ?? 0),
            payment_method: row.payment_method ?? '-',
            paidOnline: isOnlineJustPaid,
          });
        }
        refresh();
      })
      .subscribe();

    // Sapu pesanan kedaluwarsa & perbarui jumlah tiap menit.
    const timer = setInterval(refresh, 60_000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  // Stabil antar render agar timer auto-hide banner tidak ter-reset.
  const dismissLatest = useCallback(() => setLatest(null), []);

  return { count, latest, dismissLatest, refresh };
}
