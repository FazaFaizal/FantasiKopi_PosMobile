// UAT Iterasi 2: Product & Inventory (docs/uat-per-iterasi.md bagian 5).
// Tidak diuji di sini karena aturannya ada di database atau tampilan, bukan di lib/:
// I2-09, I2-20 s.d. I2-23, I2-25.
import {
  canDeactivateCategory,
  canDeleteCategory,
  filterCategories,
  toggleCategoryStatus,
  validateCategoryInput,
} from '../lib/category-logic';
import {
  buildPurchaseExpenseDescription,
  buildRecordStockInParams,
  buildStockMovementParams,
  computeStockStatus,
  parseRupiahInput,
  validateInventoryItemInput,
  validateStockInPurchase,
} from '../lib/inventory-logic';
import { filterProducts, toggleProductAvailability, validateProductInput } from '../lib/product-logic';

const stockOut = (quantityText: string, notes: string, currentStock: number) =>
  buildStockMovementParams({ inventoryId: 'inv-susu', type: 'Stock Out', quantityText, notes, currentStock });
const opname = (quantityText: string, notes: string, currentStock: number) =>
  buildStockMovementParams({ inventoryId: 'inv-susu', type: 'Stock Adjustment', quantityText, notes, currentStock });

const CATEGORIES = [
  { id: 'cat-a', name: 'Kategori Uji A', description: 'Kategori pengujian', status: 'Aktif' as const },
  { id: 'cat-b', name: 'Kategori Uji B', description: null, status: 'Aktif' as const },
  { id: 'cat-lama', name: 'Musiman', description: 'Menu uji coba', status: 'Nonaktif' as const },
];

const PRODUCTS = [
  { id: 'p1', name: 'Kopi Uji', description: 'Espresso dan susu', category_id: 'cat-a', status: 'Tersedia' as const, category: { name: 'Kategori Uji A' } },
  { id: 'p2', name: 'Teh Uji', description: null, category_id: 'cat-b', status: 'Tidak Tersedia' as const, category: { name: 'Kategori Uji B' } },
  { id: 'p3', name: 'Roti Uji', description: 'Mentega', category_id: 'cat-b', status: 'Tersedia' as const, category: null },
];
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe('I2-01 Tambah kategori', () => {
  test('nama kategori wajib diisi', () => {
    expect(validateCategoryInput('Kategori Uji A')).toEqual({ isValid: true });
    expect(validateCategoryInput('   ')).toEqual({ isValid: false, error: 'Nama kategori wajib diisi' });
  });

  test('kategori baru tampil di daftar Aktif dan bisa dicari', () => {
    expect(ids(filterCategories(CATEGORIES, '', 'Aktif'))).toEqual(['cat-a', 'cat-b']);
    expect(ids(filterCategories(CATEGORIES, 'uji b', 'Semua'))).toEqual(['cat-b']);
    expect(ids(filterCategories(CATEGORIES, 'pengujian'))).toEqual(['cat-a']);
  });
});

describe('I2-02 Tambah produk', () => {
  test('nama, kategori, dan harga yang benar diterima', () => {
    expect(validateProductInput('Kopi Uji', 'cat-a', '24000')).toEqual({ isValid: true, errors: {} });
  });

  test('nama kosong, tanpa kategori, dan harga kosong ditolak', () => {
    expect(validateProductInput(' ', null, '').errors).toEqual({
      name: 'Nama produk wajib diisi',
      categoryId: 'Kategori produk wajib dipilih',
      price: 'Harga harus berupa angka valid (>= 0)',
    });
  });
});

describe('I2-03 Ubah produk', () => {
  test('harga baru dan kategori lain diterima', () => {
    expect(validateProductInput('Kopi Uji', 'cat-b', '26000').isValid).toBe(true);
  });

  test.each(['-1000', 'dua puluh ribu'])('harga "%s" ditolak', (price) => {
    expect(validateProductInput('Kopi Uji', 'cat-b', price).errors.price).toBe('Harga harus berupa angka valid (>= 0)');
  });

  test('harga 0 diterima', () => {
    expect(validateProductInput('Air Putih', 'cat-b', '0').isValid).toBe(true);
  });
});

describe('I2-04 Ubah ketersediaan', () => {
  test('Admin mengubah Tersedia → Tidak Tersedia → Tersedia', () => {
    const habis = toggleProductAvailability('Tersedia');
    expect(habis).toBe('Tidak Tersedia');
    expect(toggleProductAvailability(habis)).toBe('Tersedia');
  });
});

describe('I2-05 Cari dan filter produk', () => {
  test('cari nama, deskripsi, atau nama kategori', () => {
    expect(ids(filterProducts(PRODUCTS, 'kopi'))).toEqual(['p1']);
    expect(ids(filterProducts(PRODUCTS, 'mentega'))).toEqual(['p3']);
    expect(ids(filterProducts(PRODUCTS, 'uji b'))).toEqual(['p2']);
  });

  test('filter kategori dan status', () => {
    expect(ids(filterProducts(PRODUCTS, '', 'cat-b'))).toEqual(['p2', 'p3']);
    expect(ids(filterProducts(PRODUCTS, '', 'Semua', 'Tersedia'))).toEqual(['p1', 'p3']);
    expect(ids(filterProducts(PRODUCTS, '', 'cat-b', 'Tersedia'))).toEqual(['p3']);
  });
});

describe('I2-06 Kategori dengan produk tidak bisa dinonaktifkan', () => {
  test('kategori yang masih berisi produk ditolak dengan pesan', () => {
    expect(canDeactivateCategory('Kategori Uji B', 1)).toEqual({
      allowed: false,
      reason:
        'Kategori "Kategori Uji B" masih dipakai 1 produk. Pindahkan produk tersebut ke kategori lain atau hapus produknya terlebih dahulu.',
    });
  });

  test('kategori kosong boleh dinonaktifkan', () => {
    expect(canDeactivateCategory('Kategori Uji A', 0)).toEqual({ allowed: true });
  });
});

describe('I2-07 Produk tidak bisa masuk kategori nonaktif', () => {
  test('Kategori Uji A yang kosong bisa dinonaktifkan', () => {
    expect(canDeactivateCategory('Kategori Uji A', 0)).toEqual({ allowed: true });
    expect(toggleCategoryStatus('Aktif')).toBe('Nonaktif');
    expect(toggleCategoryStatus('Nonaktif')).toBe('Aktif');
  });
});

describe('I2-08 Hapus kategori kosong', () => {
  test('kategori kosong boleh dihapus', () => {
    expect(canDeleteCategory(0)).toEqual({ canDelete: true });
  });

  test('kategori berisi produk tidak bisa dihapus', () => {
    expect(canDeleteCategory(3)).toEqual({
      canDelete: false,
      reason: 'Kategori masih memiliki 3 produk yang terhubung. Pindahkan atau hapus produk terlebih dahulu.',
    });
  });
});

describe('I2-10 Kasir hanya bisa ubah ketersediaan', () => {
  test('pil Tersedia ⇄ Habis berganti dua arah', () => {
    expect(toggleProductAvailability('Tersedia')).toBe('Tidak Tersedia');
    expect(toggleProductAvailability('Tidak Tersedia')).toBe('Tersedia');
  });
});

describe('I2-11 Tambah bahan baku', () => {
  test('nama "Susu Uji" dengan minimum stok 1000 diterima', () => {
    expect(validateInventoryItemInput(' Susu Uji ', '1000')).toEqual({
      isValid: true,
      errors: {},
      value: { name: 'Susu Uji', minStock: 1000 },
    });
  });

  test('bahan baru dengan stok 0 berstatus Out of Stock', () => {
    expect(computeStockStatus(0, 1000)).toEqual({ label: 'Out of Stock', tone: 'danger' });
  });

  test('nama kosong atau minimum stok tidak valid ditolak', () => {
    expect(validateInventoryItemInput('', '1000').errors.name).toBe('Nama bahan baku wajib diisi');
    expect(validateInventoryItemInput('Susu Uji', '-5').errors.minStock).toBe('Minimum stock harus berupa angka valid (>= 0)');
    expect(validateInventoryItemInput('Susu Uji', 'seribu').errors.minStock).toBe('Minimum stock harus berupa angka valid (>= 0)');
  });

  test('minimum stok kosong dianggap 0', () => {
    expect(validateInventoryItemInput('Susu Uji', '').value).toEqual({ name: 'Susu Uji', minStock: 0 });
  });
});

describe('I2-12 Kasir tambah dan ubah bahan', () => {
  test('Kasir memakai validasi yang sama dengan Admin', () => {
    expect(validateInventoryItemInput('Gula Uji', '500').isValid).toBe(true);
    expect(validateInventoryItemInput('Gula Uji', '500').value).toEqual({ name: 'Gula Uji', minStock: 500 });
  });
});

describe('I2-13 Stock In', () => {
  test('Stock In 1500 tanpa tanda pembelian', () => {
    const result = validateStockInPurchase({ quantityText: '1500', isPurchase: false, amountText: '' });
    expect(result.isValid).toBe(true);
    expect(result.value).toEqual({ quantity: 1500, purchaseAmount: null });
    expect(buildRecordStockInParams('inv-susu', result.value!, '  ')).toEqual({
      p_inventory_id: 'inv-susu',
      p_quantity: 1500,
      p_notes: null,
      p_purchase_amount: null,
    });
  });

  test('stok 1500 dengan minimum 1000 berstatus Aman', () => {
    expect(computeStockStatus(1500, 1000)).toEqual({ label: 'Aman', tone: 'success' });
  });

  test('jumlah desimal dengan koma diterima', () => {
    expect(validateStockInPurchase({ quantityText: '2,5', isPurchase: false, amountText: '' }).value?.quantity).toBe(2.5);
  });
});

describe('I2-14 Stock Out', () => {
  test('Stock Out 600 dengan keterangan menghasilkan parameter mutasi', () => {
    expect(stockOut('600', 'Pemakaian harian', 1500)).toEqual({
      isValid: true,
      errors: {},
      params: {
        p_inventory_id: 'inv-susu',
        p_movement_type: 'Stock Out',
        p_quantity: 600,
        p_notes: 'Pemakaian harian',
      },
    });
  });

  test('sisa 900 dengan minimum 1000 berstatus Low Stock', () => {
    expect(computeStockStatus(900, 1000)).toEqual({ label: 'Low Stock', tone: 'warning' });
  });
});

describe('I2-15 Stock Out melebihi stok', () => {
  test('Stock Out 5000 saat stok 900 ditolak', () => {
    const result = stockOut('5000', 'Pemakaian harian', 900);
    expect(result.isValid).toBe(false);
    expect(result.params).toBeUndefined();
    expect(result.errors.quantity).toBe('Stok tidak mencukupi. Stok saat ini: 900');
  });
});

describe('I2-16 Keterangan wajib', () => {
  test('Stock Out tanpa keterangan ditolak', () => {
    expect(stockOut('100', '   ', 900).errors.notes).toBe(
      'Keterangan wajib diisi untuk Stock Out (misal: Pemakaian harian, Rusak, dll)'
    );
  });

  test('Opname tanpa keterangan ditolak', () => {
    expect(opname('0', '', 900).errors.notes).toBe('Keterangan wajib diisi untuk Stock Opname');
  });
});

describe('I2-17 Stock Adjustment (opname)', () => {
  test('stok fisik 0 diterima sebagai stok baru', () => {
    expect(opname('0', 'Hasil hitung', 900).params).toEqual({
      p_inventory_id: 'inv-susu',
      p_movement_type: 'Stock Adjustment',
      p_quantity: 0,
      p_notes: 'Hasil hitung',
    });
    expect(computeStockStatus(0, 1000).label).toBe('Out of Stock');
  });

  test('opname dengan angka sama dengan stok sistem ditolak', () => {
    expect(opname('900', 'Hasil hitung', 900).errors.quantity).toBe(
      'Stok fisik sama dengan stok sistem, tidak ada yang perlu disesuaikan'
    );
  });

  test('stok fisik negatif ditolak', () => {
    expect(opname('-5', 'Hasil hitung', 900).errors.quantity).toBe('Stok fisik tidak boleh negatif');
  });
});

describe('I2-18 Jumlah harus > 0', () => {
  test.each(['0', '-10', 'abc', ''])('Stock In dengan jumlah "%s" ditolak', (quantityText) => {
    expect(validateStockInPurchase({ quantityText, isPurchase: false, amountText: '' }).errors.quantity).toBe(
      'Jumlah perubahan harus lebih besar dari 0'
    );
  });

  test('Stock Out dengan jumlah 0 atau negatif ditolak', () => {
    expect(stockOut('0', 'Pemakaian', 900).errors.quantity).toBe('Jumlah perubahan harus lebih besar dari 0');
    expect(stockOut('-3', 'Pemakaian', 900).errors.quantity).toBe('Jumlah perubahan harus lebih besar dari 0');
  });

  test('Stock Out tanpa angka ditolak', () => {
    expect(stockOut('', 'Pemakaian', 900).errors.quantity).toBe('Jumlah wajib diisi dengan angka');
  });
});

describe('I2-19 Status mengikuti minimum stok', () => {
  test('menurunkan minimum dari 1000 ke 500 mengubah Low Stock menjadi Aman tanpa mengubah stok', () => {
    expect(computeStockStatus(900, 1000).label).toBe('Low Stock');
    expect(computeStockStatus(900, 500).label).toBe('Aman');
  });

  test('stok tepat sama dengan minimum masih Low Stock', () => {
    expect(computeStockStatus(1000, 1000).label).toBe('Low Stock');
  });
});

describe('I2-24 Stock In sebagai pembelian', () => {
  test('total harga "Rp 90.000" tercatat sebagai 90000', () => {
    const result = validateStockInPurchase({ quantityText: '1000', isPurchase: true, amountText: 'Rp 90.000' });
    expect(result.value).toEqual({ quantity: 1000, purchaseAmount: 90000 });
    expect(buildRecordStockInParams('inv-susu', result.value!, '').p_purchase_amount).toBe(90000);
  });

  test('pembelian tanpa total harga ditolak', () => {
    expect(validateStockInPurchase({ quantityText: '1000', isPurchase: true, amountText: '' }).errors.amount).toBe(
      'Total harga pembelian wajib diisi dan lebih dari 0'
    );
  });

  test('deskripsi expense mengikuti format "Pembelian Susu Uji 1000 ml"', () => {
    expect(buildPurchaseExpenseDescription('Susu Uji', 1000, 'ml')).toBe('Pembelian Susu Uji 1000 ml');
  });

  test('input Rupiah bertitik dibaca sebagai angka', () => {
    expect(parseRupiahInput('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiahInput('')).toBe(0);
  });
});
