import {
  validateCustomerCheckoutPayload,
  canAddProductToCustomerCart,
  getCustomerOrderStatusMeta,
  CustomerCartItem,
} from '../lib/customer-order-logic';
import {
  calculateTodayDashboardMetrics,
  getRecentOrders,
  DashboardOrder,
  DashboardExpense,
  DashboardInventoryItem,
} from '../lib/dashboard-logic';

describe('ITERASI 4: Customer Ordering & Admin Dashboard Pure Logic', () => {
  describe('4.1 Invarian Ketersediaan Produk Pelanggan (canAddProductToCustomerCart)', () => {
    it('mengizinkan penambahan produk yang aktif dan berstatus Tersedia', () => {
      const product = {
        id: 'p1',
        name: 'Kopi Susu Gula Aren',
        status: 'Tersedia' as const,
        is_active: true,
      };
      const result = canAddProductToCustomerCart(product);
      expect(result.canAdd).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('menolak produk dengan status Tidak Tersedia', () => {
      const product = {
        id: 'p2',
        name: 'Manual Brew V60 Geisha',
        status: 'Tidak Tersedia' as const,
        is_active: true,
      };
      const result = canAddProductToCustomerCart(product);
      expect(result.canAdd).toBe(false);
      expect(result.reason).toMatch(/tidak tersedia/i);
    });

    it('menolak produk yang statusnya Habis atau tidak aktif (is_active === false)', () => {
      const product = {
        id: 'p3',
        name: 'Croissant Cokelat',
        status: 'Tersedia' as const,
        is_active: false,
      };
      const result = canAddProductToCustomerCart(product);
      expect(result.canAdd).toBe(false);
      expect(result.reason).toMatch(/tidak aktif/i);
    });
  });

  describe('4.2 Validasi Checkout Pelanggan (validateCustomerCheckoutPayload)', () => {
    const validCart: CustomerCartItem[] = [
      {
        productId: 'prod-1',
        productName: 'Americano Dingin',
        unitPrice: 18000,
        quantity: 2,
        notes: 'Less ice',
        status: 'Tersedia',
      },
    ];

    it('menolak keranjang belanja yang kosong', () => {
      const result = validateCustomerCheckoutPayload({
        cart: [],
        customerName: 'Budi Santoso',
        orderType: 'Dine In',
        paymentMethod: 'QRIS',
        tableNumber: '05',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/keranjang.*kosong/i);
    });

    it('menolak pesanan jika terdapat item dengan kuantitas <= 0', () => {
      const invalidCart: CustomerCartItem[] = [
        {
          productId: 'prod-1',
          productName: 'Americano Dingin',
          unitPrice: 18000,
          quantity: 0,
        },
      ];
      const result = validateCustomerCheckoutPayload({
        cart: invalidCart,
        customerName: 'Budi Santoso',
        orderType: 'Dine In',
        paymentMethod: 'QRIS',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/kuantitas.*tidak valid/i);
    });

    it('menolak pesanan jika di dalam keranjang terdapat produk yang Tidak Tersedia', () => {
      const cartWithUnavailable: CustomerCartItem[] = [
        {
          productId: 'prod-1',
          productName: 'Kopi Susu',
          unitPrice: 20000,
          quantity: 1,
          status: 'Tidak Tersedia',
        },
      ];
      const result = validateCustomerCheckoutPayload({
        cart: cartWithUnavailable,
        customerName: 'Budi Santoso',
        orderType: 'Take Away',
        paymentMethod: 'Tunai',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/tidak tersedia/i);
    });

    it('menolak jika nama pelanggan kosong', () => {
      const result = validateCustomerCheckoutPayload({
        cart: validCart,
        customerName: '   ',
        orderType: 'Dine In',
        paymentMethod: 'QRIS',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/nama.*wajib/i);
    });

    it('menolak jika tipe order tidak valid (bukan Dine In atau Take Away)', () => {
      const result = validateCustomerCheckoutPayload({
        cart: validCart,
        customerName: 'Budi',
        orderType: 'Delivery' as any,
        paymentMethod: 'QRIS',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/tipe pesanan.*tidak valid/i);
    });

    it('menolak jika metode pembayaran bukan Tunai atau QRIS', () => {
      const result = validateCustomerCheckoutPayload({
        cart: validCart,
        customerName: 'Budi',
        orderType: 'Dine In',
        paymentMethod: 'Kredit' as any,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/metode pembayaran.*tidak valid/i);
    });

    it('menerima payload yang valid untuk Dine In dengan nomor meja', () => {
      const result = validateCustomerCheckoutPayload({
        cart: validCart,
        customerName: 'Budi Santoso',
        orderType: 'Dine In',
        paymentMethod: 'QRIS',
        tableNumber: 'Meja 03',
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('menerima payload yang valid untuk Take Away tanpa nomor meja', () => {
      const result = validateCustomerCheckoutPayload({
        cart: validCart,
        customerName: 'Siti Rahma',
        orderType: 'Take Away',
        paymentMethod: 'Tunai',
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('4.3 Pemetaan Status Pelacakan Pesanan Pelanggan (getCustomerOrderStatusMeta)', () => {
    it('memberikan metadata yang tepat untuk status Pending', () => {
      const meta = getCustomerOrderStatusMeta('Pending');
      expect(meta.step).toBe(1);
      expect(meta.tone).toBe('warning');
      expect(meta.label).toBe('Menunggu Konfirmasi');
      expect(meta.description).toMatch(/menunggu/i);
    });

    it('memberikan metadata yang tepat untuk status Processing', () => {
      const meta = getCustomerOrderStatusMeta('Processing');
      expect(meta.step).toBe(2);
      expect(meta.tone).toBe('accent');
      expect(meta.label).toBe('Sedang Disiapkan');
    });

    it('memberikan metadata yang tepat untuk status Ready', () => {
      const meta = getCustomerOrderStatusMeta('Ready');
      expect(meta.step).toBe(3);
      expect(meta.label).toBe('Siap Diambil');
    });

    it('memberikan metadata yang tepat untuk status Completed', () => {
      const meta = getCustomerOrderStatusMeta('Completed');
      expect(meta.step).toBe(4);
      expect(meta.tone).toBe('success');
      expect(meta.label).toBe('Selesai');
    });

    it('memberikan metadata yang tepat untuk status Cancelled', () => {
      const meta = getCustomerOrderStatusMeta('Cancelled');
      expect(meta.step).toBe(0);
      expect(meta.tone).toBe('danger');
      expect(meta.label).toBe('Dibatalkan');
    });
  });

  describe('4.4 Metrik Agregasi Admin Dashboard (calculateTodayDashboardMetrics)', () => {
    const today = new Date('2026-11-10T12:00:00Z');

    const sampleOrders: DashboardOrder[] = [
      // Order hari ini - Completed (omzet masuk)
      {
        id: 'o1',
        order_number: 'ORD-20261110-0001',
        order_status: 'Completed',
        payment_status: 'Paid',
        total_amount: 50000,
        created_at: '2026-11-10T08:30:00Z',
        items: [
          { product_name: 'Espresso', quantity: 2, subtotal: 36000 },
          { product_name: 'Mineral Water', quantity: 1, subtotal: 14000 },
        ],
      },
      // Order hari ini - Completed (omzet masuk)
      {
        id: 'o2',
        order_number: 'ORD-20261110-0002',
        order_status: 'Completed',
        payment_status: 'Paid',
        total_amount: 36000,
        created_at: '2026-11-10T09:15:00Z',
        items: [
          { product_name: 'Espresso', quantity: 2, subtotal: 36000 },
        ],
      },
      // Order hari ini - Pending & belum dibayar (TIDAK boleh masuk omzet sales)
      {
        id: 'o3',
        order_number: 'ORD-20261110-0003',
        order_status: 'Pending',
        payment_status: 'Pending',
        total_amount: 45000,
        created_at: '2026-11-10T10:00:00Z',
        items: [
          { product_name: 'Matcha Latte', quantity: 2, subtotal: 45000 },
        ],
      },
      // Order hari ini - Cancelled (TIDAK boleh masuk omzet sales)
      {
        id: 'o4',
        order_number: 'ORD-20261110-0004',
        order_status: 'Cancelled',
        payment_status: 'Refunded',
        total_amount: 25000,
        created_at: '2026-11-10T10:30:00Z',
        items: [
          { product_name: 'Croissant', quantity: 1, subtotal: 25000 },
        ],
      },
      // Order kemarin - Completed (TIDAK boleh masuk hari ini)
      {
        id: 'o5',
        order_number: 'ORD-20261109-0001',
        order_status: 'Completed',
        payment_status: 'Paid',
        total_amount: 100000,
        created_at: '2026-11-09T08:00:00Z',
        items: [
          { product_name: 'Espresso', quantity: 5, subtotal: 90000 },
        ],
      },
    ];

    const sampleExpenses: DashboardExpense[] = [
      // Pengeluaran hari ini
      {
        id: 'e1',
        description: 'Beli Susu Segar',
        amount: 25000,
        category: 'Raw Material',
        expense_date: '2026-11-10',
      },
      // Pengeluaran kemarin
      {
        id: 'e2',
        description: 'Beli Cup Takeaway',
        amount: 50000,
        category: 'Operational',
        expense_date: '2026-11-09',
      },
    ];

    const sampleInventory: DashboardInventoryItem[] = [
      { id: 'i1', name: 'Biji Kopi Arabika', current_stock: 10, min_stock: 5, is_deleted: false }, // Aman
      { id: 'i2', name: 'Susu Segar', current_stock: 3, min_stock: 5, is_deleted: false },        // Menipis
      { id: 'i3', name: 'Sirup Karamel', current_stock: 0, min_stock: 2, is_deleted: false },      // Habis
      { id: 'i4', name: 'Item Dihapus', current_stock: 0, min_stock: 2, is_deleted: true },        // Terhapus (diabaikan)
    ];

    it('menghitung jumlah total order hari ini (semua status hari ini)', () => {
      const metrics = calculateTodayDashboardMetrics(
        sampleOrders,
        sampleExpenses,
        sampleInventory,
        today
      );
      // o1, o2, o3, o4 dibuat hari ini = 4 order
      expect(metrics.todayOrderCount).toBe(4);
    });

    it('menghitung omzet hari ini hanya dari order yang sudah lunas dan tidak dibatalkan', () => {
      const metrics = calculateTodayDashboardMetrics(
        sampleOrders,
        sampleExpenses,
        sampleInventory,
        today
      );
      // o1 (50000) + o2 (36000) = 86000
      expect(metrics.todaySales).toBe(86000);
      expect(metrics.todayPaidOrderCount).toBe(2);
    });

    it('mengidentifikasi produk terlaris hari ini berdasarkan kuantitas pada order lunas', () => {
      const metrics = calculateTodayDashboardMetrics(
        sampleOrders,
        sampleExpenses,
        sampleInventory,
        today
      );
      // Espresso: 2 + 2 = 4 cups
      // Mineral Water: 1
      expect(metrics.topProductToday).not.toBeNull();
      expect(metrics.topProductToday?.name).toBe('Espresso');
      expect(metrics.topProductToday?.quantity).toBe(4);
    });

    it('menghitung pengeluaran hari ini dan Net Result (Sales - Expense)', () => {
      const metrics = calculateTodayDashboardMetrics(
        sampleOrders,
        sampleExpenses,
        sampleInventory,
        today
      );
      // Expense hari ini: 25000
      expect(metrics.todayExpenses).toBe(25000);
      // Net Result: 86000 - 25000 = 61000
      expect(metrics.todayNetResult).toBe(61000);
    });

    it('menghitung status stok bahan baku dengan benar (mengabaikan item yang dihapus)', () => {
      const metrics = calculateTodayDashboardMetrics(
        sampleOrders,
        sampleExpenses,
        sampleInventory,
        today
      );
      expect(metrics.safeStockCount).toBe(1);
      expect(metrics.lowStockCount).toBe(1);
      expect(metrics.outOfStockCount).toBe(1);
    });
  });

  describe('4.5 Riwayat Pesanan Terbaru (getRecentOrders)', () => {
    it('mengurutkan pesanan dari yang paling baru dan membatasi jumlah sesuai limit', () => {
      const orders: DashboardOrder[] = [
        { id: '1', order_number: 'ORD-1', order_status: 'Pending', payment_status: 'Pending', total_amount: 10000, created_at: '2026-11-10T08:00:00Z' },
        { id: '2', order_number: 'ORD-2', order_status: 'Completed', payment_status: 'Paid', total_amount: 20000, created_at: '2026-11-10T11:00:00Z' },
        { id: '3', order_number: 'ORD-3', order_status: 'Processing', payment_status: 'Paid', total_amount: 30000, created_at: '2026-11-10T09:30:00Z' },
      ];

      const recent = getRecentOrders(orders, 2);
      expect(recent.length).toBe(2);
      expect(recent[0].id).toBe('2'); // Paling baru (11:00)
      expect(recent[1].id).toBe('3'); // Kedua (09:30)
    });
  });
});
