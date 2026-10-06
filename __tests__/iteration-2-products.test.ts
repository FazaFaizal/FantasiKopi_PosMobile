import {
  validateProductInput,
  toggleProductAvailability,
  filterProducts,
  FilterableProduct,
} from "../lib/product-logic";
import { formatRupiah } from "../lib/formatters";

describe("Iterasi 2 - Manajemen Katalog Produk (Product Management)", () => {
  describe("Validasi Form Input Produk", () => {
    it("menerima produk dengan data lengkap dan harga valid", () => {
      const res = validateProductInput("Kopi Susu Gula Aren", "cat-123", 24000);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it("menerima produk dengan harga 0 (misal: menu gratis/promosi)", () => {
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

  describe("Toggle Status Ketersediaan Manual (Tersedia / Tidak Tersedia)", () => {
    it("mengubah status dari Tersedia ke Tidak Tersedia", () => {
      expect(toggleProductAvailability("Tersedia")).toBe("Tidak Tersedia");
    });

    it("mengubah status dari Tidak Tersedia kembali ke Tersedia", () => {
      expect(toggleProductAvailability("Tidak Tersedia")).toBe("Tersedia");
    });
  });

  describe("Filter & Pencarian Produk", () => {
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
      expect(espressoOnly.every((p) => p.category_id === "cat-espresso")).toBe(
        true,
      );
    });

    it("memfilter produk berdasarkan status ketersediaan", () => {
      const availableOnly = filterProducts(
        sampleProducts,
        "",
        "all",
        "Tersedia",
      );
      expect(availableOnly.length).toBe(2);
      expect(availableOnly.every((p) => p.status === "Tersedia")).toBe(true);

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
    it("memformat angka rupiah standar dengan benar", () => {
      expect(formatRupiah(24000)).toContain("24.000");
      expect(formatRupiah(200000)).toContain("200.000");
    });

    it("memformat nominal 0 sebagai Rp 0", () => {
      expect(formatRupiah(0)).toContain("0");
    });

    it("menangani input tidak valid secara aman", () => {
      expect(formatRupiah(NaN)).toBe("Rp 0");
      expect(formatRupiah(null as any)).toBe("Rp 0");
    });
  });
});
