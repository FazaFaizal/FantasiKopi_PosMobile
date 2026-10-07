import {
  validateCategoryInput,
  canDeleteCategory,
  toggleCategoryStatus,
  filterCategories,
  FilterableCategory,
} from "../lib/category-logic";
import {
  validateProductInput,
  toggleProductAvailability,
  filterProducts,
  FilterableProduct,
} from "../lib/product-logic";
import {
  computeStockStatus,
  calculateStockMovement,
  validateMovementNotes,
  validateInventoryItemInput,
  canUserDeleteInventoryItem,
} from "../lib/inventory-logic";
import { formatRupiah, formatStock } from "../lib/formatters";

describe("Iterasi 2 - Manajemen Produk, Kategori & Bahan Baku (Product & Inventory Management)", () => {
  // ============================================================================
  // BAGIAN 2.1: MANAJEMEN KATEGORI (CATEGORY MANAGEMENT)
  // ============================================================================
  describe("2.1 Manajemen Kategori Menu", () => {
    describe("Validasi Input Kategori (validateCategoryInput)", () => {
      it("menerima nama kategori yang valid", () => {
        expect(validateCategoryInput("Makanan")).toEqual({ isValid: true });
        expect(validateCategoryInput("Minuman Dingin")).toEqual({
          isValid: true,
        });
      });

      it("menolak nama kategori yang kosong atau hanya spasi", () => {
        const emptyResult = validateCategoryInput("");
        expect(emptyResult.isValid).toBe(false);
        expect(emptyResult.error).toBe("Nama kategori wajib diisi");

        const spaceResult = validateCategoryInput("   ");
        expect(spaceResult.isValid).toBe(false);
        expect(spaceResult.error).toBe("Nama kategori wajib diisi");
      });
    });

    describe("Proteksi Penghapusan Kategori (canDeleteCategory - PRD Section 9)", () => {
      it("melarang penghapusan jika masih ada produk terhubung (> 0)", () => {
        const result = canDeleteCategory(5);
        expect(result.canDelete).toBe(false);
        expect(result.reason).toContain(
          "Kategori masih memiliki 5 produk yang terhubung",
        );
      });

      it("melarang penghapusan meski hanya 1 produk terhubung", () => {
        const result = canDeleteCategory(1);
        expect(result.canDelete).toBe(false);
        expect(result.reason).toContain("1 produk");
      });

      it("mengizinkan penghapusan jika tidak ada produk terhubung (0 produk)", () => {
        const result = canDeleteCategory(0);
        expect(result.canDelete).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("menangani nilai negatif atau invalid secara aman", () => {
        // @ts-expect-error test invalid string coercion
        expect(canDeleteCategory("0").canDelete).toBe(true);
        // @ts-expect-error test undefined coercion
        expect(canDeleteCategory(undefined).canDelete).toBe(true);
      });
    });

    describe("Toggle Status Kategori (toggleCategoryStatus)", () => {
      it("mengubah status dari Aktif ke Nonaktif dan sebaliknya", () => {
        expect(toggleCategoryStatus("Aktif")).toBe("Nonaktif");
        expect(toggleCategoryStatus("Nonaktif")).toBe("Aktif");
      });
    });

    describe("Filter & Pencarian Kategori (filterCategories)", () => {
      const mockCategories: FilterableCategory[] = [
        {
          id: "1",
          name: "Makanan Berat",
          description: "Nasi goreng dan mie",
          status: "Aktif",
        },
        {
          id: "2",
          name: "Minuman Kopi",
          description: "Espresso dan latte",
          status: "Aktif",
        },
        {
          id: "3",
          name: "Minuman Segar",
          description: "Jus dan es teh",
          status: "Nonaktif",
        },
        {
          id: "4",
          name: "Snack & Cemilan",
          description: null,
          status: "Aktif",
        },
      ];

      it("mengembalikan semua kategori saat query kosong dan status Semua", () => {
        const result = filterCategories(mockCategories, "", "Semua");
        expect(result).toHaveLength(4);
      });

      it("memfilter kategori berdasarkan status", () => {
        const aktif = filterCategories(mockCategories, "", "Aktif");
        expect(aktif).toHaveLength(3);
        expect(aktif.every((c) => c.status === "Aktif")).toBe(true);

        const nonaktif = filterCategories(mockCategories, "", "Nonaktif");
        expect(nonaktif).toHaveLength(1);
        expect(nonaktif[0].name).toBe("Minuman Segar");
      });

      it("mencari kategori berdasarkan nama dan deskripsi secara case-insensitive", () => {
        expect(filterCategories(mockCategories, "kopi")).toHaveLength(1);
        expect(filterCategories(mockCategories, "goreng")).toHaveLength(1);
        expect(filterCategories(mockCategories, "cemilan")).toHaveLength(1);
      });

      it("mengombinasikan pencarian dengan filter status", () => {
        const result = filterCategories(mockCategories, "minuman", "Aktif");
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Minuman Kopi");
      });
    });
  });

  // ============================================================================
  // BAGIAN 2.2: MANAJEMEN PRODUK (PRODUCT MANAGEMENT)
  // ============================================================================
  describe("2.2 Manajemen Katalog Produk", () => {
    describe("Validasi Form Input Produk (validateProductInput)", () => {
      it("menerima produk dengan data lengkap dan harga valid", () => {
        const res = validateProductInput(
          "Kopi Susu Gula Aren",
          "cat-123",
          24000,
        );
        expect(res.isValid).toBe(true);
        expect(res.errors).toEqual({});
      });

      it("menerima produk dengan harga 0 (misal: menu promosi/gratis)", () => {
        const res = validateProductInput("Air Mineral Hangat", "cat-123", 0);
        expect(res.isValid).toBe(true);
      });

      it("menolak jika nama produk kosong", () => {
        const res = validateProductInput("", "cat-123", 20000);
        expect(res.isValid).toBe(false);
        expect(res.errors.name).toBe("Nama produk wajib diisi");
      });

      it("menolak jika kategori belum dipilih", () => {
        const res = validateProductInput("Americano", null, 20000);
        expect(res.isValid).toBe(false);
        expect(res.errors.categoryId).toBe("Kategori produk wajib dipilih");
      });

      it("menolak jika harga bernilai negatif (PRD Section 10.2: price >= 0)", () => {
        const res = validateProductInput("Caffe Latte", "cat-123", -5000);
        expect(res.isValid).toBe(false);
        expect(res.errors.price).toBe(
          "Harga produk tidak boleh bernilai negatif",
        );
      });

      it("menolak jika harga bukan berupa angka", () => {
        const res = validateProductInput("V60 Gayo", "cat-123", "gratis");
        expect(res.isValid).toBe(false);
        expect(res.errors.price).toBe("Harga produk harus berupa angka");
      });
    });

    describe("Toggle Status Ketersediaan Manual", () => {
      it("mengubah status antara Tersedia dan Tidak Tersedia", () => {
        expect(toggleProductAvailability("Tersedia")).toBe("Tidak Tersedia");
        expect(toggleProductAvailability("Tidak Tersedia")).toBe("Tersedia");
      });
    });

    describe("Filter & Pencarian Produk (filterProducts)", () => {
      const sampleProducts: FilterableProduct[] = [
        {
          id: "p-1",
          name: "Kopi Susu Gula Aren",
          description: "Espresso blend dan gula aren",
          category_id: "cat-espresso",
          status: "Tersedia",
          is_active: true,
        },
        {
          id: "p-2",
          name: "Americano",
          description: "Double shot espresso dan air mineral",
          category_id: "cat-espresso",
          status: "Tersedia",
          is_active: true,
        },
        {
          id: "p-3",
          name: "Matcha Latte",
          description: "Matcha Uji Jepang asli",
          category_id: "cat-noncoffee",
          status: "Tidak Tersedia",
          is_active: true,
        },
        {
          id: "p-4",
          name: "Produk Terhapus",
          description: "Menu arsip lama",
          category_id: "cat-espresso",
          status: "Tersedia",
          is_active: false,
        },
      ];

      it("hanya menampilkan produk yang aktif (is_active = true)", () => {
        const filtered = filterProducts(sampleProducts, "");
        expect(filtered.find((p) => p.id === "p-4")).toBeUndefined();
        expect(filtered.length).toBe(3);
      });

      it("memfilter produk berdasarkan kata kunci pencarian (nama & deskripsi)", () => {
        const searchKopi = filterProducts(sampleProducts, "kopi");
        expect(searchKopi.length).toBe(1);
        expect(searchKopi[0].name).toBe("Kopi Susu Gula Aren");

        const searchMatcha = filterProducts(sampleProducts, "matcha");
        expect(searchMatcha.length).toBe(1);
        expect(searchMatcha[0].name).toBe("Matcha Latte");
      });

      it("memfilter produk berdasarkan kategori yang dipilih", () => {
        const espressoOnly = filterProducts(sampleProducts, "", "cat-espresso");
        expect(espressoOnly.length).toBe(2);
        expect(
          espressoOnly.every((p) => p.category_id === "cat-espresso"),
        ).toBe(true);
      });

      it("memfilter produk berdasarkan status ketersediaan", () => {
        const availableOnly = filterProducts(
          sampleProducts,
          "",
          "all",
          "Tersedia",
        );
        expect(availableOnly.length).toBe(2);

        const outOfStockOnly = filterProducts(
          sampleProducts,
          "",
          "all",
          "Tidak Tersedia",
        );
        expect(outOfStockOnly.length).toBe(1);
        expect(outOfStockOnly[0].name).toBe("Matcha Latte");
      });
    });

    describe("Format Mata Uang Rupiah (formatRupiah)", () => {
      it("memformat nominal rupiah standar dengan benar", () => {
        expect(formatRupiah(24000)).toContain("24.000");
        expect(formatRupiah(200000)).toContain("200.000");
      });

      it("memformat nominal 0 sebagai Rp 0", () => {
        expect(formatRupiah(0)).toContain("0");
      });

      it("menangani input invalid secara aman tanpa throw error", () => {
        expect(formatRupiah(NaN)).toBe("Rp 0");
        expect(formatRupiah(null as any)).toBe("Rp 0");
      });
    });
  });

  // ============================================================================
  // BAGIAN 2.3: MANAJEMEN INVENTARIS & MUTASI STOK (INVENTORY)
  // ============================================================================
  describe("2.3 Manajemen Inventaris Bahan Baku & Mutasi Stok", () => {
    describe("Kalkulasi Status Stok Bahan Baku (computeStockStatus)", () => {
      it('menghasilkan status "Out of Stock" (danger) jika stok 0 atau kurang', () => {
        expect(computeStockStatus(0, 500)).toEqual({
          label: "Out of Stock",
          tone: "danger",
        });
        expect(computeStockStatus(-5, 500)).toEqual({
          label: "Out of Stock",
          tone: "danger",
        });
      });

      it('menghasilkan status "Low Stock" (warning) jika stok di bawah atau sama dengan minimum', () => {
        expect(computeStockStatus(500, 500)).toEqual({
          label: "Low Stock",
          tone: "warning",
        });
        expect(computeStockStatus(250, 500)).toEqual({
          label: "Low Stock",
          tone: "warning",
        });
      });

      it('menghasilkan status "Aman" (success) jika stok di atas batas minimum', () => {
        expect(computeStockStatus(501, 500)).toEqual({
          label: "Aman",
          tone: "success",
        });
        expect(computeStockStatus(2500, 1000)).toEqual({
          label: "Aman",
          tone: "success",
        });
      });

      it("mendukung nilai pecahan desimal (misal: 0.5 kg)", () => {
        expect(computeStockStatus(0.2, 0.5)).toEqual({
          label: "Low Stock",
          tone: "warning",
        });
        expect(computeStockStatus(1.5, 0.5)).toEqual({
          label: "Aman",
          tone: "success",
        });
      });
    });

    describe("Kalkulasi Pergerakan Stok (calculateStockMovement)", () => {
      it("Stock In: menambah stok saat barang masuk berhasil", () => {
        const res = calculateStockMovement("Stock In", 1000, 500);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(1500);
      });

      it("Stock In: menolak jumlah pergerakan 0 atau negatif", () => {
        const resZero = calculateStockMovement("Stock In", 1000, 0);
        expect(resZero.isValid).toBe(false);
        expect(resZero.error).toContain("lebih besar dari 0");

        const resNeg = calculateStockMovement("Stock In", 1000, -100);
        expect(resNeg.isValid).toBe(false);
      });

      it("Stock Out: mengurangi stok saat pemakaian bahan", () => {
        const res = calculateStockMovement("Stock Out", 1000, 300);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(700);
      });

      it("Stock Out: menolak jika jumlah keluar melebihi stok yang tersedia", () => {
        const res = calculateStockMovement("Stock Out", 500, 600);
        expect(res.isValid).toBe(false);
        expect(res.stockAfter).toBe(500);
        expect(res.error).toContain("Stok tidak mencukupi");
      });

      it("Stock Adjustment: memperbarui stok ke nilai aktual hasil stock opname fisik", () => {
        const resKurang = calculateStockMovement("Stock Adjustment", 1000, 850);
        expect(resKurang.isValid).toBe(true);
        expect(resKurang.stockAfter).toBe(850);

        const resLebih = calculateStockMovement(
          "Stock Adjustment",
          1000,
          1200,
        );
        expect(resLebih.isValid).toBe(true);
        expect(resLebih.stockAfter).toBe(1200);
      });
    });

    describe("Validasi Keterangan Mutasi Stok (validateMovementNotes)", () => {
      it("memperbolehkan keterangan kosong untuk Stock In", () => {
        expect(validateMovementNotes("Stock In", "").isValid).toBe(true);
      });

      it("mewajibkan keterangan untuk Stock Out (pemakaian/rusak/expired)", () => {
        const resEmpty = validateMovementNotes("Stock Out", "");
        expect(resEmpty.isValid).toBe(false);
        expect(resEmpty.error).toContain("Keterangan wajib diisi");

        const resValid = validateMovementNotes(
          "Stock Out",
          "Pemakaian barista shift pagi",
        );
        expect(resValid.isValid).toBe(true);
      });

      it("mewajibkan keterangan untuk Stock Adjustment (opname)", () => {
        const resEmpty = validateMovementNotes("Stock Adjustment", "");
        expect(resEmpty.isValid).toBe(false);
        expect(resEmpty.error).toContain("Keterangan wajib diisi");

        const resValid = validateMovementNotes(
          "Stock Adjustment",
          "Selisih timbangan akhir bulan",
        );
        expect(resValid.isValid).toBe(true);
      });
    });

    describe("Validasi Input Bahan Baku (validateInventoryItemInput)", () => {
      it("menerima data bahan baku lengkap dan valid", () => {
        const res = validateInventoryItemInput(
          "Biji Kopi Arabika Gayo",
          "gram",
          1000,
        );
        expect(res.isValid).toBe(true);
        expect(res.errors).toEqual({});
      });

      it("menolak jika nama bahan baku atau satuan unit kosong", () => {
        expect(validateInventoryItemInput("", "gram", 1000).isValid).toBe(
          false,
        );
        expect(
          validateInventoryItemInput("Gula Aren", "  ", 1000).isValid,
        ).toBe(false);
      });

      it("menolak batas minimum stock negatif atau bukan angka", () => {
        expect(
          validateInventoryItemInput("Susu Segar", "ml", -50).isValid,
        ).toBe(false);
        expect(
          validateInventoryItemInput("Susu Segar", "ml", "bukan-angka").isValid,
        ).toBe(false);
      });
    });

    describe("Hak Akses Role Kasir vs Admin pada Inventaris (PRD Section 11.3)", () => {
      it("mengizinkan Admin menghapus bahan baku (soft delete)", () => {
        expect(canUserDeleteInventoryItem("Admin")).toBe(true);
      });

      it("MELARANG Kasir dan Customer menghapus bahan baku demi integritas data", () => {
        expect(canUserDeleteInventoryItem("Kasir")).toBe(false);
        expect(canUserDeleteInventoryItem("Customer")).toBe(false);
      });
    });

    describe("Format Tampilan Stok (formatStock)", () => {
      it("memformat angka stok dengan separator ribuan dan unit satuan", () => {
        expect(formatStock(2500, "gram")).toContain("2.500 gram");
        expect(formatStock(180, "pcs")).toContain("180 pcs");
      });
    });
  });
});

