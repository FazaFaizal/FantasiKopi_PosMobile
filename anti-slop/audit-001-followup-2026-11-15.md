# Tindak lanjut audit antislop 001: perbaikan HIGH

- Tanggal: 2026-11-15
- Nomor yang disetujui: semua HIGH (1 sampai 15)
- Panduan tambahan: Quick Reference skill ui-ux-pro-max (touch target 44pt, accessibilityLabel/state, kontras, safe area, live region). CLI pencarian skill tidak dijalankan karena Python tidak terpasang.
- Verifikasi: `tsc --noEmit` bersih, `expo lint` bersih, `jest` 23 suite / 572 tes lulus (termasuk tes baru `__tests__/antislop-audit-high.test.ts`). **Aplikasi belum dijalankan di perangkat** (lihat bagian akhir).

| No | Status | Yang diubah |
|---|---|---|
| 1 | Selesai | Tombol "Cetak Struk" simulasi dihapus dari struk POS dan detail pesanan, diganti `// TODO`. "Transaksi Baru" menjadi tombol utama di struk. |
| 2 | Selesai | Fallback `"QRIS"` jadi `-`; chip tipe pesanan hanya tampil bila datanya ada; sidebar tidak lagi memakai `admin@fantasicoffee.com`, `"Admin"`, "Cabang Utama", dan titik hijau palsu; teks keluar tidak lagi menyebut "sesi Admin". |
| 3 | Selesai | Badge "Data Aktual" diganti "Diperbarui HH:MM" yang hanya tampil bila data berhasil dimuat. Kartu angka tidak tampil sebelum data pertama berhasil; pesan error menyebut jam pembaruan terakhir. |
| 4 | Selesai, perlu konfirmasi | Baris "Pajak & Layanan: Termasuk" dihapus. "Ketersediaan menu terupdate" diganti "Tarik ke bawah untuk memperbarui". Bila harga memang sudah termasuk pajak, baris itu bisa dikembalikan. |
| 5 | Selesai | `Rp —` jadi "Belum diisi"; em dash di pesan kedaluwarsa jadi titik. Emoji `⏱` diganti kata "Sisa". |
| 6 | Selesai | `#9CA3AF` diganti `#6B7280` (4.58 sampai 4.83:1) di semua layar; `text-rose-600` diganti `text-danger`; token baru `line-strong #8A8F98` (3.08 sampai 3.25:1) untuk garis `Input`, kolom isian mentah, dan kotak pencarian. |
| 7 | Selesai | `ScreenHeader` memasang `StatusBar style="light"`; modal keranjang pelanggan juga. Layar login/register tetap ikon gelap. |
| 8 | Selesai | POS: jumlah, hapus, Dine In/Take Away, metode bayar, pecahan uang, chip kategori, catatan item, tombol Keluar, dan "Lihat & Bayar" kini minimal 44px; sakelar ketersediaan 32px + hitSlop. Pelanggan: tombol tutup, chip, Kosongkan, Hapus, Pesan, tombol modal catatan. Sidebar: pilihan orientasi. `ShiftRequiredNotice`: tautan jadi tombol 44px. `Button sm` jadi `min-h-11`. |
| 9 | Selesai | Hook baru `hooks/useSheetPadding.ts`; 16 bottom sheet menambah `insets.bottom`. Header modal keranjang pelanggan memakai `insets.top`. Bar keranjang mengambang (POS dan pelanggan) ikut inset bawah. |
| 10 | Selesai | Label untuk kontrol ikon (hapus, jumlah, hapus pencarian, tutup modal, kosongkan keranjang); `accessibilityState.selected` untuk chip kategori, metode bayar, tipe pesanan, orientasi; detail menu bisa dibuka lewat aksi aksesibilitas dan ditutup dengan tombol "Tutup detail". |
| 11 | Selesai | Countdown di daftar pesanan hanya diumumkan saat kedaluwarsa; countdown layar bayar QRIS tidak lagi jadi live region. |
| 12 | Selesai | Layar bayar QRIS punya status memuat dan error saat data pesanan gagal diambil. `ErrorState` punya `actionLabel`, sehingga tombol yang berpindah halaman berlabel "Buka Pesanan Saya". |
| 13 | Selesai | "Semua Transaksi" jadi "Semua Pesanan" dan membuka `/(admin)/orders`. |
| 14 | Tertunda | Butuh file logo Fantasi Coffee dari pemilik. Ikon aplikasi, splash, dan ikon adaptif Android masih bawaan template Expo. |
| 15 | Selesai | `lib/web-alert.ts` dipasang di `app/_layout.tsx`: di web, `Alert.alert` memakai `window.alert`/`window.confirm`. Tidak berpengaruh di Android/iOS. Dialog dengan tiga tombol di web hanya menawarkan satu aksi. |

## Putaran 2: MEDIUM dan LOW (16 sampai 27)

Pedoman skill ui-ux-pro-max yang dipakai (CLI berjalan lewat `py -3.11`): skala teks konsisten 12/14/16, error tidak hanya lewat warna (ikon + teks + diumumkan), satu keluarga ikon, item navigasi bawah punya ikon dan label.

| No | Status | Yang diubah |
|---|---|---|
| 16 | Selesai | 140 kelas warna Tailwind bawaan diganti token `success`/`danger`/`warning`/netral; ikon heksadesimal ikut disamakan. Error `Input` kini `danger` + ikon `alert-circle` + `accessibilityRole="alert"`, tidak lagi memakai merah brand. Sisa yang disengaja: warna medali peringkat di Laporan dan pil status jaringan di atas header gelap. Semua pasangan token dicek: lolos AA. |
| 17 | Selesai | `font-heading-bold` (26 tempat, tidak terdefinisi) diganti `font-heading` (Poppins Bold); `Inter_600SemiBold` dimuat di `app/_layout.tsx`. |
| 18 | Selesai | Semua teks 9/10/11px dinaikkan ke 12px (`text-xs`). Badge jumlah di kartu POS diperbesar; baris status pembayaran di daftar pesanan boleh membungkus. |
| 19 | Selesai | Kartu profil admin di atas dashboard dihapus (email pindah ke subjudul header). Tujuh kartu modul identik diganti satu daftar "Data Master" berisi angka nyata (tersedia/habis, stok aman/menipis/habis, biaya hari ini, karyawan aktif) dan menulis "Belum dimuat" sebelum data ada. |
| 20 | Selesai | Ikon cangkir di setiap kartu produk POS dihapus; ikon petir diganti `today-outline`. Navigasi (sidebar dan tab bar admin) pindah dari Lucide ke Ionicons, sehingga seluruh aplikasi memakai satu keluarga ikon. |
| 21 | Selesai | `shadow-sm`/`shadow-md` dihapus dari kartu dan tombol yang diam. Bayangan tersisa hanya pada modal, sheet, banner, sidebar, dan bar mengambang, dengan skala `shadow-lg` (bar) dan `shadow-xl` (modal). |
| 22 | Selesai | Pil diganti radius chip pada filter, countdown, sakelar ketersediaan, status struk, status jaringan, dan bar keranjang pelanggan. Tab bar admin tidak lagi berbentuk kapsul. Lingkaran ikon dan avatar tetap bulat. |
| 23 | Selesai | `w-18 h-18` diganti `w-[72px] h-[72px]`. |
| 24 | Selesai | `components/FloatingNavbar.tsx` ditulis ulang: hanya `FloatingTabBar`. Tab demo, komponen default, `FloatingTabIcon`, `getFloatingTabScreenOptions`, dan tema `coffee-dark` dihapus. Tab kini punya label teks, `accessibilityRole="tab"`, dan target 48px. |
| 25 | Selesai | Placeholder: "Nama lengkap Anda", "Nomor meja atau nama pelanggan", "Nama lengkap karyawan". |
| 26 | Selesai | Katalog pelanggan: baris email + badge "Pelanggan" dihapus. POS: subjudul header menampilkan email kasir (badge email terpisah dihapus), baris "Fantasi Coffee POS Terminal" di struk dihapus, "Kasir / Waktu" jadi "Waktu". Dashboard: "cup terjual" jadi "terjual". |
| 27 | Tertunda | Butuh arah visual dari pemilik (karakter kedai, suasana, referensi). Tidak diubah. |

Verifikasi putaran 2: `tsc` bersih, `expo lint` bersih, `jest` 579 tes lulus (tes MEDIUM/LOW ditambahkan ke `__tests__/antislop-audit-high.test.ts`), `expo export --platform android` berhasil membuat bundle. Aplikasi tetap belum dijalankan di perangkat.

Catatan: `lucide-react-native` kini tidak dipakai di kode mana pun. Paket bisa dihapus dari `package.json` setelah disetujui.

Tambahan untuk dicoba di perangkat: tab bar admin berlabel, daftar "Data Master" di dashboard, kartu POS tanpa ikon, dan teks 12px di daftar pesanan (tidak terpotong di ponsel kecil).

## Perubahan pendukung
- `jest.setup.js`: mock `expo-status-bar` (modul native).
- `__tests__/iteration-ui.test.tsx`: harapan ukuran `Button sm` disesuaikan ke `min-h-11`.
- `__tests__/iteration4-hardening.test.ts`: tes detail produk disesuaikan dengan mode "sticky" untuk pembaca layar.

## Delivery Gate (blok Hard Gate, hanya untuk cakupan perbaikan ini)
- R-02 PASS: tidak ada em dash di baris UI pada file yang disentuh (dicek tes #5).
- R-03 PASS (inspeksi kode): target yang disebut di audit kini minimal 44px; sheet dan bar mengambang memakai safe area. Belum dicek di perangkat.
- R-23 FAIL: ikon aplikasi masih bawaan Expo (nomor 14, menunggu aset).
- R-25 PASS (dihitung): placeholder 4.58 sampai 4.83:1, garis input 3.08 sampai 3.25:1, teks merah memakai `danger`. Ikon status bar belum dicek di perangkat.
- R-26 PASS: tombol cetak palsu dihapus; Alert berfungsi di web.
- R-27 PASS: layar bayar QRIS punya memuat, error, kosong (QR tidak ada).
- R-35 FAIL: aplikasi belum dijalankan; tidak ada click-through yang tercatat.
- R-38 PASS: data cadangan karangan dan klaim tanpa bukti dihapus.
- R-39 PASS (inspeksi kode): kontrol yang disebut di audit punya nama dan status.

## Yang perlu dicoba di perangkat
1. Status bar terang di semua layar ber-header merah, dan kembali gelap di login.
2. POS di tablet dan ponsel: tombol jumlah, metode bayar, pecahan uang, chip kategori nyaman disentuh dan tidak membuat baris pecah.
3. Bottom sheet admin/kasir di iPhone dengan home indicator: tombol Simpan tidak tertimpa.
4. Modal keranjang pelanggan: judul dan tombol tutup di bawah notch.
5. TalkBack/VoiceOver: detail menu lewat aksi "Lihat detail menu", lalu "Tutup detail".
