// UAT Iterasi 3: Manajemen Pesanan POS (docs/uat-per-iterasi.md bagian 6).
import {
  canCancelOrder,
  canCorrectPaymentMethod,
  canTransitionOrderStatus,
  filterOrderHistory,
  getBulkCompletableOrders,
  getCancellationPaymentStatus,
  getOrderHistoryStartISO,
  getPaymentStatusMeta,
  validateCancellationPayload,
  type OrderRecord,
} from '../lib/order-logic';

const NOW = new Date('2026-11-16T02:00:00.000Z'); // 10:00 WITA

const order = (patch: Partial<OrderRecord>): OrderRecord => ({
  id: 'ord',
  order_number: 'ORD-20261116-0001',
  customer_name: 'Meja 1',
  total_amount: 24000,
  payment_method: 'Tunai',
  payment_status: 'Paid',
  order_status: 'Processing',
  created_at: '2026-11-16T01:00:00.000Z',
  ...patch,
});

describe('I3-01 Ubah status order', () => {
  test('Kasir dapat memajukan order lunas Processing → Ready → Completed', () => {
    expect(canTransitionOrderStatus('Processing', 'Ready', 'Kasir', 'Paid')).toEqual({ allowed: true });
    expect(canTransitionOrderStatus('Ready', 'Completed', 'Kasir', 'Paid')).toEqual({ allowed: true });
  });

  test('status tidak bisa mundur', () => {
    expect(canTransitionOrderStatus('Ready', 'Processing', 'Kasir', 'Paid')).toEqual({
      allowed: false,
      reason: "Transisi status tidak valid dari 'Ready' ke 'Processing'.",
    });
  });

  test('order belum lunas tidak bisa diproses', () => {
    expect(canTransitionOrderStatus('Pending', 'Processing', 'Kasir', 'Pending')).toEqual({
      allowed: false,
      reason: 'Pembayaran belum dikonfirmasi. Konfirmasi pembayaran terlebih dahulu sebelum pesanan diproses.',
    });
  });

  test('Customer tidak dapat mengubah status', () => {
    expect(canTransitionOrderStatus('Processing', 'Ready', 'Customer', 'Paid').allowed).toBe(false);
  });
});

describe('I3-02 Selesaikan semua yang siap', () => {
  test('hanya order Ready yang sudah lunas yang diselesaikan massal', () => {
    const orders = [
      order({ id: 'a', order_status: 'Ready', payment_status: 'Paid' }),
      order({ id: 'b', order_status: 'Ready', payment_status: 'Pending' }),
      order({ id: 'c', order_status: 'Processing', payment_status: 'Paid' }),
      order({ id: 'd', order_status: 'Ready', payment_status: 'Paid' }),
    ];
    expect(getBulkCompletableOrders(orders).map((o) => o.id)).toEqual(['a', 'd']);
  });
});

describe('I3-03 Batal + refund order lunas', () => {
  test('Kasir dapat membatalkan order Processing', () => {
    expect(canCancelOrder({ order_status: 'Processing' }, 'Kasir')).toEqual({ canCancel: true });
    expect(canTransitionOrderStatus('Processing', 'Cancelled', 'Kasir', 'Paid')).toEqual({ allowed: true });
  });

  test('order lunas yang dibatalkan berubah menjadi Dikembalikan (Refunded)', () => {
    expect(getCancellationPaymentStatus('Paid')).toBe('Refunded');
    expect(getPaymentStatusMeta('Refunded', 'Cancelled')).toEqual({ label: 'Dikembalikan', tone: 'danger' });
  });

  test('order belum dibayar yang dibatalkan tidak berubah status bayarnya', () => {
    expect(getCancellationPaymentStatus('Pending')).toBe('Pending');
  });
});

describe('I3-04 Alasan wajib', () => {
  test.each(['', '   '])('alasan kosong "%s" ditolak', (reason) => {
    expect(validateCancellationPayload(reason)).toEqual({ isValid: false, error: 'Alasan pembatalan wajib diisi.' });
  });

  test('alasan kurang dari 3 karakter ditolak', () => {
    expect(validateCancellationPayload('ab')).toEqual({ isValid: false, error: 'Alasan pembatalan minimal 3 karakter.' });
  });

  test('alasan yang jelas diterima', () => {
    expect(validateCancellationPayload('Salah input menu')).toEqual({ isValid: true });
  });
});

describe('I3-05 Order selesai tidak bisa dibatalkan', () => {
  test('order Completed tidak punya opsi batal', () => {
    expect(canCancelOrder({ order_status: 'Completed' }, 'Admin')).toEqual({
      canCancel: false,
      error: 'Pesanan yang sudah Completed tidak dapat dibatalkan.',
    });
  });

  test('order Cancelled tidak bisa dibatalkan lagi', () => {
    expect(canCancelOrder({ order_status: 'Cancelled' }, 'Kasir')).toEqual({
      canCancel: false,
      error: 'Pesanan sudah dibatalkan sebelumnya.',
    });
  });

  test('order Completed atau Cancelled tidak bisa diubah statusnya', () => {
    expect(canTransitionOrderStatus('Completed', 'Cancelled', 'Admin').allowed).toBe(false);
    expect(canTransitionOrderStatus('Cancelled', 'Processing', 'Admin').allowed).toBe(false);
  });
});

describe('I3-06 Admin membatalkan order', () => {
  test('Admin dapat membatalkan order Processing', () => {
    expect(canCancelOrder({ order_status: 'Processing' }, 'Admin')).toEqual({ canCancel: true });
  });

  test('Customer tidak memakai jalur pembatalan staf', () => {
    expect(canCancelOrder({ order_status: 'Processing' }, 'Customer')).toEqual({
      canCancel: false,
      error: 'Hanya Admin dan Kasir yang memiliki wewenang membatalkan pesanan.',
    });
  });
});

describe('I3-07 Koreksi metode bayar', () => {
  const paidCash = { payment_status: 'Paid' as const, payment_method: 'Tunai' as const };

  test('Admin dapat mengoreksi Tunai → QRIS pada order lunas', () => {
    expect(canCorrectPaymentMethod(paidCash, 'Admin', 'QRIS')).toEqual({ allowed: true });
  });

  test('Kasir tidak bisa mengoreksi', () => {
    expect(canCorrectPaymentMethod(paidCash, 'Kasir', 'QRIS')).toEqual({
      allowed: false,
      reason: 'Hanya Admin yang dapat mengoreksi data pembayaran.',
    });
  });

  test('order belum lunas atau metode sama ditolak', () => {
    expect(canCorrectPaymentMethod({ ...paidCash, payment_status: 'Pending' }, 'Admin', 'QRIS').allowed).toBe(false);
    expect(canCorrectPaymentMethod(paidCash, 'Admin', 'Tunai').allowed).toBe(false);
  });
});

describe('I3-08 Riwayat order', () => {
  const orders = [
    order({ id: 'pagi', order_number: 'ORD-20261116-0002', customer_name: 'Budi', created_at: '2026-11-16T01:00:00.000Z' }),
    // 01:00 WITA 16 Nov (masih 15 Nov menurut UTC)
    order({ id: 'dini-hari', order_number: 'ORD-20261116-0001', order_status: 'Completed', created_at: '2026-11-15T17:00:00.000Z' }),
    // 23:00 WITA 15 Nov
    order({ id: 'kemarin', order_number: 'ORD-20261115-0009', created_at: '2026-11-15T15:00:00.000Z' }),
    order({ id: 'lama', order_number: 'ORD-20261101-0001', created_at: '2026-11-01T03:00:00.000Z' }),
  ];
  const ids = (list: OrderRecord[]) => list.map((o) => o.id);

  test('filter "Hari ini" memakai tanggal WITA', () => {
    expect(ids(filterOrderHistory(orders, { dateFilter: 'today', now: NOW }))).toEqual(['pagi', 'dini-hari']);
  });

  test('filter 7 hari dan semua', () => {
    expect(ids(filterOrderHistory(orders, { dateFilter: '7days', now: NOW }))).toEqual(['pagi', 'dini-hari', 'kemarin']);
    expect(filterOrderHistory(orders, { dateFilter: 'all', now: NOW })).toHaveLength(4);
  });

  test('cari berdasarkan nama pelanggan atau nomor order', () => {
    expect(ids(filterOrderHistory(orders, { searchQuery: 'budi', now: NOW }))).toEqual(['pagi']);
    expect(ids(filterOrderHistory(orders, { searchQuery: 'ORD-20261115', now: NOW }))).toEqual(['kemarin']);
  });

  test('filter status order', () => {
    expect(ids(filterOrderHistory(orders, { statusFilter: 'Completed', now: NOW }))).toEqual(['dini-hari']);
  });

  test('"Muat lebih banyak" untuk hari ini dimulai pukul 00:00 WITA', () => {
    expect(getOrderHistoryStartISO('today', NOW)).toBe('2026-11-15T16:00:00.000Z');
    expect(getOrderHistoryStartISO('7days', NOW)).toBe('2026-11-09T02:00:00.000Z');
    expect(getOrderHistoryStartISO('all', NOW)).toBeNull();
  });

  test('label status bayar di daftar', () => {
    expect(getPaymentStatusMeta('Paid', 'Processing').label).toBe('Lunas');
    expect(getPaymentStatusMeta('Pending', 'Pending').label).toBe('Belum Dibayar');
    expect(getPaymentStatusMeta('Pending', 'Cancelled').label).toBe('Tidak Dibayar');
  });
});
