// UAT Iterasi 4: Laporan Pemasukan & Pengeluaran, Menu Pelanggan, Keranjang Customer, Dashboard
// (docs/uat-per-iterasi.md bagian 7).
// Tidak diuji di sini karena aturannya ada di database atau tampilan, bukan di lib/:
// I4-04, I4-06, I4-19, I4-27, I4-28.
import { ACTIVITY_FILTERS, describeActivity, formatActivityTime, type ActivityRow } from '../lib/activity-logic';
import { calculateCashDifference, calculateDailyCashRecap, validateCashExpense } from '../lib/cash-logic';
import {
  canAddProductToCustomerCart,
  checkCustomerCartChange,
  getProductDetailView,
  type CustomerCartItem,
} from '../lib/customer-order-logic';
import {
  applySalesSummaryToDashboard,
  calculateTodayDashboardMetrics,
  getRecentOrders,
  type DashboardOrder,
} from '../lib/dashboard-logic';
import {
  calculateTotalExpenses,
  filterExpenses,
  getExpenseCategoryMeta,
  validateExpenseInput,
} from '../lib/expense-logic';
import { formatRupiah } from '../lib/formatters';
import { computeStockStatus } from '../lib/inventory-logic';
import { isRecognizedSale } from '../lib/order-logic';
import { calculateCartTotals } from '../lib/pos-logic';
import { getReportDateRange, mapSalesSummary, type SalesSummaryRpc } from '../lib/report-logic';
import {
  canCloseShift,
  getSuggestedOpeningCash,
  isPosLocked,
  validateCloseShift,
  validateOpenShift,
} from '../lib/shift-logic';
import { getBusinessDayRangeISO, toBusinessDateString } from '../lib/timezone';

const NOW = new Date('2026-11-16T02:00:00.000Z'); // 10:00 WITA, 16 Nov
const AFTER_MIDNIGHT = new Date('2026-11-16T16:30:00.000Z'); // 00:30 WITA, 17 Nov (UTC masih 16 Nov)

// ---------------------------------------------------------------------------
// 7.1 Sif kasir
// ---------------------------------------------------------------------------

describe('I4-01 POS terkunci tanpa sif', () => {
  test('POS terkunci bila tidak ada sif atau sif sudah ditutup', () => {
    expect(isPosLocked(null)).toBe(true);
    expect(isPosLocked({ id: 'sif-1', status: 'Closed' })).toBe(true);
  });

  test('POS terbuka saat ada sif aktif', () => {
    expect(isPosLocked({ id: 'sif-1', status: 'Open' })).toBe(false);
  });
});

describe('I4-02 Buka sif', () => {
  test('modal awal 200.000 pada sif pertama diterima', () => {
    expect(validateOpenShift({ openingText: '200.000', noteText: '', suggested: null })).toEqual({
      isValid: true,
      errors: {},
      params: { p_opening_cash: 200000, p_note: null },
    });
  });

  test('modal awal kosong ditolak, 0 diterima', () => {
    expect(validateOpenShift({ openingText: '', noteText: '', suggested: null }).errors.opening).toBe(
      'Modal awal wajib diisi (isi 0 jika laci kosong)'
    );
    expect(validateOpenShift({ openingText: '0', noteText: '', suggested: null }).params?.p_opening_cash).toBe(0);
  });
});

describe('I4-03 Modal beda dari sisa sif lalu', () => {
  test('saran modal = uang dihitung − uang disetor pada sif sebelumnya', () => {
    expect(getSuggestedOpeningCash({ counted_cash: 450000, cash_withdrawn: 250000 })).toBe(200000);
    expect(getSuggestedOpeningCash(null)).toBeNull();
  });

  test('modal berbeda dari saran wajib diberi catatan', () => {
    expect(validateOpenShift({ openingText: '150.000', noteText: '', suggested: 200000 }).errors.note).toBe(
      'Modal awal berbeda dari sisa kas sif sebelumnya. Isi catatan penyebabnya.'
    );
    expect(validateOpenShift({ openingText: '150.000', noteText: 'Uang ditukar receh', suggested: 200000 }).params).toEqual({
      p_opening_cash: 150000,
      p_note: 'Uang ditukar receh',
    });
  });

  test('modal sama dengan saran tidak perlu catatan', () => {
    expect(validateOpenShift({ openingText: '200.000', noteText: '', suggested: 200000 }).isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7.2 Pengeluaran, kas harian, tutup sif
// ---------------------------------------------------------------------------

describe('I4-05 Tambah expense', () => {
  const valid = { description: 'Bayar listrik', category: 'Operational' as const, amount: 50000, expense_date: '2026-11-16' };

  test('expense Operational 50.000 diterima', () => {
    expect(validateExpenseInput(valid)).toEqual({ isValid: true, errors: {} });
  });

  test('deskripsi pendek, nominal 0, kategori asing, dan tanggal salah format ditolak', () => {
    expect(validateExpenseInput({ ...valid, description: 'ab' }).errors.description).toBe(
      'Deskripsi pengeluaran minimal 3 karakter'
    );
    expect(validateExpenseInput({ ...valid, amount: 0 }).errors.amount).toBe(
      'Nominal biaya harus berupa angka lebih dari 0'
    );
    expect(validateExpenseInput({ ...valid, category: 'Gaji' as never }).errors.category).toBe(
      'Kategori pengeluaran tidak valid'
    );
    expect(validateExpenseInput({ ...valid, expense_date: '16-11-2026' }).errors.expense_date).toBe(
      'Format tanggal tidak valid (YYYY-MM-DD)'
    );
  });
});

describe('I4-07 Filter dan kelompok expense', () => {
  const expenses = [
    { id: 'e1', description: 'Listrik PLN', category: 'Operational', amount: 50000, expense_date: '2026-11-16' },
    { id: 'e2', description: 'Susu segar', category: 'Raw Material', amount: 30000, expense_date: '2026-11-16' },
    { id: 'e3', description: 'Internet', category: 'Operational', amount: 40000, expense_date: '2026-11-12' },
    { id: 'e4', description: 'Servis grinder', category: 'Equipment', amount: 150000, expense_date: '2026-10-20' },
  ];
  const ids = (list: { id: string }[]) => list.map((e) => e.id);

  test('filter kategori', () => {
    expect(ids(filterExpenses(expenses, { category: 'Operational', currentDate: NOW }))).toEqual(['e1', 'e3']);
  });

  test('filter periode Hari Ini, 7 Hari Terakhir, Bulan Ini', () => {
    expect(ids(filterExpenses(expenses, { period: 'Hari Ini', currentDate: NOW }))).toEqual(['e1', 'e2']);
    expect(ids(filterExpenses(expenses, { period: '7 Hari Terakhir', currentDate: NOW }))).toEqual(['e1', 'e2', 'e3']);
    expect(ids(filterExpenses(expenses, { period: 'Bulan Ini', currentDate: NOW }))).toEqual(['e1', 'e2', 'e3']);
  });

  test('periode "Hari Ini" mengikuti tanggal WITA setelah tengah malam', () => {
    const list = [
      { id: 'kemarin', description: 'Es batu', category: 'Raw Material', amount: 20000, expense_date: '2026-11-16' },
      { id: 'hari-ini', description: 'Gas', category: 'Operational', amount: 25000, expense_date: '2026-11-17' },
    ];
    expect(ids(filterExpenses(list, { period: 'Hari Ini', currentDate: AFTER_MIDNIGHT }))).toEqual(['hari-ini']);
  });

  test('total dan label kategori', () => {
    expect(calculateTotalExpenses(filterExpenses(expenses, { category: 'Operational', currentDate: NOW }))).toBe(90000);
    expect(getExpenseCategoryMeta('Raw Material').label).toBe('Bahan Baku');
    expect(getExpenseCategoryMeta('Operational').label).toBe('Operasional & Utilitas');
  });
});

describe('I4-08 Kasir catat pengeluaran harian', () => {
  test('pengeluaran es batu 20.000 tercatat hari ini atas nama Kasir, dibayar dari kas laci', () => {
    const result = validateCashExpense(
      { description: ' Es batu ', category: 'Raw Material', amountText: 'Rp 20.000' },
      'ksr-1',
      NOW
    );
    expect(result.payload).toEqual({
      description: 'Es batu',
      category: 'Raw Material',
      amount: 20000,
      expense_date: '2026-11-16',
      created_by: 'ksr-1',
      paid_from_cash: true,
    });
  });

  test('tanggal pengeluaran memakai hari WITA', () => {
    const result = validateCashExpense({ description: 'Es batu', category: 'Raw Material', amountText: '20000' }, 'ksr-1', AFTER_MIDNIGHT);
    expect(result.payload?.expense_date).toBe('2026-11-17');
  });

  test('nominal kosong ditolak', () => {
    expect(validateCashExpense({ description: 'Es batu', category: 'Raw Material', amountText: '' }, 'ksr-1', NOW).isValid).toBe(false);
  });
});

describe('I4-09 Rekap kas harian', () => {
  const base = { order_status: 'Completed', payment_status: 'Paid', created_at: '2026-11-16T01:00:00.000Z' };
  const orders = [
    { ...base, payment_method: 'Tunai', total_amount: 43000 },
    { ...base, payment_method: 'Tunai', total_amount: 25000, order_status: 'Processing' },
    { ...base, payment_method: 'QRIS', total_amount: 30000 },
    { ...base, payment_method: 'Debit', total_amount: 20000 },
    // Dibatalkan dan di-refund: tidak menambah laci.
    { ...base, payment_method: 'Tunai', total_amount: 24000, order_status: 'Cancelled', payment_status: 'Refunded' },
    // Pesanan customer menunggu dibayar.
    { ...base, payment_method: 'Tunai', total_amount: 15000, order_status: 'Pending', payment_status: 'Pending' },
    // Dibuat 23:30 WITA kemarin, dibayar 00:10 WITA hari ini: masuk penjualan hari ini.
    { ...base, payment_method: 'Tunai', total_amount: 10000, created_at: '2026-11-15T15:30:00.000Z', paid_at: '2026-11-15T16:10:00.000Z' },
  ];
  const expenses = [
    { amount: 20000, expense_date: '2026-11-16', paid_from_cash: true },
    { amount: 50000, expense_date: '2026-11-16', paid_from_cash: false },
    { amount: 5000, expense_date: '2026-11-15', paid_from_cash: true },
  ];

  test('kas seharusnya = tunai lunas − pengeluaran dari kas; QRIS dan Debit terpisah', () => {
    expect(calculateDailyCashRecap(orders, expenses, '2026-11-16')).toEqual({
      cashSales: 78000,
      cashOrderCount: 3,
      qrisSales: 30000,
      qrisOrderCount: 1,
      debitSales: 20000,
      debitOrderCount: 1,
      totalSales: 128000,
      cashExpenses: 20000,
      otherExpenses: 50000,
      expectedCash: 58000,
      awaitingPaymentCount: 1,
    });
  });
});

describe('I4-10 Tutup sif tanpa selisih', () => {
  test('uang fisik sama dengan kas seharusnya tidak perlu catatan', () => {
    expect(validateCloseShift({ countedText: '258.000', withdrawnText: '', noteText: '', expectedCash: 258000 })).toEqual({
      isValid: true,
      difference: 0,
      errors: {},
      params: { p_counted: 258000, p_withdrawn: 0, p_note: null },
    });
    expect(calculateCashDifference(258000, '258.000')).toEqual({ counted: 258000, difference: 0, status: 'Pas' });
  });
});

describe('I4-11 Tutup sif dengan selisih', () => {
  test('selisih tanpa catatan ditolak', () => {
    const result = validateCloseShift({ countedText: '250.000', withdrawnText: '', noteText: '', expectedCash: 258000 });
    expect(result.difference).toBe(-8000);
    expect(result.errors.note).toBe('Ada selisih kas. Isi catatan penyebab selisih.');
  });

  test('selisih dengan catatan diterima', () => {
    const result = validateCloseShift({
      countedText: '250.000',
      withdrawnText: '200.000',
      noteText: 'Salah kembalian',
      expectedCash: 258000,
    });
    expect(result.params).toEqual({ p_counted: 250000, p_withdrawn: 200000, p_note: 'Salah kembalian' });
  });

  test('status selisih Kurang dan Lebih', () => {
    expect(calculateCashDifference(258000, '250.000')?.status).toBe('Kurang');
    expect(calculateCashDifference(258000, '260.000')).toEqual({ counted: 260000, difference: 2000, status: 'Lebih' });
    expect(calculateCashDifference(258000, '')).toBeNull();
  });

  test('uang disetor melebihi uang di laci, atau uang fisik kosong, ditolak', () => {
    expect(
      validateCloseShift({ countedText: '250.000', withdrawnText: '300.000', noteText: 'x', expectedCash: 250000 }).errors.withdrawn
    ).toBe('Uang yang disetor tidak boleh melebihi uang di laci');
    expect(validateCloseShift({ countedText: '', withdrawnText: '', noteText: '', expectedCash: 0 })).toEqual({
      isValid: false,
      difference: null,
      errors: { counted: 'Uang fisik di laci wajib dihitung dan diisi' },
    });
  });
});

describe('I4-12 Admin menutup sif yang lupa ditutup', () => {
  const shift = { opened_by: 'ksr-1' };

  test('Admin dan Kasir pembuka sif dapat menutup', () => {
    expect(canCloseShift(shift, { id: 'adm-1', role: 'Admin' })).toBe(true);
    expect(canCloseShift(shift, { id: 'ksr-1', role: 'Kasir' })).toBe(true);
  });

  test('Kasir lain tidak dapat menutup', () => {
    expect(canCloseShift(shift, { id: 'ksr-2', role: 'Kasir' })).toBe(false);
    expect(canCloseShift(shift, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7.3 Laporan pemasukan dan pengeluaran
// ---------------------------------------------------------------------------

const RPC: SalesSummaryRpc = {
  total_revenue: '128000',
  paid_orders: 5,
  items_sold: '9',
  top_products: [
    { product_id: 'p-kopi', product_name: 'Kopi Susu Gula Aren', quantity_sold: '4', total_revenue: '96000' },
    { product_id: null, product_name: 'Americano', quantity_sold: 2, total_revenue: 40000 },
  ],
  total_expenses: 70000,
  expenses_by_category: [
    { category: 'Operational', amount: 50000 },
    { category: 'Raw Material', amount: '15000' },
    { category: 'Gaji', amount: 5000 },
  ],
};

describe('I4-13 Sales Report hari ini', () => {
  test('periode hari ini memakai tanggal WITA', () => {
    expect(getReportDateRange('Hari Ini', NOW)).toEqual({ from: '2026-11-16', to: '2026-11-16' });
  });

  test('ringkasan penjualan dari database', () => {
    const { salesReport } = mapSalesSummary(RPC);
    expect(salesReport).toEqual({
      totalRevenue: 128000,
      totalPaidOrders: 5,
      totalItemsSold: 9,
      averageOrderValue: 25600,
      topProducts: [
        { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', quantitySold: 4, totalRevenue: 96000 },
        { productId: 'Americano', productName: 'Americano', quantitySold: 2, totalRevenue: 40000 },
      ],
    });
  });

  test('data kosong tampil sebagai nol', () => {
    expect(mapSalesSummary(null).salesReport).toEqual({
      totalRevenue: 0,
      totalPaidOrders: 0,
      totalItemsSold: 0,
      averageOrderValue: 0,
      topProducts: [],
    });
  });
});

describe('I4-14 Rentang tanggal', () => {
  test('7 hari terakhir, bulan ini, dan semua', () => {
    expect(getReportDateRange('7 Hari Terakhir', NOW)).toEqual({ from: '2026-11-09', to: '2026-11-16' });
    expect(getReportDateRange('Bulan Ini', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    expect(getReportDateRange('Semua', NOW)).toEqual({ from: null, to: null });
  });
});

describe('I4-15 Financial Report', () => {
  test('Net Result = Total Sales − Total Expense', () => {
    const { financialReport } = mapSalesSummary(RPC);
    expect(financialReport.totalSales).toBe(128000);
    expect(financialReport.totalExpenses).toBe(70000);
    expect(financialReport.netProfit).toBe(58000);
    expect(financialReport.profitMargin).toBe(45.3);
  });

  test('pengeluaran dikelompokkan per kategori; kategori asing masuk Lain-lain', () => {
    const breakdown = mapSalesSummary(RPC).financialReport.categoryBreakdown;
    expect(breakdown.map((c) => [c.category, c.totalAmount, c.percentage])).toEqual([
      ['Raw Material', 15000, 21.43],
      ['Operational', 50000, 71.43],
      ['Equipment', 0, 0],
      ['Other', 5000, 7.14],
    ]);
  });

  test('rugi tampil negatif tanpa margin', () => {
    const { financialReport } = mapSalesSummary({ ...RPC, total_revenue: 0, paid_orders: 0, total_expenses: 10000 });
    expect(financialReport.netProfit).toBe(-10000);
    expect(financialReport.profitMargin).toBe(0);
  });
});

describe('I4-16 Order dibatalkan tidak dihitung', () => {
  test.each([
    ['Completed', 'Paid', true],
    ['Processing', 'Paid', true],
    ['Cancelled', 'Refunded', false],
    ['Cancelled', 'Paid', false],
    ['Pending', 'Pending', false],
  ])('order %s / %s diakui sebagai penjualan: %s', (order_status, payment_status, expected) => {
    expect(isRecognizedSale({ order_status, payment_status })).toBe(expected);
  });
});

describe('I4-17 Batas hari WITA', () => {
  test('pukul 00:30 WITA sudah masuk tanggal baru walau UTC masih tanggal sebelumnya', () => {
    expect(toBusinessDateString(AFTER_MIDNIGHT.toISOString())).toBe('2026-11-17');
    expect(getReportDateRange('Hari Ini', AFTER_MIDNIGHT)).toEqual({ from: '2026-11-17', to: '2026-11-17' });
  });

  test('satu hari WITA = 16:00 UTC hari sebelumnya sampai 16:00 UTC', () => {
    expect(getBusinessDayRangeISO('2026-11-17', '2026-11-17')).toEqual({
      startISO: '2026-11-16T16:00:00.000Z',
      endISO: '2026-11-17T16:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// 7.4 Menu dan keranjang Customer
// ---------------------------------------------------------------------------

describe('I4-18 Lihat katalog', () => {
  test('menu Tersedia dapat dipesan', () => {
    expect(canAddProductToCustomerCart({ status: 'Tersedia', is_active: true })).toEqual({ canAdd: true });
  });

  test('menu Habis tampil tetapi tidak bisa dipesan', () => {
    expect(canAddProductToCustomerCart({ status: 'Tidak Tersedia', is_active: true })).toEqual({
      canAdd: false,
      reason: 'Produk sedang tidak tersedia (habis).',
    });
  });

  test('produk nonaktif tidak bisa dipesan', () => {
    expect(canAddProductToCustomerCart({ status: 'Tersedia', is_active: false }).canAdd).toBe(false);
  });
});

describe('I4-20 Detail menu', () => {
  test('detail menu tersedia menampilkan deskripsi', () => {
    expect(getProductDetailView({ status: 'Tersedia', is_active: true, description: '  Espresso dan susu segar ' })).toEqual({
      statusLabel: 'Tersedia',
      tone: 'success',
      canOrder: true,
      description: 'Espresso dan susu segar',
    });
  });

  test('detail menu habis tanpa deskripsi', () => {
    expect(getProductDetailView({ status: 'Tidak Tersedia', description: null })).toEqual({
      statusLabel: 'Habis',
      tone: 'danger',
      canOrder: false,
      description: 'Belum ada deskripsi untuk menu ini.',
    });
  });
});

const CART: CustomerCartItem[] = [
  { productId: 'p-kopi', productName: 'Kopi Susu Gula Aren', unitPrice: 24000, quantity: 1, notes: 'less sugar' },
  { productId: 'p-croissant', productName: 'Butter Croissant', unitPrice: 22000, quantity: 1 },
];

describe('I4-21 Tambah ke keranjang', () => {
  test('bar keranjang menampilkan jumlah item dan total', () => {
    expect(calculateCartTotals(CART)).toEqual({ totalItems: 2, subtotal: 46000, total: 46000 });
  });

  test('menambah menu baru masih dalam batas', () => {
    expect(checkCustomerCartChange(CART, 'p-americano', 1)).toEqual({ allowed: true });
  });
});

describe('I4-22 Ubah dan hapus item', () => {
  test('total mengikuti perubahan jumlah dan penghapusan item', () => {
    const changed = [{ ...CART[0], quantity: 3 }];
    expect(calculateCartTotals(changed)).toEqual({ totalItems: 3, subtotal: 72000, total: 72000 });
  });

  test('keranjang kosong bernilai nol', () => {
    expect(calculateCartTotals([])).toEqual({ totalItems: 0, subtotal: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// 7.5 Dashboard Admin
// ---------------------------------------------------------------------------

const DASHBOARD_ORDERS: DashboardOrder[] = [
  {
    id: 'o1', order_number: 'ORD-20261116-0001', order_status: 'Completed', payment_status: 'Paid', total_amount: 48000,
    created_at: '2026-11-16T01:00:00.000Z',
    items: [{ product_name: 'Kopi Susu Gula Aren', quantity: 2, subtotal: 48000 }],
  },
  {
    id: 'o2', order_number: 'ORD-20261116-0002', order_status: 'Processing', payment_status: 'Paid', total_amount: 25000,
    created_at: '2026-11-16T01:30:00.000Z',
    items: [{ product_name: 'Signature Chocolate', quantity: 1, subtotal: 25000 }],
  },
  {
    id: 'o3', order_number: 'ORD-20261116-0003', order_status: 'Pending', payment_status: 'Pending', total_amount: 15000,
    created_at: '2026-11-16T02:00:00.000Z',
  },
  {
    id: 'o4', order_number: 'ORD-20261116-0004', order_status: 'Cancelled', payment_status: 'Refunded', total_amount: 24000,
    created_at: '2026-11-16T00:30:00.000Z',
  },
  {
    id: 'o5', order_number: 'ORD-20261115-0007', order_status: 'Completed', payment_status: 'Paid', total_amount: 30000,
    created_at: '2026-11-15T10:00:00.000Z',
  },
];
const DASHBOARD_EXPENSES = [
  { id: 'x1', description: 'Es batu', amount: 20000, category: 'Raw Material', expense_date: '2026-11-16' },
  { id: 'x2', description: 'Gas', amount: 25000, category: 'Operational', expense_date: '2026-11-15' },
];
const INVENTORY = [
  { id: 'i1', name: 'Biji Kopi Arabika', current_stock: 2500, min_stock: 1000 },
  { id: 'i2', name: 'Gula Aren Cair', current_stock: 650, min_stock: 1000 },
  { id: 'i3', name: 'Bubuk Matcha', current_stock: 0, min_stock: 200 },
  { id: 'i4', name: 'Paper Cup', current_stock: 180, min_stock: 50, is_active: false },
];

describe('I4-23 Angka hari ini sesuai laporan', () => {
  test('omzet, biaya, laba bersih, dan produk terlaris diambil dari ringkasan yang sama dengan Laporan', () => {
    const local = calculateTodayDashboardMetrics(DASHBOARD_ORDERS, DASHBOARD_EXPENSES, INVENTORY, NOW);
    const summary = mapSalesSummary(RPC);
    const metrics = applySalesSummaryToDashboard(local, summary, { awaitingPaymentCount: 2 });

    expect(metrics.todaySales).toBe(summary.financialReport.totalSales);
    expect(metrics.todayExpenses).toBe(summary.financialReport.totalExpenses);
    expect(metrics.todayNetResult).toBe(summary.financialReport.netProfit);
    expect(metrics.todayPaidOrderCount).toBe(summary.salesReport.totalPaidOrders);
    expect(metrics.topProductToday).toEqual({ name: 'Kopi Susu Gula Aren', quantity: 4, sales: 96000 });
    expect(metrics.todayAwaitingPaymentCount).toBe(2);
    expect(metrics.todayOrderCount).toBe(local.todayOrderCount);
  });
});

describe('I4-24 Data order', () => {
  const metrics = calculateTodayDashboardMetrics(DASHBOARD_ORDERS, DASHBOARD_EXPENSES, INVENTORY, NOW);

  test('jumlah pesanan hari ini, yang berjalan, dan yang menunggu bayar', () => {
    expect(metrics.todayOrderCount).toBe(4);
    expect(metrics.todayInProgressCount).toBe(2);
    expect(metrics.todayAwaitingPaymentCount).toBe(1);
  });

  test('omzet hari ini hanya dari order lunas yang tidak dibatalkan', () => {
    expect(metrics.todayPaidOrderCount).toBe(2);
    expect(metrics.todaySales).toBe(73000);
    expect(metrics.todayExpenses).toBe(20000);
    expect(metrics.todayNetResult).toBe(53000);
    expect(metrics.topProductToday).toEqual({ name: 'Kopi Susu Gula Aren', quantity: 2, sales: 48000 });
  });

  test('Pesanan Terbaru urut dari yang terbaru', () => {
    expect(getRecentOrders(DASHBOARD_ORDERS, 3).map((o) => o.id)).toEqual(['o3', 'o2', 'o1']);
  });
});

describe('I4-25 Data stok', () => {
  test('jumlah Aman / Menipis / Habis sama dengan status di halaman Bahan Baku', () => {
    const metrics = calculateTodayDashboardMetrics([], [], INVENTORY, NOW);
    const active = INVENTORY.filter((i) => i.is_active !== false);
    const count = (label: string) => active.filter((i) => computeStockStatus(i.current_stock, i.min_stock).label === label).length;

    expect(metrics.safeStockCount).toBe(count('Aman'));
    expect(metrics.lowStockCount).toBe(count('Low Stock'));
    expect(metrics.outOfStockCount).toBe(count('Out of Stock'));
    expect([metrics.safeStockCount, metrics.lowStockCount, metrics.outOfStockCount]).toEqual([1, 1, 1]);
  });
});

describe('I4-26 Aktivitas Operasional', () => {
  const row = (patch: Partial<ActivityRow>): ActivityRow => ({
    kind: 'expense',
    category: 'kas',
    occurred_at: '2026-11-16T01:05:00.000Z',
    actor: 'kasir@faza.com',
    ref_id: 'ref-1',
    ref_label: null,
    amount: null,
    quantity: null,
    unit: null,
    note: null,
    extra: null,
    ...patch,
  });

  test('buka sif dan tutup sif dengan selisih', () => {
    expect(describeActivity(row({ kind: 'shift_open', amount: 200000 }))).toMatchObject({
      title: 'Sif dibuka oleh kasir@faza.com',
      detail: `Kas awal ${formatRupiah(200000)}`,
      route: '/(admin)/cash',
    });
    expect(describeActivity(row({ kind: 'shift_close', amount: -8000, note: 'Salah kembalian' }))).toMatchObject({
      tone: 'warning',
      detail: `Selisih kas −${formatRupiah(8000)} · Salah kembalian`,
    });
    expect(describeActivity(row({ kind: 'shift_close', amount: 0 })).tone).toBe('success');
  });

  test('pembatalan dengan refund dan koreksi metode membuka halaman Pesanan', () => {
    const refund = describeActivity(
      row({ kind: 'order_refund', category: 'pesanan', ref_label: 'ORD-20261116-0004', amount: 24000, extra: 'Tunai', note: 'Salah menu' })
    );
    expect(refund).toMatchObject({
      tone: 'danger',
      title: 'ORD-20261116-0004 dibatalkan & di-refund oleh kasir@faza.com',
      detail: `Refund ${formatRupiah(24000)} (Tunai) · Alasan: Salah menu`,
      route: '/(admin)/orders',
    });
    const correction = describeActivity(
      row({ kind: 'payment_correction', category: 'pesanan', ref_label: 'ORD-20261116-0001', actor: 'admin@faza.com', extra: 'Tunai → QRIS' })
    );
    expect(correction.detail).toBe('Tunai → QRIS oleh admin@faza.com');
    expect(correction.route).toBe('/(admin)/orders');
  });

  test('mutasi stok dan pengeluaran membuka halamannya masing-masing', () => {
    expect(
      describeActivity(row({ kind: 'stock_movement', category: 'stok', ref_label: 'Susu Uji', extra: 'Stock Out', quantity: 600, unit: 'ml' }))
    ).toMatchObject({ title: 'Stok keluar Susu Uji', route: '/(admin)/inventory' });
    expect(describeActivity(row({ kind: 'expense', ref_label: 'Es batu', amount: 20000, extra: 'cash' }))).toMatchObject({
      title: `Pengeluaran ${formatRupiah(20000)}`,
      detail: 'Es batu · dari kas laci oleh kasir@faza.com',
      route: '/(admin)/expense',
    });
  });

  test('filter Semua / Kas / Pesanan / Stok', () => {
    expect(ACTIVITY_FILTERS.map((f) => [f.label, f.category])).toEqual([
      ['Semua', null],
      ['Kas', 'kas'],
      ['Pesanan', 'pesanan'],
      ['Stok', 'stok'],
    ]);
  });

  test('waktu aktivitas ditampilkan dalam WITA', () => {
    expect(formatActivityTime('2026-11-16T01:05:00.000Z', NOW)).toBe('09:05');
    expect(formatActivityTime('2026-11-14T13:30:00.000Z', NOW)).toBe('14 Nov 21:30');
  });
});
