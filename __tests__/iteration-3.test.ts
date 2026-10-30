import {
  CartItem,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  updateCartItemNotes,
  calculateItemSubtotal,
  calculateCartTotals,
  calculateCashChange,
  getQuickCashSuggestions,
  validateOrderPayload,
  generateOrderNumber,
  filterPosProducts,
  PosProduct,
} from "../lib/pos-logic";

describe("Iterasi 3 - Terminal POS Kasir & Transaksi Pemesanan (POS Terminal & Order Engine)", () => {
  // ============================================================================
  // BAGIAN 3.1: PENGELOLAAN KERANJANG KASIR (CART MANAGEMENT)
  // ============================================================================
  describe("3.1 Pengelolaan Keranjang Belanja (Cart Management)", () => {
    const mockProduct1: PosProduct = {
      id: "prod-1",
      name: "Kopi Susu Gula Aren",
      price: 24000,
      category_id: "cat-1",
      status: "Tersedia",
      is_active: true,
    };

    const mockProduct2: PosProduct = {
      id: "prod-2",
      name: "Croissant Mentega",
      price: 22000,
      category_id: "cat-2",
      status: "Tersedia",
      is_active: true,
    };

    it("menambahkan item baru ke dalam keranjang kosong", () => {
      const initialCart: CartItem[] = [];
      const updatedCart = addToCart(initialCart, mockProduct1);

      expect(updatedCart).toHaveLength(1);
      expect(updatedCart[0]).toEqual({
        productId: "prod-1",
        productName: "Kopi Susu Gula Aren",
        unitPrice: 24000,
        quantity: 1,
        notes: "",
      });
    });

    it("menambah quantity jika item yang sama ditambahkan kembali tanpa catatan berbeda", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 1,
          notes: "",
        },
      ];

      const updatedCart = addToCart(cart, mockProduct1);
      expect(updatedCart).toHaveLength(1);
      expect(updatedCart[0].quantity).toBe(2);
    });

    it("memisahkan item jika produk sama memiliki catatan pesanan berbeda", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 1,
          notes: "Normal Sweet",
        },
      ];

      const updatedCart = addToCart(cart, mockProduct1, "Less Sugar & Oat Milk");
      expect(updatedCart).toHaveLength(2);
      expect(updatedCart[0].notes).toBe("Normal Sweet");
      expect(updatedCart[1].notes).toBe("Less Sugar & Oat Milk");
    });

    it("dapat menaikkan dan menurunkan quantity item", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 2,
          notes: "",
        },
      ];

      // Naikkan quantity
      const incremented = updateCartItemQuantity(cart, "prod-1", 1);
      expect(incremented[0].quantity).toBe(3);

      // Turunkan quantity
      const decremented = updateCartItemQuantity(incremented, "prod-1", -1);
      expect(decremented[0].quantity).toBe(2);
    });

    it("menghapus item otomatis jika quantity diturunkan hingga 0 atau negatif", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 1,
          notes: "",
        },
        {
          productId: "prod-2",
          productName: "Croissant Mentega",
          unitPrice: 22000,
          quantity: 1,
          notes: "",
        },
      ];

      const updated = updateCartItemQuantity(cart, "prod-1", -1);
      expect(updated).toHaveLength(1);
      expect(updated[0].productId).toBe("prod-2");
    });

    it("dapat menghapus item secara langsung dari keranjang", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 2,
          notes: "",
        },
      ];

      const updated = removeFromCart(cart, "prod-1");
      expect(updated).toHaveLength(0);
    });

    it("dapat memperbarui catatan khusus pada item keranjang", () => {
      const cart: CartItem[] = [
        {
          productId: "prod-1",
          productName: "Kopi Susu Gula Aren",
          unitPrice: 24000,
          quantity: 1,
          notes: "",
        },
      ];

      const updated = updateCartItemNotes(cart, "prod-1", "Extra Espresso Shot");
      expect(updated[0].notes).toBe("Extra Espresso Shot");
    });
  });

  // ============================================================================
  // BAGIAN 3.2: KALKULASI TOTAL & MATEMATIKA KASIR (CART TOTALS & FINANCIALS)
  // ============================================================================
  describe("3.2 Perhitungan Subtotal, Total Belanja & Item Count", () => {
    it("menghitung subtotal per item pesanan (unitPrice * quantity)", () => {
      const item: CartItem = {
        productId: "p1",
        productName: "Kopi",
        unitPrice: 25000,
        quantity: 3,
        notes: "",
      };

      expect(calculateItemSubtotal(item)).toBe(75000);
    });

    it("menghitung total keseluruhan keranjang dengan benar", () => {
      const cart: CartItem[] = [
        {
          productId: "p1",
          productName: "Kopi Susu",
          unitPrice: 24000,
          quantity: 2, // 48.000
          notes: "",
        },
        {
          productId: "p2",
          productName: "Croissant",
          unitPrice: 22000,
          quantity: 1, // 22.000
          notes: "",
        },
        {
          productId: "p3",
          productName: "Mineral Water",
          unitPrice: 10000,
          quantity: 3, // 30.000
          notes: "",
        },
      ];

      const totals = calculateCartTotals(cart);
      expect(totals.totalItems).toBe(6);
      expect(totals.subtotal).toBe(100000);
      expect(totals.total).toBe(100000);
    });

    it("mengembalikan 0 untuk keranjang kosong", () => {
      const totals = calculateCartTotals([]);
      expect(totals.totalItems).toBe(0);
      expect(totals.subtotal).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  // ============================================================================
  // BAGIAN 3.3: PEMBAYARAN TUNAI, KEMBALIAN & SUGGESTION
  // ============================================================================
  describe("3.3 Perhitungan Pembayaran Tunai & Uang Kembalian", () => {
    it("menghitung kembalian uang pas dan lebih dengan benar", () => {
      // Uang pas
      const exact = calculateCashChange(50000, 50000);
      expect(exact.isValid).toBe(true);
      expect(exact.change).toBe(0);

      // Uang lebih
      const change = calculateCashChange(45000, 50000);
      expect(change.isValid).toBe(true);
      expect(change.change).toBe(5000);
    });

    it("menolak jika nominal uang tunai yang diberikan kurang dari total belanja", () => {
      const result = calculateCashChange(50000, 40000);
      expect(result.isValid).toBe(false);
      expect(result.change).toBe(0);
      expect(result.error).toContain("Nominal uang tunai kurang dari total tagihan");
    });

    it("memberikan saran pecahan uang cepat (Quick Cash Suggestions)", () => {
      // Untuk total Rp 46.000 -> Uang pas (46.000), 50.000, 100.000
      const suggestions = getQuickCashSuggestions(46000);
      expect(suggestions).toContain(46000); // Uang pas
      expect(suggestions).toContain(50000);
      expect(suggestions).toContain(100000);
    });
  });

  // ============================================================================
  // BAGIAN 3.4: VALIDASI PAYLOAD PESANAN (ORDER VALIDATION)
  // ============================================================================
  describe("3.4 Validasi Transaksi Sebelum Disimpan ke Database", () => {
    const validCart: CartItem[] = [
      {
        productId: "p1",
        productName: "Americano",
        unitPrice: 20000,
        quantity: 1,
        notes: "",
      },
    ];

    it("menerima payload pesanan tunai yang valid", () => {
      const result = validateOrderPayload({
        cart: validCart,
        paymentMethod: "Tunai",
        cashGiven: 50000,
        customerName: "Budi",
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("menerima payload pesanan QRIS yang valid tanpa perlu input tunai", () => {
      const result = validateOrderPayload({
        cart: validCart,
        paymentMethod: "QRIS",
        customerName: "Meja 04",
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("menolak transaksi jika keranjang kosong", () => {
      const result = validateOrderPayload({
        cart: [],
        paymentMethod: "Tunai",
        cashGiven: 50000,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Keranjang belanja masih kosong");
    });

    it("menolak transaksi tunai jika uang tunai belum diisi atau kurang", () => {
      const result = validateOrderPayload({
        cart: validCart,
        paymentMethod: "Tunai",
        cashGiven: 10000, // Tagihan 20.000
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Nominal uang tunai kurang");
    });
  });

  // ============================================================================
  // BAGIAN 3.5: GENERATOR NOMOR ORDER & FILTER PRODUK
  // ============================================================================
  describe("3.5 Generator Nomor Order & Filter Katalog Kasir", () => {
    it("menghasilkan nomor order berformat ORD-YYYYMMDD-XXXX", () => {
      const fixedDate = new Date(2026, 9, 19); // 19 Oktober 2026
      const orderNumber = generateOrderNumber(fixedDate, 7);
      expect(orderNumber).toBe("ORD-20261019-0007");
    });

    it("memfilter katalog produk untuk kasir (hanya yang aktif)", () => {
      const products: PosProduct[] = [
        {
          id: "1",
          name: "V60 Aceh Gayo",
          price: 28000,
          category_id: "cat-coffee",
          status: "Tersedia",
          is_active: true,
        },
        {
          id: "2",
          name: "Matcha Latte",
          price: 27000,
          category_id: "cat-noncoffee",
          status: "Tidak Tersedia",
          is_active: true,
        },
        {
          id: "3",
          name: "Menu Draf Lama",
          price: 15000,
          category_id: "cat-coffee",
          status: "Tersedia",
          is_active: false, // Arsip / non-aktif
        },
      ];

      // Filter berdasarkan kategori
      const coffeeOnly = filterPosProducts(products, "cat-coffee", "");
      expect(coffeeOnly).toHaveLength(1);
      expect(coffeeOnly[0].name).toBe("V60 Aceh Gayo");

      // Filter berdasarkan pencarian nama
      const searchResult = filterPosProducts(products, null, "matcha");
      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].name).toBe("Matcha Latte");

      // Tidak menampilkan item dengan is_active = false
      const allActive = filterPosProducts(products, null, "");
      expect(allActive).toHaveLength(2);
      expect(allActive.find((p) => p.id === "3")).toBeUndefined();
    });
  });

  // ============================================================================
  // BAGIAN 3.6: PENGUBAHAN CEPAT KETERSEDIAAN MENU OLEH KASIR (QUICK TOGGLE)
  // ============================================================================
  describe("3.6 Pengubahan Cepat Ketersediaan Menu oleh Kasir (Toggle Status)", () => {
    it("dapat mengubah status produk dari Tersedia menjadi Tidak Tersedia dan sebaliknya", () => {
      // Import toggleProductAvailability dari product-logic
      const { toggleProductAvailability } = require("../lib/product-logic");
      expect(toggleProductAvailability("Tersedia")).toBe("Tidak Tersedia");
      expect(toggleProductAvailability("Tidak Tersedia")).toBe("Tersedia");
    });

    it("memastikan kasir hanya dapat mengubah atribut status, tanpa mengubah harga atau atribut lain", () => {
      const originalProduct: PosProduct = {
        id: "prod-gayo",
        name: "V60 Aceh Gayo",
        price: 28000,
        category_id: "cat-coffee",
        status: "Tersedia",
        is_active: true,
      };

      const { toggleProductAvailability } = require("../lib/product-logic");
      const nextStatus = toggleProductAvailability(originalProduct.status as any);

      const updatedProduct = {
        ...originalProduct,
        status: nextStatus,
      };

      expect(updatedProduct.status).toBe("Tidak Tersedia");
      expect(updatedProduct.price).toBe(originalProduct.price);
      expect(updatedProduct.name).toBe(originalProduct.name);
      expect(updatedProduct.id).toBe(originalProduct.id);
    });
  });

  // ============================================================================
  // BAGIAN 3.7: SIKLUS STATUS ORDER & ROLE GUARD (PRD Section 17)
  // ============================================================================
  describe("3.7 Siklus Status Order & Role Guard (Order Status)", () => {
    const { canTransitionOrderStatus } = require("../lib/order-logic");

    it("mengizinkan alur normal: Pending -> Processing -> Ready -> Completed bagi Kasir & Admin", () => {
      expect(canTransitionOrderStatus("Pending", "Processing", "Kasir").allowed).toBe(true);
      expect(canTransitionOrderStatus("Processing", "Ready", "Kasir").allowed).toBe(true);
      expect(canTransitionOrderStatus("Ready", "Completed", "Kasir").allowed).toBe(true);
      expect(canTransitionOrderStatus("Processing", "Completed", "Admin").allowed).toBe(true);
    });

    it("menolak jika Customer mencoba mengubah status pesanan", () => {
      const result = canTransitionOrderStatus("Processing", "Ready", "Customer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Customer tidak memiliki izin");
    });

    it("menolak perubahan status jika pesanan sudah Completed", () => {
      const result = canTransitionOrderStatus("Completed", "Processing", "Kasir");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("sudah Completed");
    });

    it("menolak perubahan status jika pesanan sudah Cancelled", () => {
      const result = canTransitionOrderStatus("Cancelled", "Processing", "Kasir");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("sudah dibatalkan");
    });
  });

  // ============================================================================
  // BAGIAN 3.8: ATURAN PEMBATALAN & REFUND PESANAN (PRD Section 17.1)
  // ============================================================================
  describe("3.8 Aturan Pembatalan & Refund Pesanan (Order Cancellation & Refund)", () => {
    const {
      canCancelOrder,
      validateCancellationPayload,
    } = require("../lib/order-logic");

    it("mengizinkan pembatalan untuk status Pending, Processing, atau Ready", () => {
      expect(canCancelOrder({ order_status: "Pending" }, "Kasir").canCancel).toBe(true);
      expect(canCancelOrder({ order_status: "Processing" }, "Kasir").canCancel).toBe(true);
      expect(canCancelOrder({ order_status: "Ready" }, "Admin").canCancel).toBe(true);
    });

    it("menolak pembatalan untuk pesanan yang sudah Completed", () => {
      const result = canCancelOrder({ order_status: "Completed" }, "Kasir");
      expect(result.canCancel).toBe(false);
      expect(result.error).toContain("sudah Completed tidak dapat dibatalkan");
    });

    it("menolak pembatalan yang dilakukan oleh role Customer", () => {
      const result = canCancelOrder({ order_status: "Processing" }, "Customer");
      expect(result.canCancel).toBe(false);
      expect(result.error).toContain("Hanya Admin dan Kasir");
    });

    it("memvalidasi alasan pembatalan (wajib diisi minimal 3 karakter)", () => {
      expect(validateCancellationPayload("").isValid).toBe(false);
      expect(validateCancellationPayload("  ").isValid).toBe(false);
      expect(validateCancellationPayload("ab").isValid).toBe(false);
      expect(validateCancellationPayload("Pelanggan salah pesan").isValid).toBe(true);
    });
  });

  // ============================================================================
  // BAGIAN 3.9: PEMFILTERAN RIWAYAT PESANAN KASIR (PRD Section 19)
  // ============================================================================
  describe("3.9 Pemfilteran & Tampilan Riwayat Transaksi Kasir", () => {
    const {
      filterOrderHistory,
      getOrderStatusBadgeTone,
    } = require("../lib/order-logic");

    const mockOrders = [
      {
        id: "ord-1",
        order_number: "ORD-20261024-0001",
        customer_name: "Budi Santoso",
        total_amount: 50000,
        payment_method: "Tunai",
        payment_status: "Lunas",
        order_status: "Completed",
        created_at: "2026-10-24T10:00:00Z",
      },
      {
        id: "ord-2",
        order_number: "ORD-20261024-0002",
        customer_name: "Siti Rahma",
        total_amount: 32000,
        payment_method: "QRIS",
        payment_status: "Lunas",
        order_status: "Processing",
        created_at: "2026-10-24T11:00:00Z",
      },
      {
        id: "ord-3",
        order_number: "ORD-20261020-0003",
        customer_name: "Andi Wijaya",
        total_amount: 45000,
        payment_method: "Tunai",
        payment_status: "Refunded",
        order_status: "Cancelled",
        created_at: "2026-10-20T08:00:00Z",
      },
    ];

    it("memfilter riwayat berdasarkan status pesanan", () => {
      const processingOnly = filterOrderHistory(mockOrders, {
        statusFilter: "Processing",
      });
      expect(processingOnly).toHaveLength(1);
      expect(processingOnly[0].order_number).toBe("ORD-20261024-0002");
    });

    it("memfilter riwayat berdasarkan pencarian teks (nomor order atau nama pelanggan)", () => {
      const searchByName = filterOrderHistory(mockOrders, {
        searchQuery: "siti",
      });
      expect(searchByName).toHaveLength(1);
      expect(searchByName[0].customer_name).toBe("Siti Rahma");

      const searchByNumber = filterOrderHistory(mockOrders, {
        searchQuery: "0003",
      });
      expect(searchByNumber).toHaveLength(1);
      expect(searchByNumber[0].id).toBe("ord-3");
    });

    it("memberikan tone badge yang tepat untuk setiap status", () => {
      expect(getOrderStatusBadgeTone("Pending")).toBe("warning");
      expect(getOrderStatusBadgeTone("Processing")).toBe("accent");
      expect(getOrderStatusBadgeTone("Completed")).toBe("success");
      expect(getOrderStatusBadgeTone("Cancelled")).toBe("danger");
    });
  });
});


