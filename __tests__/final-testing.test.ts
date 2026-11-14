/**
 * FANTASI COFFEE POS - FINAL COMPREHENSIVE INTEGRATION & ACCEPTANCE SUITE
 * Memverifikasi 16 Kriteria Keberhasilan Proyek (PRD Section 38)
 * dan seluruh siklus bisnis end-to-end dari Iterasi 1 hingga Iterasi 4.
 */

import {
  validateEmail,
  validatePassword,
  validateEmployeeInput,
  syncEmployeeStatusToUser,
  getDefaultRouteForRole,
} from '../lib/auth-logic';
import {
  evaluateNavigationGuard,
  normalizeRoute,
  isRouteActive,
} from '../lib/navigation-logic';
import {
  validateCategoryInput,
  canDeleteCategory,
} from '../lib/category-logic';
import {
  validateProductInput,
  toggleProductAvailability,
} from '../lib/product-logic';
import {
  computeStockStatus,
  calculateStockMovement,
  validateMovementNotes,
} from '../lib/inventory-logic';
import {
  addToCart,
  calculateCartTotals,
  calculateCashChange,
  getQuickCashSuggestions,
  generateOrderNumber,
} from '../lib/pos-logic';
import {
  canTransitionOrderStatus,
  canCancelOrder,
  validateCancellationPayload,
  OrderRecord,
} from '../lib/order-logic';
import {
  validateExpenseInput,
  calculateTotalExpenses,
} from '../lib/expense-logic';
import {
  calculateSalesReport,
  calculateFinancialReport,
} from '../lib/report-logic';
import {
  canAddProductToCustomerCart,
  validateCustomerCheckoutPayload,
  getCustomerOrderStatusMeta,
} from '../lib/customer-order-logic';
import {
  calculateTodayDashboardMetrics,
  getRecentOrders,
} from '../lib/dashboard-logic';
import {
  formatRupiah,
  formatStock,
} from '../lib/formatters';

describe('PRD Section 38: 16 Project Success Criteria Verification', () => {
  // ---------------------------------------------------------------------------
  // KRITERIA 1: Authentication & Authorization
  // ---------------------------------------------------------------------------
  describe('Kriteria 1: Authentication dan authorization berjalan dengan benar', () => {
    it('memvalidasi format email dan aturan panjang password', () => {
      expect(validateEmail('admin@fantasicoffee.com').isValid).toBe(true);
      expect(validateEmail('invalid-email').isValid).toBe(false);
      expect(validateEmail('').isValid).toBe(false);

      expect(validatePassword('secret123').isValid).toBe(true);
      expect(validatePassword('123').isValid).toBe(false);
      expect(validatePassword('').isValid).toBe(false);
    });

    it('memetakan rute awal berdasarkan peran setelah login', () => {
      expect(getDefaultRouteForRole('Admin', 'Aktif')).toBe('/(admin)/dashboard');
      expect(getDefaultRouteForRole('Kasir', 'Aktif')).toBe('/(kasir)/pos');
      expect(getDefaultRouteForRole('Customer', 'Aktif')).toBe('/(customer)/product');
      expect(getDefaultRouteForRole('Kasir', 'Nonaktif')).toBe('/(auth)/inactive');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 2: Customer Registration & Employee Status Sync
  // ---------------------------------------------------------------------------
  describe('Kriteria 2: Customer dapat mendaftar akun sendiri & sinkronisasi staf', () => {
    it('memvalidasi form pendaftaran dengan email dan password yang valid', () => {
      const emailCheck = validateEmail('customer@gmail.com');
      const passCheck = validatePassword('password123');
      expect(emailCheck.isValid && passCheck.isValid).toBe(true);
    });

    it('menjalankan invarian: jika status karyawan Nonaktif, akun otomatis Nonaktif (PRD Section 8)', () => {
      expect(syncEmployeeStatusToUser('Nonaktif', 'Aktif')).toBe('Nonaktif');
      expect(syncEmployeeStatusToUser('Aktif', 'Aktif')).toBe('Aktif');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 3 & 4: Role-Based Access Control (RBAC) & Gatekeeping
  // ---------------------------------------------------------------------------
  describe('Kriteria 3 & 4: Role Admin, Kasir, dan Customer berjalan sesuai hak akses', () => {
    it('mencegah Kasir mengakses dashboard admin (melempar ke unauthorized)', () => {
      const decision = evaluateNavigationGuard({
        isReady: true,
        session: { user: { id: 'u1' } },
        user: { role: 'Kasir', status: 'Aktif' },
        segments: ['(admin)', 'dashboard'],
      });
      expect(decision.action).toBe('redirect');
      expect(decision.targetHref).toBe('/(auth)/unauthorized');
    });

    it('mencegah Customer mengakses area POS kasir (melempar ke unauthorized)', () => {
      const decision = evaluateNavigationGuard({
        isReady: true,
        session: { user: { id: 'u2' } },
        user: { role: 'Customer', status: 'Aktif' },
        segments: ['(kasir)', 'pos'],
      });
      expect(decision.action).toBe('redirect');
      expect(decision.targetHref).toBe('/(auth)/unauthorized');
    });

    it('mengizinkan Admin mengakses dashboard admin', () => {
      const decision = evaluateNavigationGuard({
        isReady: true,
        session: { user: { id: 'u3' } },
        user: { role: 'Admin', status: 'Aktif' },
        segments: ['(admin)', 'dashboard'],
      });
      expect(decision.action).toBe('allow');
    });

    it('memblokir akun nonaktif ke layar inactive', () => {
      const decision = evaluateNavigationGuard({
        isReady: true,
        session: { user: { id: 'u4' } },
        user: { role: 'Admin', status: 'Nonaktif' },
        segments: ['(admin)', 'dashboard'],
      });
      expect(decision.action).toBe('redirect');
      expect(decision.targetHref).toBe('/(auth)/inactive');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 5: Pengelolaan Kategori dan Produk
  // ---------------------------------------------------------------------------
  describe('Kriteria 5: Admin dapat mengelola Category dan Product', () => {
    it('mencegah penghapusan kategori jika masih memiliki produk terkait (PRD Section 9)', () => {
      const checkBlocked = canDeleteCategory(3);
      expect(checkBlocked.canDelete).toBe(false);
      expect(checkBlocked.reason).toMatch(/terhubung/i);

      const checkAllowed = canDeleteCategory(0);
      expect(checkAllowed.canDelete).toBe(true);
    });

    it('memvalidasi input produk menu (nama, kategori, harga)', () => {
      expect(validateProductInput('Latte', 'cat-1', 25000).isValid).toBe(true);
      expect(validateProductInput('', 'cat-1', 25000).isValid).toBe(false);
      expect(validateProductInput('Latte', '', 25000).isValid).toBe(false);
      expect(validateProductInput('Latte', 'cat-1', -5000).isValid).toBe(false);
    });

    it('mengubah status ketersediaan produk secara manual (Tersedia <-> Tidak Tersedia)', () => {
      expect(toggleProductAvailability('Tersedia')).toBe('Tidak Tersedia');
      expect(toggleProductAvailability('Tidak Tersedia')).toBe('Tersedia');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 6: Pengelolaan Inventaris Bahan Baku & Perubahan Stok Manual
  // ---------------------------------------------------------------------------
  describe('Kriteria 6: Pengelolaan Inventory dan pencatatan perubahan stok secara manual', () => {
    it('menghitung mutasi Stock In, Stock Out, dan Stock Adjustment secara presisi', () => {
      // Stock In: 10 + 5 = 15
      const stockIn = calculateStockMovement('Stock In', 10, 5);
      expect(stockIn.isValid).toBe(true);
      expect(stockIn.stockAfter).toBe(15);

      // Stock Out: 10 - 4 = 6
      const stockOut = calculateStockMovement('Stock Out', 10, 4);
      expect(stockOut.isValid).toBe(true);
      expect(stockOut.stockAfter).toBe(6);

      // Stock Adjustment: nilai baru menjadi 20
      const adjustment = calculateStockMovement('Stock Adjustment', 10, 20);
      expect(adjustment.isValid).toBe(true);
      expect(adjustment.stockAfter).toBe(20);
    });

    it('mencegah Stock Out yang melebihi jumlah stok fisik saat ini', () => {
      const overStockOut = calculateStockMovement('Stock Out', 10, 15);
      expect(overStockOut.isValid).toBe(false);
      expect(overStockOut.error).toMatch(/tidak mencukupi/i);
    });

    it('mewajibkan catatan untuk Stock Out dan Stock Adjustment', () => {
      expect(validateMovementNotes('Stock In', '').isValid).toBe(true);
      expect(validateMovementNotes('Stock Out', '').isValid).toBe(false);
      expect(validateMovementNotes('Stock Out', 'Pemakaian kopi').isValid).toBe(true);
      expect(validateMovementNotes('Stock Adjustment', '').isValid).toBe(false);
    });

    it('menentukan status kesehatan stok (Aman, Low Stock, Out of Stock)', () => {
      expect(computeStockStatus(10, 5).label).toBe('Aman');
      expect(computeStockStatus(4, 5).label).toBe('Low Stock');
      expect(computeStockStatus(0, 5).label).toBe('Out of Stock');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 7: Proses Point of Sale (POS) Kasir
  // ---------------------------------------------------------------------------
  describe('Kriteria 7: Kasir dapat melakukan proses POS', () => {
    it('mengelola keranjang kasir, kuantitas item, dan subtotal secara otomatis', () => {
      let cart = addToCart([], { id: 'p1', name: 'Americano', price: 20000 });
      cart = addToCart(cart, { id: 'p1', name: 'Americano', price: 20000 });
      cart = addToCart(cart, { id: 'p2', name: 'Croissant', price: 25000 });

      const totals = calculateCartTotals(cart);
      expect(totals.totalItems).toBe(3);
      expect(totals.total).toBe(65000); // (2 * 20000) + (1 * 25000)
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 8: Order dan Payment Tercatat Benar
  // ---------------------------------------------------------------------------
  describe('Kriteria 8: Order dan Payment dapat tercatat dengan benar', () => {
    it('menghitung uang kembalian tunai kasir dan memberikan saran pecahan cepat', () => {
      const changeResult = calculateCashChange(65000, 100000);
      expect(changeResult.isValid).toBe(true);
      expect(changeResult.change).toBe(35000);

      const suggestions = getQuickCashSuggestions(65000);
      expect(suggestions).toContain(65000); // Uang pas
      expect(suggestions).toContain(70000); // Pembulatan puluhan ribu terdekat
      expect(suggestions).toContain(100000); // Pecahan uang kertas standar
    });

    it('menghasilkan nomor pesanan berformat standar ORD-YYYYMMDD-XXXX', () => {
      const orderNum = generateOrderNumber(new Date(2026, 10, 11), 42);
      expect(orderNum).toBe('ORD-20261111-0042');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 9: Pembatalan dan Refund Order
  // ---------------------------------------------------------------------------
  describe('Kriteria 9: Pembatalan dan refund Order tercatat dengan benar', () => {
    it('mengizinkan Admin dan Kasir membatalkan pesanan yang belum Completed', () => {
      expect(canCancelOrder({ order_status: 'Pending' }, 'Kasir').canCancel).toBe(true);
      expect(canCancelOrder({ order_status: 'Processing' }, 'Admin').canCancel).toBe(true);
      expect(canCancelOrder({ order_status: 'Ready' }, 'Kasir').canCancel).toBe(true);
    });

    it('melarang pembatalan pesanan yang sudah Completed atau Cancelled', () => {
      expect(canCancelOrder({ order_status: 'Completed' }, 'Admin').canCancel).toBe(false);
      expect(canCancelOrder({ order_status: 'Cancelled' }, 'Kasir').canCancel).toBe(false);
    });

    it('mewajibkan alasan pembatalan minimal 3 karakter', () => {
      expect(validateCancellationPayload('').isValid).toBe(false);
      expect(validateCancellationPayload('ab').isValid).toBe(false);
      expect(validateCancellationPayload('Pelanggan buru-buru pergi').isValid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 10: Sales Report (Hanya Order Lunas)
  // ---------------------------------------------------------------------------
  describe('Kriteria 10: Sales Report dapat dihasilkan', () => {
    const orders: OrderRecord[] = [
      {
        id: '1',
        order_number: 'ORD-1',
        order_status: 'Completed',
        total_amount: 50000,
        payment_method: 'QRIS',
        payment_status: 'Paid',
        created_at: '2026-11-11T10:00:00Z',
      },
      {
        id: '2',
        order_number: 'ORD-2',
        order_status: 'Cancelled', // Invarian: tidak boleh dihitung ke sales report
        total_amount: 80000,
        payment_method: 'Tunai',
        payment_status: 'Pending',
        created_at: '2026-11-11T11:00:00Z',
      },
    ];

    it('hanya menghitung pesanan yang sudah lunas dan tidak dibatalkan ke dalam omzet penjualan (PRD Section 21)', () => {
      const report = calculateSalesReport(orders, [
        { order_id: '1', product_name: 'Espresso', quantity: 2, subtotal: 50000 },
      ]);
      expect(report.totalRevenue).toBe(50000);
      expect(report.totalPaidOrders).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 11: Financial Report (Net Result = Sales - Expenses)
  // ---------------------------------------------------------------------------
  describe('Kriteria 11: Financial Report dapat dihasilkan', () => {
    it('menghitung Laba Bersih = Penjualan - Pengeluaran secara akurat (PRD Section 22)', () => {
      const completedOrders = [
        {
          id: '1',
          total_amount: 1000000,
          order_status: 'Completed',
          payment_status: 'Paid',
          created_at: '2026-11-11T10:00:00Z',
        },
      ];

      const expenses = [
        { id: 'e1', description: 'Beli Kopi', amount: 300000, category: 'Raw Material', expense_date: '2026-11-11' },
        { id: 'e2', description: 'Listrik', amount: 200000, category: 'Operational', expense_date: '2026-11-11' },
      ];

      const report = calculateFinancialReport(completedOrders, expenses);

      expect(report.totalSales).toBe(1000000);
      expect(report.totalExpenses).toBe(500000);
      expect(report.netProfit).toBe(500000);
      expect(report.profitMargin).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 12: Customer Ordering & Invarian Ketersediaan
  // ---------------------------------------------------------------------------
  describe('Kriteria 12: Customer dapat melakukan pemesanan mandiri', () => {
    it('mencegah produk berstatus Habis atau Tidak Tersedia dipesan oleh pelanggan (PRD Section 23)', () => {
      expect(canAddProductToCustomerCart({ status: 'Tersedia', is_active: true }).canAdd).toBe(true);
      expect(canAddProductToCustomerCart({ status: 'Tidak Tersedia', is_active: true }).canAdd).toBe(false);
      expect(canAddProductToCustomerCart({ status: 'Habis', is_active: true }).canAdd).toBe(false);
    });

    it('memvalidasi formulir checkout pelanggan', () => {
      const validPayload = {
        cart: [{ productId: 'p1', productName: 'Cappuccino', unitPrice: 22000, quantity: 1, status: 'Tersedia' }],
        customerName: 'Ahmad Faza',
        orderType: 'Dine In' as const,
        paymentMethod: 'QRIS' as const,
        tableNumber: 'Meja 02',
      };
      expect(validateCustomerCheckoutPayload(validPayload).isValid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 13: Customer Order Status Tracking
  // ---------------------------------------------------------------------------
  describe('Kriteria 13: Customer dapat melihat status Order miliknya', () => {
    it('memetakan langkah dan label pelacakan status pesanan secara bertahap (PRD Section 26)', () => {
      expect(getCustomerOrderStatusMeta('Pending').step).toBe(1);
      expect(getCustomerOrderStatusMeta('Processing').step).toBe(2);
      expect(getCustomerOrderStatusMeta('Ready').step).toBe(3);
      expect(getCustomerOrderStatusMeta('Completed').step).toBe(4);
      expect(getCustomerOrderStatusMeta('Cancelled').step).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 14: Admin Dashboard Monitoring Live
  // ---------------------------------------------------------------------------
  describe('Kriteria 14: Admin dapat memantau operasional melalui Dashboard (PRD Section 27)', () => {
    it('mengagregasi metrik omzet hari ini, produk terlaris, dan peringatan stok bahan baku', () => {
      const todayDate = new Date('2026-11-11T12:00:00Z');
      const metrics = calculateTodayDashboardMetrics(
        [
          {
            id: 'o1',
            order_number: 'ORD-1',
            order_status: 'Completed',
            payment_status: 'Paid',
            total_amount: 60000,
            created_at: '2026-11-11T09:00:00Z',
            items: [{ product_name: 'Kopi Susu', quantity: 3, subtotal: 60000 }],
          },
        ],
        [
          { id: 'e1', description: 'Es Batu', amount: 15000, category: 'Raw Material', expense_date: '2026-11-11' },
        ],
        [
          { id: 'i1', name: 'Susu', current_stock: 1, min_stock: 5, is_deleted: false }, // Low
          { id: 'i2', name: 'Gula', current_stock: 0, min_stock: 2, is_deleted: false }, // Out
          { id: 'i3', name: 'Kopi', current_stock: 10, min_stock: 2, is_deleted: false }, // Safe
        ],
        todayDate
      );

      expect(metrics.todaySales).toBe(60000);
      expect(metrics.todayExpenses).toBe(15000);
      expect(metrics.todayNetResult).toBe(45000);
      expect(metrics.topProductToday?.name).toBe('Kopi Susu');
      expect(metrics.lowStockCount).toBe(1);
      expect(metrics.outOfStockCount).toBe(1);
      expect(metrics.safeStockCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 15: Sistem Tidak Mengalami Crash (Safe Formatters & Bounds)
  // ---------------------------------------------------------------------------
  describe('Kriteria 15: Sistem tidak mengalami crash pada penggunaan normal', () => {
    it('menangani input null, undefined, atau NaN dengan aman pada helper formatters', () => {
      expect(formatRupiah(0)).toBe('Rp\u00a00');
      expect(formatRupiah(NaN)).toBe('Rp 0');
      expect(formatRupiah(null as any)).toBe('Rp 0');
      expect(formatStock(0, 'kg')).toContain('0 kg');
    });
  });

  // ---------------------------------------------------------------------------
  // KRITERIA 16: Konsistensi Data Transaksi & Inventory
  // ---------------------------------------------------------------------------
  describe('Kriteria 16: Data transaksi dan inventory tetap konsisten', () => {
    it('menjamin total amount pesanan konsisten dengan penjumlahan subtotal item', () => {
      const items = [
        { product_name: 'Espresso', quantity: 2, unit_price: 18000 },
        { product_name: 'Matcha', quantity: 1, unit_price: 25000 },
      ];
      const sumSubtotals = items.reduce((acc, curr) => acc + curr.quantity * curr.unit_price, 0);
      expect(sumSubtotals).toBe(61000);

      const cart = [
        { productId: '1', productName: 'Espresso', unitPrice: 18000, quantity: 2 },
        { productId: '2', productName: 'Matcha', unitPrice: 25000, quantity: 1 },
      ];
      expect(calculateCartTotals(cart).total).toBe(sumSubtotals);
    });
  });
});
