import {
  computeStockStatus,
  calculateStockMovement,
  validateMovementNotes,
  validateInventoryItemInput,
  canUserDeleteInventoryItem,
} from "../lib/inventory-logic";
import { formatStock } from "../lib/formatters";

describe("Iterasi 2 - Manajemen Bahan Baku & Mutasi Stok (Inventory)", () => {
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

    it('menghasilkan status "Low Stock" (warning) jika stok di bawah atau sama dengan batas minimum', () => {
      expect(computeStockStatus(500, 500)).toEqual({
        label: "Low Stock",
        tone: "warning",
      });
      expect(computeStockStatus(250, 500)).toEqual({
        label: "Low Stock",
        tone: "warning",
      });
      expect(computeStockStatus(1, 100)).toEqual({
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

    it("mendukung nilai desimal / floating point (misal: 0.5 kg)", () => {
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
    describe("Stock In (Barang Masuk / Pembelian)", () => {
      it("menambah stok saat barang masuk berhasil", () => {
        const res = calculateStockMovement("Stock In", 1000, 500);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(1500);
      });

      it("menolak jumlah pergerakan 0 atau negatif", () => {
        const resZero = calculateStockMovement("Stock In", 1000, 0);
        expect(resZero.isValid).toBe(false);
        expect(resZero.error).toContain("lebih besar dari 0");

        const resNeg = calculateStockMovement("Stock In", 1000, -100);
        expect(resNeg.isValid).toBe(false);
      });
    });

    describe("Stock Out (Barang Keluar / Pemakaian / Rusak)", () => {
      it("mengurangi stok saat pemakaian bahan", () => {
        const res = calculateStockMovement("Stock Out", 1000, 300);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(700);
      });

      it("mengizinkan stok keluar hingga tepat 0 (habis)", () => {
        const res = calculateStockMovement("Stock Out", 500, 500);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(0);
      });

      it("menolak stok keluar jika melebihi stok yang tersedia", () => {
        const res = calculateStockMovement("Stock Out", 500, 600);
        expect(res.isValid).toBe(false);
        expect(res.stockAfter).toBe(500);
        expect(res.error).toContain("Stok tidak mencukupi");
      });
    });

    describe("Stock Adjustment (Opname Fisik)", () => {
      it("memperbarui stok langsung ke nilai aktual hasil hitung fisik", () => {
        const res = calculateStockMovement("Stock Adjustment", 1000, 850);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(850);
      });

      it("mengizinkan penyesuaian jika stok opname lebih besar (selisih lebih)", () => {
        const res = calculateStockMovement("Stock Adjustment", 1000, 1200);
        expect(res.isValid).toBe(true);
        expect(res.stockAfter).toBe(1200);
      });
    });
  });

  describe("Validasi Keterangan Mutasi Stok (validateMovementNotes)", () => {
    it("memperbolehkan keterangan kosong untuk Stock In", () => {
      expect(validateMovementNotes("Stock In", "").isValid).toBe(true);
      expect(
        validateMovementNotes("Stock In", "Restock supplier").isValid,
      ).toBe(true);
    });

    it("mewajibkan keterangan untuk Stock Out (pemakaian/rusak/expired)", () => {
      const resEmpty = validateMovementNotes("Stock Out", "");
      expect(resEmpty.isValid).toBe(false);
      expect(resEmpty.error).toContain("Keterangan wajib diisi");

      const resWhitespace = validateMovementNotes("Stock Out", "   ");
      expect(resWhitespace.isValid).toBe(false);

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

    it("menolak jika nama bahan baku kosong", () => {
      const res = validateInventoryItemInput("", "gram", 1000);
      expect(res.isValid).toBe(false);
      expect(res.errors.name).toBe("Nama bahan baku wajib diisi");
    });

    it("menolak jika satuan unit kosong", () => {
      const res = validateInventoryItemInput("Gula Aren", "  ", 1000);
      expect(res.isValid).toBe(false);
      expect(res.errors.unit).toBe("Satuan unit wajib diisi");
    });

    it("menolak jika batas minimum stock bernilai negatif atau bukan angka", () => {
      const resNeg = validateInventoryItemInput("Susu Segar", "ml", -50);
      expect(resNeg.isValid).toBe(false);
      expect(resNeg.errors.minStock).toContain("angka valid");

      const resNaN = validateInventoryItemInput(
        "Susu Segar",
        "ml",
        "bukan-angka",
      );
      expect(resNaN.isValid).toBe(false);
      expect(resNaN.errors.minStock).toContain("angka valid");
    });
  });

  describe("Hak Akses Role Kasir vs Admin (PRD Section 11.3)", () => {
    it("mengizinkan Admin menghapus bahan baku (soft delete)", () => {
      expect(canUserDeleteInventoryItem("Admin")).toBe(true);
    });

    it("MELARANG Kasir menghapus bahan baku demi integritas data", () => {
      expect(canUserDeleteInventoryItem("Kasir")).toBe(false);
    });

    it("MELARANG Customer menghapus bahan baku", () => {
      expect(canUserDeleteInventoryItem("Customer")).toBe(false);
    });
  });

  describe("Format Tampilan Stok (formatStock)", () => {
    it("memformat angka stok dengan separator ribuan dan unit", () => {
      expect(formatStock(2500, "gram")).toContain("2.500 gram");
      expect(formatStock(180, "pcs")).toContain("180 pcs");
    });
  });
});
