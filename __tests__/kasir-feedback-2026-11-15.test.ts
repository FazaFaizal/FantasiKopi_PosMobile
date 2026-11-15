/**
 * Temuan pengujian perangkat 15 November 2026:
 * modal penyelesaian pesanan terlalu kecil, footer keranjang tablet, form tertutup keyboard,
 * dan QR yang terpotong di layar bayar QRIS.
 */
declare const require: (id: 'fs') => { readFileSync(file: string, encoding: 'utf8'): string };
declare const __dirname: string;
const fs = require('fs');
const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');

describe('Modal penyelesaian pesanan', () => {
  it('struk POS tidak lagi dibatasi tinggi 288px dan teksnya 14px ke atas', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).not.toContain('max-h-72');
    expect(pos).toContain("maxWidth: isTablet ? 560 : 460, maxHeight: '92%'");
    expect(pos).toContain('function ReceiptRow');
  });

  it('isi detail pesanan kasir tidak menyusut menjadi nol', () => {
    const src = read('components/OrdersScreen.tsx');
    expect(src).not.toContain('<ScrollView className="p-4 flex-1"');
    expect(src).toContain('style={{ flexGrow: 0, flexShrink: 1 }}');
    expect(src).toContain('maxWidth: isTablet ? 640 : undefined');
  });

  it('tombol Tandai Siap dan Selesaikan memakai komponen Button yang sama', () => {
    const src = read('components/OrdersScreen.tsx');
    expect(src).not.toContain('className="h-11 bg-success rounded-button');
    expect(src).toContain('variant="success"');
  });
});

describe('Modal detail riwayat transaksi tidak terlihat dobel', () => {
  it('status tidak ditulis dua kali, tanpa kotak bertumpuk, animasi fade', () => {
    const src = read('components/OrdersScreen.tsx');
    expect(src).not.toContain('Status Pesanan:');
    expect(src).not.toContain('bg-background rounded-card p-2 border border-line');
    expect(src).not.toContain('bg-background rounded-card p-3 border border-line mb-4');
    const detail = src.slice(src.indexOf('Modal 1: Detail Pesanan Kasir'));
    expect(detail).toMatch(/visible=\{Boolean\(selectedOrder\)\}\s+transparent=\{true\}\s+animationType="fade"/);
  });
});

describe('Footer keranjang POS', () => {
  it('metode bayar bersegmen, pecahan uang membungkus, panel tablet melebar', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('PAYMENT_OPTIONS.map');
    expect(pos).toContain('flex-row flex-wrap gap-2 mt-2');
    expect(pos).not.toContain('w-[360px]');
    expect(pos).toContain('Math.min(440, Math.max(360, Math.round(width * 0.38)))');
  });
});

describe('Foto produk di kartu POS', () => {
  it('POS mengambil kolom image dan menampilkan foto kecil dengan ikon pengganti', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain(".select('id, name, price, category_id, status, is_active, image')");
    expect(pos).toContain('<ProductThumb');
    expect(pos).toContain('name="image-outline"');
    expect(pos).toContain('setFailedImages');
  });

  it('HP memakai daftar satu kolom; tablet grid 3 kolom dengan foto sejajar sakelar', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain("numColumns={isTablet ? 3 : 1}");
    expect(pos).toContain('Baris atas: foto di kiri, sakelar ketersediaan di kanan');
    expect(pos).toContain('di keranjang</Text>');
    expect(pos).not.toContain('>Kosong<');
  });
});

describe('Ubah ketersediaan produk dengan konfirmasi', () => {
  it('pil punya ikon tukar dan petunjuk aksi', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('name="swap-horizontal"');
    expect(pos).toContain("'Ketuk untuk menandai habis'");
  });

  it('mengetuk pil membuka modal konfirmasi; status berubah setelah dikonfirmasi', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('const handleToggleProductStatus = (product: PosProduct) => setStatusConfirm(product);');
    expect(pos).toContain('Tandai menu habis?');
    expect(pos).toContain('onPress={handleConfirmProductStatus}');
    expect(pos).not.toContain('UndoSnackbar');
  });
});

describe('Uang diterima di langkah bayar', () => {
  it('footer keranjang tanpa input uang; Bayar (Tunai) membuka modal terima tunai', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain("onPress={paymentMethod === 'Tunai' ? () => setCashModalVisible(true) : handleProcessOrder}");
    expect(pos).toContain('Terima pembayaran tunai');
    expect(pos).toContain("title={submittingOrder ? 'Memproses...' : 'Konfirmasi Bayar'}");
    expect(pos).toContain('disabled={submittingOrder || !cashCalculation.isValid}');
  });

  it('modal tunai dirender di dalam modal keranjang di HP (iOS tidak bisa dua modal sejajar)', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).toContain('{isTablet ? cashModal : null}');
    expect(pos).toContain('{!isTablet ? cashModal : null}');
  });
});

describe('Kartu POS & bagian atas keranjang', () => {
  it('seluruh kartu bisa diketuk untuk menambah ke keranjang', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect((pos.match(/\{\.\.\.addToCartProps\}/g) || []).length).toBe(2);
    expect(pos).toContain("name: 'toggleAvailability'");
  });

  it('bagian atas keranjang ringkas: tipe pesanan dan meja/nama dalam satu baris', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).not.toContain('>Tipe Pesanan<');
    expect(pos).not.toContain('Pelanggan / Nomor Meja</Text>');
    expect(pos).toContain('Tipe pesanan & meja/nama pelanggan dalam satu baris');
  });
});

describe('Catatan item di keranjang', () => {
  it('kolom catatan hanya tampil bila ada; ketuk nama/harga item untuk menambah', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).not.toContain('Tambah catatan (less sweet, dll)');
    expect(pos).toContain('{item.notes ? (');
    expect(pos).toContain('Ketuk untuk menambah catatan');
  });
});

describe('Keyboard', () => {
  it('POS menggeser konten di Android juga, bukan hanya iOS', () => {
    const pos = read('app/(kasir)/pos.tsx');
    expect(pos).not.toContain("Platform.OS === 'ios' ? 'padding' : undefined");
    expect((pos.match(/behavior="padding"/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('tidak ada lagi KeyboardAvoidingView yang mati di Android', () => {
    for (const f of [
      'app/(auth)/login.tsx',
      'app/(auth)/register.tsx',
      'app/(customer)/product.tsx',
      'components/DailyCashScreen.tsx',
      'components/OrdersScreen.tsx',
      'components/ProfileScreen.tsx',
    ]) {
      expect(read(f)).not.toMatch(/\? ['"]padding['"] : undefined/);
    }
  });
});

describe('Teks input terpotong di HP', () => {
  it('Input tidak memakai text-base (lineHeight memotong huruf di Android)', () => {
    const src = read('components/Input.tsx');
    expect(src).not.toMatch(/rounded-input px-4 py-3 font-body text-base/);
    expect(src).toContain('includeFontPadding: false');
    expect(src).toContain('props.style');
  });

  it('placeholder login cukup pendek untuk kolom dengan ikon di HP kecil', () => {
    const login = read('app/(auth)/login.tsx');
    expect(login).not.toContain('Masukkan password akun');
    expect(login).not.toContain('nama@fantasicoffee.com');
  });
});

describe('Layar Bayar QRIS', () => {
  it('ukuran QR mengikuti lebar layar dan back Android ke Pesanan Saya', () => {
    const src = read('app/(customer)/payment.tsx');
    expect(src).not.toContain('width: 256, height: 256');
    expect(src).toContain('style={{ width: qrSize, height: qrSize }}');
    expect(src).toContain("BackHandler.addEventListener('hardwareBackPress'");
  });
});
