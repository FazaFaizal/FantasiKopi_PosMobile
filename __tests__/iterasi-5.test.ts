// UAT Iterasi 5: Transaksi POS, Checkout & Pembayaran Customer (docs/uat-per-iterasi.md bagian 8).
// Tidak diuji di sini karena aturannya ada di database, Edge Function, atau tampilan, bukan di lib/:
// I5-06, I5-08, I5-13, I5-14, I5-20, I5-26, I5-29.
import {
  checkCustomerCartChange,
  CUSTOMER_MAX_UNPAID_ORDERS,
  findBlockingUnpaidOrder,
  getCustomerOrderStatusMeta,
  getServerTotalNotice,
  syncCartWithProducts,
  validateCustomerCheckoutPayload,
  type CustomerCartItem,
  type CustomerCheckoutPayload,
} from '../lib/customer-order-logic';
import { formatRupiah } from '../lib/formatters';
import { formatBadgeCount, groupIncomingOrders, type IncomingOrderRow } from '../lib/incoming-orders-logic';
import {
  AUTO_CANCEL_REASON,
  buildPaymentConfirmationUpdate,
  canConfirmPayment,
  canCustomerCancelOrder,
  CUSTOMER_PAYMENT_TIMEOUT_MINUTES,
  describeCancellation,
  formatCountdown,
  getPaymentMethodMeta,
  getPaymentStatusMeta,
  getPaymentTimeLeftMs,
  isPaymentExpired,
  ONLINE_PAYMENT_TIMEOUT_MINUTES,
  validateCancellationPayload,
} from '../lib/order-logic';
import {
  CUSTOMER_PAYMENT_OPTIONS,
  getCustomerPaymentOption,
  isHiddenFromKasir,
  isOnlineOrder,
  isSandboxQrUrl,
} from '../lib/payment-gateway-logic';
import {
  addToCart,
  buildCreateOrderParams,
  calculateCartTotals,
  calculateCashChange,
  filterPosProducts,
  getQuickCashSuggestions,
  removeFromCart,
  updateCartItemNotes,
  updateCartItemQuantity,
  validateOrderPayload,
  type CartItem,
  type PosProduct,
} from '../lib/pos-logic';

const NOW = new Date('2026-11-16T02:00:00.000Z'); // 10:00 WITA
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const PRODUCTS: PosProduct[] = [
  { id: 'p-kopi', name: 'Kopi Susu Gula Aren', price: 24000, category_id: 'cat-espresso', status: 'Tersedia' },
  { id: 'p-latte', name: 'Caffe Latte', price: 26000, category_id: 'cat-espresso', status: 'Tersedia' },
  { id: 'p-americano', name: 'Americano', price: 20000, category_id: 'cat-espresso', status: 'Tersedia' },
  { id: 'p-matcha', name: 'Matcha Latte', price: 27000, category_id: 'cat-noncoffee', status: 'Tidak Tersedia' },
  { id: 'p-lama', name: 'Kopi Tubruk', price: 15000, category_id: 'cat-espresso', status: 'Tersedia', is_active: false },
];
const [KOPI, LATTE, AMERICANO] = PRODUCTS;

// ---------------------------------------------------------------------------
// 8.1 POS dan keranjang Kasir
// ---------------------------------------------------------------------------

describe('I5-01 Cari dan filter menu', () => {
  const names = (list: PosProduct[]) => list.map((p) => p.name);

  test('chip kategori dan pencarian nama', () => {
    expect(names(filterPosProducts(PRODUCTS, 'cat-noncoffee'))).toEqual(['Matcha Latte']);
    expect(names(filterPosProducts(PRODUCTS, null, '  latte '))).toEqual(['Caffe Latte', 'Matcha Latte']);
  });

  test('produk nonaktif tidak tampil di POS', () => {
    expect(names(filterPosProducts(PRODUCTS))).not.toContain('Kopi Tubruk');
  });
});

describe('I5-02 Tambah ke keranjang', () => {
  test('produk yang sama diketuk dua kali menjadi satu baris berjumlah 2', () => {
    const cart = addToCart(addToCart(addToCart([], KOPI), LATTE), KOPI);
    expect(cart.map((i) => [i.productName, i.quantity])).toEqual([
      ['Kopi Susu Gula Aren', 2],
      ['Caffe Latte', 1],
    ]);
  });

  test('catatan berbeda dicatat sebagai baris terpisah', () => {
    const cart = addToCart(addToCart([], KOPI), KOPI, 'less ice');
    expect(cart).toHaveLength(2);
    expect(cart[1]).toMatchObject({ productId: 'p-kopi', quantity: 1, notes: 'less ice' });
  });
});

describe('I5-03 Produk habis tidak bisa ditambah', () => {
  test('produk Habis tetap tampil di katalog sebagai kartu nonaktif', () => {
    const matcha = filterPosProducts(PRODUCTS).find((p) => p.id === 'p-matcha');
    expect(matcha?.status).toBe('Tidak Tersedia');
  });
});

describe('I5-04 Ubah jumlah dan hapus', () => {
  const cart: CartItem[] = [
    { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', unitPrice: 24000, quantity: 2 },
    { productId: 'p-latte', productName: 'Caffe Latte', unitPrice: 26000, quantity: 1 },
  ];

  test('tombol + dan − mengubah jumlah', () => {
    expect(updateCartItemQuantity(cart, 'p-kopi', 1)[0].quantity).toBe(3);
    expect(updateCartItemQuantity(cart, 'p-kopi', -1)[0].quantity).toBe(1);
  });

  test('jumlah menjadi 0 menghapus item', () => {
    expect(updateCartItemQuantity(cart, 'p-latte', -1).map((i) => i.productId)).toEqual(['p-kopi']);
  });

  test('ikon tempat sampah menghapus item', () => {
    expect(removeFromCart(cart, 'p-kopi').map((i) => i.productId)).toEqual(['p-latte']);
  });
});

describe('I5-05 Total benar', () => {
  test('total sama dengan harga × jumlah', () => {
    const cart: CartItem[] = [
      { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', unitPrice: 24000, quantity: 2 },
      { productId: 'p-latte', productName: 'Caffe Latte', unitPrice: 26000, quantity: 1 },
      { productId: 'p-americano', productName: 'Americano', unitPrice: 20000, quantity: 3 },
    ];
    expect(calculateCartTotals(cart)).toEqual({ totalItems: 6, subtotal: 134000, total: 134000 });
  });
});

describe('I5-07 Catatan item', () => {
  test('catatan disimpan tanpa spasi berlebih dan ikut terkirim', () => {
    const cart = updateCartItemNotes(addToCart([], KOPI), 'p-kopi', '  less sugar ');
    expect(cart[0].notes).toBe('less sugar');
    const params = buildCreateOrderParams(cart, { customerName: 'Meja 4', orderType: 'Dine In', paymentMethod: 'Tunai' });
    expect(params.p_items[0].notes).toBe('less sugar');
  });

  test('item tanpa catatan dikirim tanpa catatan', () => {
    const params = buildCreateOrderParams(addToCart([], AMERICANO), {
      customerName: 'Meja 4',
      orderType: 'Dine In',
      paymentMethod: 'Tunai',
    });
    expect(params.p_items[0].notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8.2 Pembayaran di POS
// ---------------------------------------------------------------------------

const POS_CART: CartItem[] = [
  { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', unitPrice: 24000, quantity: 1 },
  { productId: 'p-americano', productName: 'Americano', unitPrice: 19000, quantity: 1 },
];

describe('I5-09 Bayar tunai dengan kembalian', () => {
  test('kembalian dihitung dari uang diterima − total', () => {
    expect(calculateCashChange(43000, 50000)).toEqual({ isValid: true, change: 7000 });
    expect(validateOrderPayload({ cart: POS_CART, paymentMethod: 'Tunai', cashGiven: 50000 })).toEqual({ isValid: true });
  });

  test('chip pecahan: uang pas lalu pecahan di atas total', () => {
    expect(getQuickCashSuggestions(43000)).toEqual([43000, 50000, 100000]);
  });
});

describe('I5-10 Uang kurang', () => {
  test('uang kurang dari total ditolak dengan keterangan kekurangan', () => {
    const result = calculateCashChange(43000, 40000);
    expect(result.isValid).toBe(false);
    expect(result.change).toBe(0);
    expect(result.error).toContain('Kurang Rp 3.000');
    expect(validateOrderPayload({ cart: POS_CART, paymentMethod: 'Tunai', cashGiven: 40000 }).isValid).toBe(false);
  });
});

describe('I5-11 Bayar QRIS dan Debit (di kasir)', () => {
  test.each(['QRIS', 'Debit'] as const)('%s tidak memerlukan uang diterima', (paymentMethod) => {
    expect(validateOrderPayload({ cart: POS_CART, paymentMethod })).toEqual({ isValid: true });
    expect(getPaymentMethodMeta(paymentMethod).isCash).toBe(false);
  });

  test('hanya Tunai yang masuk laci', () => {
    expect(getPaymentMethodMeta('Tunai').isCash).toBe(true);
  });

  test('keranjang kosong tidak bisa dibayar', () => {
    expect(validateOrderPayload({ cart: [], paymentMethod: 'QRIS' })).toEqual({
      isValid: false,
      error: 'Keranjang belanja masih kosong',
    });
  });
});

describe('I5-12 Order dan item tersimpan', () => {
  test('aplikasi hanya mengirim produk, jumlah, dan catatan; harga dan total dihitung database', () => {
    const params = buildCreateOrderParams(POS_CART, { customerName: '  Meja 4 ', orderType: 'Dine In', paymentMethod: 'Tunai' });
    expect(params).toEqual({
      p_items: [
        { product_id: 'p-kopi', quantity: 1, notes: null },
        { product_id: 'p-americano', quantity: 1, notes: null },
      ],
      p_customer_name: 'Meja 4',
      p_order_type: 'Dine In',
      p_payment_method: 'Tunai',
      p_notes: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 8.3 Checkout Customer dan bayar di kasir
// ---------------------------------------------------------------------------

const CUSTOMER_CART: CustomerCartItem[] = [
  { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', unitPrice: 24000, quantity: 2, status: 'Tersedia', is_active: true },
];
const checkout = (patch: Partial<CustomerCheckoutPayload> = {}) =>
  validateCustomerCheckoutPayload({
    cart: CUSTOMER_CART,
    customerName: 'Budi',
    orderType: 'Dine In',
    paymentMethod: 'Tunai',
    tableNumber: '4',
    ...patch,
  });

describe('I5-15 Harga berubah saat di keranjang', () => {
  test('keranjang memakai harga terbaru dan customer diberi tahu', () => {
    const { cart, changes } = syncCartWithProducts(CUSTOMER_CART, [
      { id: 'p-kopi', name: 'Kopi Susu Gula Aren', price: 26000, status: 'Tersedia', is_active: true },
    ]);
    expect(cart[0].unitPrice).toBe(26000);
    expect(changes).toEqual([`Harga Kopi Susu Gula Aren berubah: ${formatRupiah(24000)} → ${formatRupiah(26000)}.`]);
    expect(calculateCartTotals(cart).total).toBe(52000);
  });

  test('menu yang menjadi habis ditandai tidak tersedia', () => {
    const { cart, changes } = syncCartWithProducts(CUSTOMER_CART, [
      { id: 'p-kopi', name: 'Kopi Susu Gula Aren', price: 24000, status: 'Tidak Tersedia', is_active: true },
    ]);
    expect(cart[0].status).toBe('Tidak Tersedia');
    expect(changes).toEqual(['Kopi Susu Gula Aren sedang tidak tersedia. Hapus dari keranjang untuk melanjutkan.']);
  });

  test('tanpa perubahan, keranjang tidak berubah', () => {
    const result = syncCartWithProducts(CUSTOMER_CART, [
      { id: 'p-kopi', name: 'Kopi Susu Gula Aren', price: 24000, status: 'Tersedia', is_active: true },
    ]);
    expect(result.cart).toBe(CUSTOMER_CART);
    expect(result.changes).toEqual([]);
  });

  test('total akhir dari database diberitahukan bila berbeda', () => {
    expect(getServerTotalNotice(48000, 52000)).toBe(
      `Total disesuaikan dengan harga terbaru menjadi ${formatRupiah(52000)} (sebelumnya ${formatRupiah(48000)}).`
    );
    expect(getServerTotalNotice(52000, 52000)).toBeNull();
  });
});

describe('I5-16 Checkout bayar di kasir', () => {
  test('checkout lengkap diterima', () => {
    expect(checkout()).toEqual({ isValid: true });
  });

  test('nama pemesan wajib, keranjang tidak boleh kosong, menu habis ditolak', () => {
    expect(checkout({ customerName: '  ' }).error).toBe('Nama pemesan wajib diisi untuk konfirmasi pesanan.');
    expect(checkout({ cart: [] }).error).toBe('Keranjang belanja masih kosong. Silakan pilih menu terlebih dahulu.');
    expect(checkout({ cart: [{ ...CUSTOMER_CART[0], status: 'Tidak Tersedia' }] }).error).toBe(
      "Menu 'Kopi Susu Gula Aren' saat ini sedang tidak tersedia. Silakan hapus dari keranjang."
    );
  });

  test('pilihan "Tunai di Kasir" membuat pesanan lewat kasir dengan batas bayar 15 menit', () => {
    const option = getCustomerPaymentOption('kasir_tunai');
    expect(option).toMatchObject({ channel: 'Kasir', method: 'Tunai' });
    expect(CUSTOMER_PAYMENT_TIMEOUT_MINUTES).toBe(15);
    const params = buildCreateOrderParams(CUSTOMER_CART, {
      customerName: 'Budi',
      orderType: 'Dine In',
      paymentMethod: option.method,
      paymentChannel: option.channel,
    });
    expect(params.p_payment_channel).toBe('Kasir');
  });

  test('pesanan baru berstatus Menunggu Konfirmasi', () => {
    expect(getCustomerOrderStatusMeta('Pending').label).toBe('Menunggu Konfirmasi');
  });
});

const incoming = (patch: Partial<IncomingOrderRow>): IncomingOrderRow => ({
  id: 'x',
  order_number: 'ORD-20261116-0010',
  customer_name: 'Budi',
  total_amount: 48000,
  payment_method: 'Tunai',
  payment_channel: 'Kasir',
  order_status: 'Pending',
  payment_status: 'Pending',
  order_type: 'Dine In',
  created_at: '2026-11-16T01:50:00.000Z',
  payment_due_at: minutesFromNow(10),
  ...patch,
});

describe('I5-17 Notifikasi pesanan masuk', () => {
  const rows = [
    incoming({ id: 'kasir-10-menit', payment_due_at: minutesFromNow(10) }),
    incoming({ id: 'kasir-5-menit', payment_due_at: minutesFromNow(5) }),
    incoming({ id: 'kasir-kedaluwarsa', payment_due_at: minutesFromNow(-1) }),
    incoming({ id: 'online-lunas', payment_channel: 'Online', order_status: 'Processing', payment_status: 'Paid', payment_method: 'QRIS' }),
    incoming({ id: 'online-belum-lunas', payment_channel: 'Online', payment_method: 'QRIS' }),
    incoming({ id: 'kasir-sudah-dibayar', order_status: 'Processing', payment_status: 'Paid' }),
  ];

  test('panel lonceng: menunggu pembayaran (batas terdekat dulu) dan pesanan online lunas', () => {
    const groups = groupIncomingOrders(rows, NOW);
    expect(groups.awaitingPayment.map((r) => r.id)).toEqual(['kasir-5-menit', 'kasir-10-menit']);
    expect(groups.paidOnlineToPrepare.map((r) => r.id)).toEqual(['online-lunas']);
    expect(groups.total).toBe(3);
  });

  test('angka di lonceng', () => {
    expect(formatBadgeCount(0)).toBe('');
    expect(formatBadgeCount(3)).toBe('3');
    expect(formatBadgeCount(120)).toBe('99+');
  });

  test('sisa waktu bayar ditampilkan mm:ss', () => {
    const left = getPaymentTimeLeftMs(incoming({ payment_due_at: minutesFromNow(5) }), NOW);
    expect(left).toBe(300_000);
    expect(formatCountdown(left!)).toBe('05:00');
    expect(formatCountdown(59_500)).toBe('01:00');
  });
});

describe('I5-18 Terima pembayaran', () => {
  const awaiting = { order_status: 'Pending' as const, payment_status: 'Pending' as const, payment_due_at: minutesFromNow(10), payment_channel: 'Kasir' as const };

  test('Kasir dapat mengonfirmasi pembayaran yang masih ditunggu', () => {
    expect(canConfirmPayment(awaiting, 'Kasir', NOW)).toEqual({ allowed: true });
  });

  test('konfirmasi langsung membuat order Lunas dan Processing', () => {
    expect(buildPaymentConfirmationUpdate({ order_status: 'Pending' })).toEqual({
      payment_status: 'Paid',
      order_status: 'Processing',
    });
  });

  test('order yang sudah lunas tidak bisa dikonfirmasi lagi', () => {
    expect(canConfirmPayment({ ...awaiting, order_status: 'Processing', payment_status: 'Paid' }, 'Kasir', NOW)).toEqual({
      allowed: false,
      reason: 'Pembayaran pesanan ini sudah tidak berstatus Pending.',
    });
  });

  test('Customer tidak dapat mengonfirmasi pembayarannya sendiri', () => {
    expect(canConfirmPayment(awaiting, 'Customer', NOW).allowed).toBe(false);
  });
});

describe('I5-19 Lihat pesanan dan status', () => {
  test.each([
    ['Processing', 2, 'Sedang Disiapkan'],
    ['Ready', 3, 'Siap Diambil'],
    ['Completed', 4, 'Selesai'],
    ['Cancelled', 0, 'Dibatalkan'],
  ] as const)('status %s tampil sebagai langkah %i "%s"', (status, step, label) => {
    expect(getCustomerOrderStatusMeta(status)).toMatchObject({ step, label });
  });
});

describe('I5-21 Batalkan pesanan belum dibayar', () => {
  test('pesanan bayar di kasir yang belum dibayar boleh dibatalkan customer', () => {
    expect(canCustomerCancelOrder({ order_status: 'Pending', payment_status: 'Pending', payment_channel: 'Kasir' })).toEqual({
      allowed: true,
    });
  });

  test('setelah dibayar atau diproses, tombol batal tidak tersedia', () => {
    expect(canCustomerCancelOrder({ order_status: 'Processing', payment_status: 'Paid', payment_channel: 'Kasir' })).toEqual({
      allowed: false,
      reason: 'Pesanan sudah dibayar atau sedang diproses. Hubungi kasir untuk pembatalan.',
    });
  });

  test('alasan minimal 3 karakter', () => {
    expect(validateCancellationPayload('ok').isValid).toBe(false);
    expect(validateCancellationPayload('Salah pesan').isValid).toBe(true);
  });

  test('pesanan tampil dibatalkan oleh customer dan tetap belum dibayar', () => {
    expect(describeCancellation({ cancelled_by: 'cus-1', cancellation_reason: 'Salah pesan' }, 'cus-1')).toEqual({
      title: 'Dibatalkan oleh Anda',
      detail: 'Alasan: Salah pesan',
    });
    expect(getPaymentStatusMeta('Pending', 'Cancelled').label).toBe('Tidak Dibayar');
  });
});

describe('I5-22 Batas 1 pesanan belum dibayar', () => {
  test(`customer hanya boleh punya ${CUSTOMER_MAX_UNPAID_ORDERS} pesanan belum dibayar`, () => {
    const unpaid = { order_status: 'Pending' as const, payment_status: 'Pending' as const, payment_due_at: minutesFromNow(5) };
    expect(CUSTOMER_MAX_UNPAID_ORDERS).toBe(1);
    expect(findBlockingUnpaidOrder([unpaid], NOW)).toBe(unpaid);
  });

  test('pesanan yang sudah dibayar atau sudah kedaluwarsa tidak menghalangi', () => {
    expect(
      findBlockingUnpaidOrder(
        [
          { order_status: 'Processing', payment_status: 'Paid', payment_due_at: minutesFromNow(5) },
          { order_status: 'Pending', payment_status: 'Pending', payment_due_at: minutesFromNow(-1) },
        ],
        NOW
      )
    ).toBeNull();
  });
});

describe('I5-23 Batas jumlah', () => {
  const cartOf = (count: number, quantity = 1): CustomerCartItem[] =>
    Array.from({ length: count }, (_, i) => ({ productId: `p-${i}`, productName: `Menu ${i}`, unitPrice: 10000, quantity }));

  test('jumlah per menu maksimal 99', () => {
    expect(checkCustomerCartChange(cartOf(1, 99), 'p-0', 1)).toEqual({ allowed: false, reason: 'Jumlah per menu maksimal 99.' });
    expect(checkout({ cart: [{ ...CUSTOMER_CART[0], quantity: 100 }] }).error).toBe(
      'Jumlah Kopi Susu Gula Aren maksimal 99 per pesanan.'
    );
  });

  test('jumlah dihitung per menu walau catatannya berbeda', () => {
    const cart = [
      { ...CUSTOMER_CART[0], quantity: 60, notes: 'less sugar' },
      { ...CUSTOMER_CART[0], quantity: 40, notes: 'extra ice' },
    ];
    expect(checkout({ cart }).isValid).toBe(false);
  });

  test('maksimal 10 menu berbeda', () => {
    expect(checkCustomerCartChange(cartOf(10), 'p-baru', 1)).toEqual({
      allowed: false,
      reason: 'Maksimal 10 menu berbeda per pesanan.',
    });
    expect(checkCustomerCartChange(cartOf(10), 'p-0', 1)).toEqual({ allowed: true });
    expect(checkout({ cart: cartOf(11) }).error).toBe('Maksimal 10 menu berbeda per pesanan.');
  });
});

describe('I5-24 Kedaluwarsa 15 menit', () => {
  const order = (minutes: number) => ({
    order_status: 'Pending' as const,
    payment_status: 'Pending' as const,
    payment_due_at: minutesFromNow(minutes),
    payment_channel: 'Kasir' as const,
  });

  test('pesanan lewat batas bayar dianggap kedaluwarsa', () => {
    expect(isPaymentExpired(order(-1), NOW)).toBe(true);
    expect(isPaymentExpired(order(1), NOW)).toBe(false);
  });

  test('kasir tidak bisa lagi menerima pembayaran pesanan kedaluwarsa', () => {
    expect(canConfirmPayment(order(-1), 'Kasir', NOW)).toEqual({
      allowed: false,
      reason: 'Pesanan sudah kedaluwarsa (tidak dibayar dalam 15 menit). Buat pesanan baru lewat POS.',
    });
  });

  test('pembatalan otomatis tampil dengan alasan tidak dibayar', () => {
    expect(describeCancellation({ cancelled_by: null, cancellation_reason: AUTO_CANCEL_REASON })).toEqual({
      title: 'Dibatalkan otomatis',
      detail: 'Pesanan tidak dibayar dalam 15 menit. Silakan pesan kembali bila masih ingin membeli.',
    });
  });

  test('hitung mundur hanya untuk pesanan yang masih menunggu bayar', () => {
    expect(getPaymentTimeLeftMs({ ...order(5), order_status: 'Processing' }, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8.4 QRIS Online (Midtrans Sandbox)
// ---------------------------------------------------------------------------

describe('I5-25 Bayar QRIS Online', () => {
  test('pilihan QRIS Online membuat pesanan lewat kanal Online dengan batas 3 menit', () => {
    const option = getCustomerPaymentOption('online_qris');
    expect(option).toMatchObject({ channel: 'Online', method: 'QRIS' });
    expect(CUSTOMER_PAYMENT_OPTIONS[0].key).toBe('online_qris');
    expect(ONLINE_PAYMENT_TIMEOUT_MINUTES).toBe(3);
    const params = buildCreateOrderParams(CUSTOMER_CART, {
      customerName: 'Budi',
      orderType: 'Take Away',
      paymentMethod: option.method,
      paymentChannel: option.channel,
    });
    expect(params.p_payment_channel).toBe('Online');
  });

  test('tombol "Bagikan link QR" hanya untuk QR dari Midtrans Sandbox', () => {
    expect(isSandboxQrUrl('https://api.sandbox.midtrans.com/v2/qris/abc-123/qr-code')).toBe(true);
    expect(isSandboxQrUrl('https://api.midtrans.com/v2/qris/abc-123/qr-code')).toBe(false);
    expect(isSandboxQrUrl(null)).toBe(false);
  });
});

describe('I5-27 Pesanan online di kasir', () => {
  test('pesanan online belum lunas disembunyikan dari kasir', () => {
    expect(isHiddenFromKasir({ payment_channel: 'Online', payment_status: 'Pending' })).toBe(true);
    expect(isHiddenFromKasir({ payment_channel: 'Online', payment_status: 'Paid' })).toBe(false);
    expect(isHiddenFromKasir({ payment_channel: 'Kasir', payment_status: 'Pending' })).toBe(false);
  });

  test('kasir tidak bisa menandai pesanan online lunas secara manual', () => {
    const online = { order_status: 'Pending' as const, payment_status: 'Pending' as const, payment_due_at: minutesFromNow(2), payment_channel: 'Online' as const };
    expect(isOnlineOrder(online)).toBe(true);
    expect(canConfirmPayment(online, 'Kasir', NOW)).toEqual({
      allowed: false,
      reason: 'Pesanan online dibayar lewat Midtrans dan terkonfirmasi otomatis setelah lunas.',
    });
  });
});

describe('I5-28 QR kedaluwarsa', () => {
  test('customer tidak bisa membatalkan pesanan QRIS Online secara manual', () => {
    expect(canCustomerCancelOrder({ order_status: 'Pending', payment_status: 'Pending', payment_channel: 'Online' })).toEqual({
      allowed: false,
      reason: 'Pesanan online dibatalkan otomatis bila tidak dibayar dalam 3 menit.',
    });
  });

  test('pesanan kedaluwarsa tampil Gagal dan dibatalkan otomatis', () => {
    expect(getPaymentStatusMeta('Failed', 'Cancelled')).toEqual({ label: 'Gagal', tone: 'danger' });
    expect(
      describeCancellation({ cancelled_by: null, cancellation_reason: 'Pembayaran online tidak diselesaikan dalam 3 menit.' })
    ).toEqual({
      title: 'Dibatalkan otomatis',
      detail: 'Pembayaran online tidak diselesaikan dalam 3 menit. Silakan pesan kembali bila masih ingin membeli.',
    });
  });
});
