/**
 * Tombol notifikasi "Pesanan masuk" di POS kasir:
 * badge = pesanan customer bayar-di-kasir yang menunggu pembayaran
 *       + pesanan QRIS online yang sudah lunas dan perlu disiapkan.
 */
import {
  IncomingOrderRow,
  INCOMING_ORDERS_FILTER,
  formatBadgeCount,
  groupIncomingOrders,
} from '../lib/incoming-orders-logic';

declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');

const NOW = new Date('2026-11-15T10:00:00+08:00');
const row = (over: Partial<IncomingOrderRow>): IncomingOrderRow => ({
  id: 'o1',
  order_number: 'ORD-1',
  customer_name: 'Pelanggan',
  total_amount: 25000,
  payment_method: 'Tunai',
  payment_channel: 'Kasir',
  order_status: 'Pending',
  payment_status: 'Pending',
  order_type: 'Dine In',
  created_at: '2026-11-15T09:55:00+08:00',
  payment_due_at: '2026-11-15T10:10:00+08:00',
  ...over,
});

describe('groupIncomingOrders', () => {
  it('memisahkan menunggu bayar dan lunas online', () => {
    const g = groupIncomingOrders(
      [
        row({ id: 'a' }),
        row({ id: 'b', payment_channel: 'Online', order_status: 'Processing', payment_status: 'Paid', payment_due_at: null }),
      ],
      NOW
    );
    expect(g.awaitingPayment.map((r) => r.id)).toEqual(['a']);
    expect(g.paidOnlineToPrepare.map((r) => r.id)).toEqual(['b']);
    expect(g.total).toBe(2);
  });

  it('menyembunyikan pesanan yang batas bayarnya sudah lewat', () => {
    const g = groupIncomingOrders([row({ payment_due_at: '2026-11-15T09:59:00+08:00' })], NOW);
    expect(g.awaitingPayment).toHaveLength(0);
    expect(g.total).toBe(0);
  });

  it('mengurutkan menunggu bayar dari batas terdekat', () => {
    const g = groupIncomingOrders(
      [
        row({ id: 'late', payment_due_at: '2026-11-15T10:12:00+08:00' }),
        row({ id: 'soon', payment_due_at: '2026-11-15T10:02:00+08:00' }),
      ],
      NOW
    );
    expect(g.awaitingPayment.map((r) => r.id)).toEqual(['soon', 'late']);
  });

  it('mengabaikan pesanan POS kasir dan pesanan online yang belum lunas', () => {
    const g = groupIncomingOrders(
      [
        row({ id: 'pos', order_status: 'Processing', payment_status: 'Paid', payment_channel: 'Kasir' }),
        row({ id: 'qr', payment_channel: 'Online' }),
      ],
      NOW
    );
    expect(g.total).toBe(0);
  });

  it('filter Supabase mencakup kedua kelompok', () => {
    expect(INCOMING_ORDERS_FILTER).toContain('payment_channel.eq.Kasir');
    expect(INCOMING_ORDERS_FILTER).toContain('payment_channel.eq.Online');
  });
});

describe('formatBadgeCount', () => {
  it('kosong untuk 0, angka biasa, dan 99+', () => {
    expect(formatBadgeCount(0)).toBe('');
    expect(formatBadgeCount(7)).toBe('7');
    expect(formatBadgeCount(120)).toBe('99+');
  });
});

describe('Integrasi layar', () => {
  it('POS memasang tombol pesanan masuk di header', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('<IncomingOrdersButton');
    const layout = read('app/(kasir)/_layout.tsx');
    expect(layout).toContain('incoming: awaiting.incoming');
  });

  it('mengetuk pesanan membuka detailnya di Riwayat Transaksi', () => {
    expect(read('components/IncomingOrdersButton.tsx')).toContain('onOpenOrder(');
    expect(read('components/OrdersScreen.tsx')).toContain('openOrderId');
  });
});
