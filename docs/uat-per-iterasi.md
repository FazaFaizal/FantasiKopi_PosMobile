# User Acceptance Test (UAT) per Iterasi

**Aplikasi:** Fantasi Coffee Mobile POS
**Acuan:** `prd.md` bagian 5 (Scope & Development Iteration) dan bagian 35 (Iteration Acceptance Criteria). Kriteria Iterasi 3 dan 4 lama di PRD dibagi ulang menjadi Iterasi 3, 4, dan 5 di dokumen ini.
**Versi dokumen:** 1.1, 16 November 2026

---

## 1. Tujuan

UAT memastikan setiap iterasi memenuhi kebutuhan pengguna nyata di kedai: Admin (pemilik/manajer), Kasir, dan Customer. Pengujian dilakukan oleh pengguna atau perwakilannya, langsung di aplikasi, tanpa melihat kode.

Satu iterasi **diterima** bila semua skenario berprioritas **Wajib** berstatus Lulus dan tidak ada temuan berat yang terbuka.

## 2. Cara memakai dokumen ini

1. Siapkan perangkat, akun, dan data awal sesuai bagian 3.
2. Jalankan skenario berurutan per iterasi. Beberapa skenario memakai data dari skenario sebelumnya (ditulis di kolom Langkah).
3. Isi kolom **Hasil aktual** dengan apa yang terlihat di layar, lalu isi **Status**:
   - **L** = Lulus, hasil sama dengan yang diharapkan.
   - **G** = Gagal, hasil berbeda. Catat di Lembar Temuan (bagian 10).
   - **B** = Diblokir, skenario tidak bisa dijalankan (misalnya skenario sebelumnya gagal).
4. Di akhir iterasi, isi Lembar Pengesahan.

Prioritas skenario:

- **Wajib**: kriteria penerimaan PRD bagian 35. Harus Lulus.
- **Penting**: aturan bisnis yang menjaga data dan uang tetap benar.
- **Tambahan**: kenyamanan dan tampilan.

## 3. Persiapan umum

### 3.1 Perangkat

| Perangkat                                              | Dipakai untuk                 | Catatan                                   |
| ------------------------------------------------------ | ----------------------------- | ----------------------------------------- |
| HP Android (layar kecil, misalnya 5,5 sampai 6,1 inci) | Customer, Kasir mode ponsel   | Wajib                                     |
| Tablet Android (10 inci)                               | Kasir di meja kasir, Admin    | Wajib, uji posisi lanskap dan potret      |
| iPhone                                                 | Customer                      | Opsional, untuk cek notch dan area gestur |
| HP kedua                                               | Customer kedua / uji realtime | Untuk skenario notifikasi                 |

### 3.2 Akun uji

Buat akun uji khusus, jangan memakai akun operasional kedai. Isi tabel ini sebelum mulai.

| Kode  | Role     | Email | Dibuat oleh                             |
| ----- | -------- | ----- | --------------------------------------- |
| ADM-1 | Admin    |       | Sudah ada (admin awal)                  |
| KSR-1 | Kasir    |       | Dibuat pada skenario I1                 |
| CUS-1 | Customer |       | Daftar sendiri pada skenario I1         |
| CUS-2 | Customer |       | Daftar sendiri, untuk uji batas pesanan |

### 3.3 Lingkungan

- Zona waktu kedai: **WITA (UTC+8)**. Uji yang menyangkut "hari ini" dicatat dengan jam WITA.
- Pembayaran QRIS Online memakai **Midtrans Sandbox**. Pembayaran dilakukan lewat simulator QRIS Midtrans, bukan uang sungguhan.
- Koneksi internet stabil, kecuali pada skenario offline.

---

## 4. Iterasi 1: Authentication, Employee & User

**Kriteria penerimaan (PRD 35):** Admin, Kasir, dan Customer dapat login; Customer dapat mendaftar sendiri; logout berfungsi; role menentukan akses; Admin mengelola Employee dan User Account; menonaktifkan Employee ikut menonaktifkan akunnya; akun terhubung dengan Employee dan punya role; akses tanpa hak ditolak.

**Prasyarat:** ADM-1 dapat login. Belum ada data karyawan uji.

| ID    | Prioritas | Peran    | Skenario                               | Langkah                                                                                                                        | Hasil yang diharapkan                                                                                                        | Hasil aktual | Status |
| ----- | --------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| I1-01 | Wajib     | Admin    | Login Admin                            | Buka aplikasi, isi email dan password ADM-1, tekan **Masuk Sekarang**.                                                         | Masuk ke **Dashboard Admin**.                                                                                                |              | L      |
| I1-02 | Wajib     | Semua    | Login dengan password salah            | Isi email benar dan password salah.                                                                                            | Muncul pesan gagal masuk. Tetap di halaman login.                                                                            |              | L      |
| I1-03 | Wajib     | Admin    | Tambah karyawan                        | Sidebar > **Kelola Karyawan** > Tambah. Isi nama, posisi, telepon, tanggal mulai. Simpan.                                      | Karyawan muncul di daftar dengan status Aktif.                                                                               |              | L      |
| I1-04 | Wajib     | Admin    | Buat akun Kasir dari karyawan          | Sidebar > **Akun Pengguna** > **Buat Akun Karyawan**. Pilih karyawan dari I1-03, role Kasir, isi email dan password. Simpan.   | Akun KSR-1 terbuat dengan role Kasir, terhubung ke karyawan tersebut. Admin tetap login sebagai ADM-1 (tidak berganti akun). |              | L      |
| I1-05 | Penting   | Admin    | Satu karyawan satu akun                | Coba buat akun kedua untuk karyawan I1-03.                                                                                     | Karyawan tersebut tidak muncul sebagai pilihan atau ditolak.                                                                 |              | L      |
| I1-06 | Wajib     | Customer | Registrasi Customer                    | Logout. Di halaman login tekan **Daftar Akun Customer**. Isi nama, email baru, password, konfirmasi. Tekan **Daftarkan Akun**. | Muncul "Registrasi Berhasil". Akun CUS-1 punya role Customer dan status Aktif.                                               |              | L      |
| I1-07 | Wajib     | Customer | Login Customer                         | Login sebagai CUS-1.                                                                                                           | Masuk ke katalog menu Customer.                                                                                              |              | L      |
| I1-08 | Wajib     | Kasir    | Login Kasir                            | Login sebagai KSR-1.                                                                                                           | Masuk ke **Terminal Kasir POS** (atau layar "Sif kasir belum dibuka" bila belum ada sif).                                    |              | L      |
| I1-09 | Wajib     | Semua    | Logout                                 | Dari masing-masing role, buka Profil atau sidebar, tekan **Keluar dari Akun**, konfirmasi.                                     | Kembali ke halaman login. Membuka ulang aplikasi tidak langsung masuk.                                                       |              | L      |
| I1-10 | Wajib     | Semua    | Sesi tersimpan                         | Login, tutup aplikasi sepenuhnya, buka lagi.                                                                                   | Langsung masuk ke halaman sesuai role tanpa login ulang.                                                                     |              |        |
| I1-11 | Wajib     | Kasir    | Akses halaman Admin ditolak            | Login KSR-1. Coba buka menu khusus Admin (misalnya lewat tautan atau tombol yang tersisa).                                     | Muncul halaman **Akses Dibatasi** dengan tombol kembali ke beranda Kasir. Sidebar Kasir tidak menampilkan menu Admin.        |              |        |
| I1-12 | Wajib     | Customer | Akses halaman staf ditolak             | Login CUS-1. Coba buka halaman Kasir/Admin.                                                                                    | Ditolak, diarahkan ke halaman Akses Dibatasi atau katalog.                                                                   |              |        |
| I1-13 | Wajib     | Admin    | Nonaktifkan karyawan                   | Login ADM-1. Nonaktifkan karyawan milik KSR-1.                                                                                 | Karyawan Nonaktif dan akun KSR-1 ikut Nonaktif.                                                                              |              |        |
| I1-14 | Wajib     | Kasir    | Login akun nonaktif                    | Login KSR-1.                                                                                                                   | Muncul halaman **Akun Dinonaktifkan**. Tidak bisa masuk POS.                                                                 |              |        |
| I1-15 | Penting   | Admin    | Aktifkan kembali karyawan              | Aktifkan lagi karyawan KSR-1.                                                                                                  | Karyawan Aktif, tetapi akun KSR-1 **tetap Nonaktif** sampai diaktifkan manual di **Akun Pengguna**. Aktifkan akun KSR-1.     |              |        |
| I1-16 | Penting   | Admin    | Ubah role Admin ↔ Kasir                | Ubah role KSR-1 ke Admin lalu kembali ke Kasir.                                                                                | Berhasil. Akun Customer tidak bisa diubah ke Admin/Kasir.                                                                    |              |        |
| I1-17 | Penting   | Admin    | Admin tidak bisa mengubah diri sendiri | Login ADM-1, coba ubah role atau nonaktifkan akun ADM-1.                                                                       | Ditolak. Perubahan harus dilakukan Admin lain.                                                                               |              |        |
| I1-18 | Penting   | Admin    | Nonaktifkan Customer                   | Nonaktifkan CUS-2, lalu login sebagai CUS-2.                                                                                   | CUS-2 tidak bisa masuk (halaman Akun Dinonaktifkan). Aktifkan kembali setelah uji.                                           |              |        |

---

## 5. Iterasi 2: Product & Inventory

**Kriteria penerimaan (PRD 35):** Admin mengelola Category dan Product; Product punya Category; Admin mengatur Tersedia/Tidak Tersedia; Admin dan Kasir menambah, mengubah, melihat bahan baku; hanya Admin yang menghapus bahan baku; Admin dan Kasir mencatat Stock In, Stock Out, Adjustment; riwayat stok tercatat dan tidak bisa diubah; stok tidak bisa negatif; status stok berubah otomatis.

**Prasyarat:** Iterasi 1 diterima. ADM-1 dan KSR-1 aktif.

| ID    | Prioritas | Peran         | Skenario                                        | Langkah                                                                                                                       | Hasil yang diharapkan                                                                                         | Hasil aktual | Status |
| ----- | --------- | ------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| I2-01 | Wajib     | Admin         | Tambah kategori                                 | Sidebar > **Kategori Menu** > Tambah "Kategori Uji A" dan "Kategori Uji B".                                                   | Kedua kategori Aktif di daftar.                                                                               |              |        |
| I2-02 | Wajib     | Admin         | Tambah produk                                   | Sidebar > **Katalog Produk** > Tambah: nama, deskripsi, kategori Uji A, harga, gambar (opsional), status Tersedia.            | Produk muncul di daftar dengan kategori dan harga benar.                                                      |              |        |
| I2-03 | Wajib     | Admin         | Ubah produk                                     | Ubah harga dan pindahkan ke Kategori Uji B.                                                                                   | Perubahan tersimpan dan tampil.                                                                               |              |        |
| I2-04 | Wajib     | Admin         | Ubah ketersediaan                               | Ubah produk menjadi Tidak Tersedia, lalu Tersedia.                                                                            | Status berubah sesuai pilihan.                                                                                |              |        |
| I2-05 | Penting   | Admin         | Cari dan filter produk                          | Cari nama produk; filter kategori dan status.                                                                                 | Hanya produk yang sesuai yang tampil.                                                                         |              |        |
| I2-06 | Penting   | Admin         | Kategori dengan produk tidak bisa dinonaktifkan | Coba nonaktifkan Kategori Uji B (masih berisi produk).                                                                        | Ditolak dengan pesan untuk memindahkan atau menghapus produk dulu.                                            |              |        |
| I2-07 | Penting   | Admin         | Produk tidak bisa masuk kategori nonaktif       | Nonaktifkan Kategori Uji A (kosong). Coba tambah/pindahkan produk ke Kategori Uji A.                                          | Kategori nonaktif tidak bisa dipilih atau ditolak.                                                            |              |        |
| I2-08 | Penting   | Admin         | Hapus kategori kosong                           | Hapus Kategori Uji A.                                                                                                         | Berhasil setelah konfirmasi. Kategori berisi produk tidak bisa dihapus.                                       |              |        |
| I2-09 | Penting   | Admin         | Hapus produk yang pernah dipesan                | (Jalankan setelah Iterasi 3) Hapus produk yang sudah ada di riwayat order.                                                    | Produk hilang dari katalog, tetapi riwayat order lama tetap menampilkan nama dan harga produk.                |              |        |
| I2-10 | Wajib | Kasir | Kasir hanya bisa ubah ketersediaan | Login KSR-1. Di POS, ketuk pil **Tersedia ⇄** pada kartu produk, lalu tekan **Ya, Habis** di modal konfirmasi. Ulangi untuk mengembalikan ke Tersedia. | Modal konfirmasi muncul dulu; status baru berubah setelah ditekan **Ya**, dan **Batal** tidak mengubah apa pun. Kasir tidak punya akses ke halaman Katalog Produk Admin (nama, harga, kategori). |  |  |
| I2-11 | Wajib     | Admin         | Tambah bahan baku                               | Sidebar > **Bahan Baku & Stok** > Tambah: nama "Susu Uji", satuan ml, minimum stok 1000.                                      | Bahan tersimpan, stok 0, status **Out of Stock / Habis**.                                                     |              |        |
| I2-12 | Wajib     | Kasir         | Kasir tambah dan ubah bahan                     | Login KSR-1 > **Bahan Baku & Stok**. Tambah "Gula Uji", ubah keterangannya.                                                   | Berhasil. Kasir dapat melihat daftar dan detail.                                                              |              |        |
| I2-13 | Wajib     | Admin / Kasir | Stock In                                        | Pilih "Susu Uji" > mutasi **Stock In (+)** jumlah 1500, tanpa tanda pembelian.                                                | Stok menjadi 1500, status **Aman**. Riwayat mencatat stok sebelum 0, sesudah 1500, user, waktu.               |              |        |
| I2-14 | Wajib     | Admin / Kasir | Stock Out                                       | **Stock Out (-)** 600 dengan keterangan "Pemakaian harian".                                                                   | Stok 900, status **Low Stock / Menipis** (900 ≤ 1000).                                                        |              |        |
| I2-15 | Wajib     | Admin / Kasir | Stock Out melebihi stok                         | Stock Out 5000.                                                                                                               | Ditolak: stok tidak boleh negatif. Stok tetap 900.                                                            |              |        |
| I2-16 | Penting   | Admin / Kasir | Keterangan wajib                                | Stock Out atau Opname tanpa keterangan.                                                                                       | Ditolak dengan pesan wajib diisi.                                                                             |              |        |
| I2-17 | Wajib     | Admin / Kasir | Stock Adjustment (opname)                       | **Opname (=)** isi stok fisik 0 dengan keterangan "Hasil hitung".                                                             | Stok 0, status **Out of Stock**. Opname dengan angka sama dengan stok sistem ditolak.                         |              |        |
| I2-18 | Penting   | Admin / Kasir | Jumlah harus > 0                                | Stock In atau Stock Out dengan jumlah 0 atau negatif.                                                                         | Ditolak.                                                                                                      |              |        |
| I2-19 | Wajib     | Admin         | Status mengikuti minimum stok                   | Ubah minimum stok "Susu Uji" saat stok 900 menjadi 500.                                                                       | Status berubah dari Low Stock ke Aman tanpa mengubah angka stok.                                              |              |        |
| I2-20 | Wajib     | Admin / Kasir | Riwayat tidak bisa diubah                       | Buka riwayat mutasi. Cari opsi ubah/hapus pada baris riwayat.                                                                 | Tidak ada opsi ubah atau hapus.                                                                               |              |        |
| I2-21 | Penting   | Admin / Kasir | Stok hanya berubah lewat mutasi                 | Edit bahan baku dan cari kolom angka stok.                                                                                    | Angka stok tidak bisa diketik langsung, hanya lewat mutasi.                                                   |              |        |
| I2-22 | Wajib     | Kasir         | Kasir tidak bisa hapus bahan                    | Login KSR-1, cari tombol hapus bahan baku.                                                                                    | Tidak ada tombol hapus.                                                                                       |              |        |
| I2-23 | Wajib     | Admin         | Admin hapus bahan                               | Login ADM-1, hapus "Gula Uji".                                                                                                | Bahan terhapus. Riwayat mutasinya tetap terbaca dengan nama bahan.                                            |              |        |
| I2-24 | Penting   | Admin / Kasir | Stock In sebagai pembelian                      | (Butuh sif aktif untuk Kasir, lihat I4-02) Stock In 1000 dan centang **Ini pembelian, catat sebagai biaya**, isi total harga. | Stok bertambah dan satu Expense Raw Material tercatat hari ini dengan deskripsi "Pembelian Susu Uji 1000 ml". |              |        |
| I2-25 | Tambahan  | Admin         | Peringatan stok di dashboard                    | Pastikan ada bahan Low Stock atau Habis, buka Dashboard.                                                                      | Muncul kotak **Peringatan Stok Bahan Baku**. Mengetuknya membuka halaman bahan baku.                          |              |        |

---

## 6. Iterasi 3: Manajemen Pesanan POS

**Kriteria penerimaan (PRD 35):** Kasir mengubah status Order; Admin dan Kasir membatalkan Order dan memproses refund; riwayat Transaction/Order dapat dilihat.

**Prasyarat:** Iterasi 2 diterima. KSR-1 punya sif aktif (refund hanya bisa diproses saat ada sif aktif), dan sudah ada minimal 5 order lunas berstatus Processing yang dibuat lewat POS, salah satunya dibayar Tunai. Order ini hanya data uji: pembukaan sif diuji di Iterasi 4 dan transaksi POS di Iterasi 5.

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I3-01 | Wajib     | Kasir         | Ubah status order                   | Detail order Processing > **Tandai Siap (Ready)** > **Selesaikan**.                                              | Status berubah Processing → Ready → Completed.                                                          |              |        |
| I3-02 | Penting   | Kasir         | Selesaikan semua yang siap          | Buat 2 order, tandai keduanya Ready, tekan **Selesaikan Pesanan Siap**.                                          | Keduanya Completed.                                                                                     |              |        |
| I3-03 | Wajib     | Kasir         | Batal + refund order lunas          | Detail order Processing yang Tunai > **Batalkan Pesanan & Refund**, isi alasan > **Ya, Batalkan**.               | Order Cancelled, status bayar **Dikembalikan (Refunded)**. Alasan, pelaku, waktu tercatat.              |              |        |
| I3-04 | Penting   | Kasir         | Alasan wajib                        | Coba batalkan tanpa alasan.                                                                                      | Ditolak.                                                                                                |              |        |
| I3-05 | Wajib     | Admin / Kasir | Order selesai tidak bisa dibatalkan | Buka order Completed atau Cancelled.                                                                             | Tidak ada tombol batalkan.                                                                              |              |        |
| I3-06 | Wajib     | Admin         | Admin membatalkan order             | Login ADM-1 > **Pesanan** > batalkan satu order Processing.                                                      | Berhasil seperti I3-03.                                                                                 |              |        |
| I3-07 | Penting   | Admin         | Koreksi metode bayar                | Admin > **Pesanan** > order lunas > **Koreksi Metode Pembayaran** (misalnya Tunai → QRIS).                       | Metode berubah, catatan koreksi (siapa, lama → baru) tercatat. Kasir tidak punya tombol ini.            |              |        |
| I3-08 | Wajib     | Admin / Kasir | Riwayat order                       | Buka Riwayat Transaksi / Pesanan, gulir ke bawah, tekan **Muat lebih banyak** bila ada, pakai filter "Hari ini". | Semua order uji tampil dengan nomor, waktu, pelanggan, tipe, total, metode, status bayar, status order. |              |        |

---

## 7. Iterasi 4: Laporan Pemasukan & Pengeluaran, Menu Pelanggan, Keranjang Customer, Dashboard

**Kriteria penerimaan (PRD 35):** Admin melihat Sales Report, mengelola Expense, dan melihat Financial Report; Customer melihat Product dan memakai Cart; Admin Dashboard menampilkan data aktual tentang Sales, Order, Inventory, dan Financial.

**Prasyarat:** Iterasi 3 diterima. Order uji dari Iterasi 3 (lunas dan dibatalkan) masih ada. CUS-1 aktif. Untuk I4-01, sif dari Iterasi 3 sudah ditutup.

### 7.1 Sif kasir

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-01 | Wajib     | Kasir | POS terkunci tanpa sif        | Login KSR-1 tanpa sif aktif.                                                        | Layar "Sif kasir belum dibuka" dan tombol **Buka Sif di Kas Harian**. |              |        |
| I4-02 | Wajib     | Kasir | Buka sif                      | Tekan **Buka Sif di Kas Harian** > **Buka Sif**, isi modal awal (misalnya 200.000). | Sif aktif. POS terbuka.                                               |              |        |
| I4-03 | Penting   | Kasir | Modal beda dari sisa sif lalu | (Setelah ada sif sebelumnya) isi modal berbeda dari saran sistem.                   | Catatan menjadi wajib sebelum sif bisa dibuka.                        |              |        |
| I4-04 | Penting   | Kasir | Hanya satu sif aktif          | Dari perangkat lain (ADM-1 atau kasir lain) coba buka sif kedua.                    | Ditolak.                                                              |              |        |

### 7.2 Pengeluaran, kas harian, tutup sif

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-05 | Wajib     | Admin | Tambah expense                      | Sidebar > **Biaya Operasional** > tambah expense Operational 50.000, dibayar dari kas laci. | Tersimpan dan tampil di daftar.                                                                                                                                              |              |        |
| I4-06 | Wajib     | Admin | Ubah dan hapus expense              | Ubah nominal, lalu hapus (dengan konfirmasi).                                               | Berhasil.                                                                                                                                                                    |              |        |
| I4-07 | Penting   | Admin | Filter dan kelompok expense         | Filter periode dan kategori.                                                                | Hanya expense yang sesuai tampil, total per kategori benar.                                                                                                                  |              |        |
| I4-08 | Penting   | Kasir | Kasir catat pengeluaran harian      | Kas Harian > **Catat Pengeluaran Harian** (misalnya es batu 20.000).                        | Tercatat hari ini atas nama Kasir. Kasir tidak bisa mengubah atau menghapusnya.                                                                                              |              |        |
| I4-09 | Wajib     | Kasir | Rekap kas harian                    | Buka **Kas Harian**.                                                                        | Uang seharusnya di laci = modal + tunai diterima − refund tunai − pengeluaran dari kas. QRIS/Debit tampil terpisah dan tidak menambah laci. Cocokkan dengan hitungan manual. |              |        |
| I4-10 | Wajib     | Kasir | Tutup sif tanpa selisih             | **Tutup Sif & Hitung Kas**, isi uang fisik sama dengan kas seharusnya.                      | Sif tertutup, POS terkunci lagi.                                                                                                                                             |              |        |
| I4-11 | Penting   | Kasir | Tutup sif dengan selisih            | Buka sif baru, lalu tutup dengan uang fisik berbeda.                                        | Catatan selisih wajib diisi. Selisih tercatat di riwayat sif.                                                                                                                |              |        |
| I4-12 | Penting   | Admin | Admin menutup sif yang lupa ditutup | Biarkan sif KSR-1 terbuka, tutup dari akun ADM-1.                                           | Berhasil.                                                                                                                                                                    |              |        |

### 7.3 Laporan pemasukan dan pengeluaran

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-13 | Wajib     | Admin | Sales Report hari ini           | Sidebar > **Laporan & Finansial**, periode hari ini.                            | Total order, produk terjual, total penjualan, produk terlaris. Hanya order **lunas dan tidak dibatalkan** yang dihitung. Cocokkan dengan daftar order uji. |              |        |
| I4-14 | Wajib     | Admin | Rentang tanggal                 | Pilih rentang beberapa hari.                                                    | Angka mengikuti rentang yang dipilih.                                                                                                                      |              |        |
| I4-15 | Wajib     | Admin | Financial Report                | Lihat ringkasan keuangan periode yang sama.                                     | Net Result = Total Sales − Total Expense. Cocokkan dengan hitungan manual.                                                                                 |              |        |
| I4-16 | Penting   | Admin | Order dibatalkan tidak dihitung | Bandingkan laporan sebelum dan sesudah membatalkan satu order lunas.            | Penjualan turun sebesar order yang dibatalkan.                                                                                                             |              |        |
| I4-17 | Penting   | Admin | Batas hari WITA                 | Buat order mendekati 00:00 WITA (atau periksa order lama sekitar tengah malam). | Order masuk ke tanggal pembayaran WITA, bukan tanggal perangkat.                                                                                           |              |        |

### 7.4 Menu dan keranjang Customer

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-18 | Wajib     | Customer | Lihat katalog                   | Login CUS-1.                                                                                                 | Daftar menu dengan kategori, harga, dan status. Menu Habis tampil tetapi tidak bisa dipesan. Produk nonaktif tidak tampil. |              |        |
| I4-19 | Wajib     | Customer | Cari dan filter                 | Ketik nama menu; pilih kategori.                                                                             | Hanya menu yang sesuai tampil.                                                                                             |              |        |
| I4-20 | Penting   | Customer | Detail menu                     | Tahan kartu menu.                                                                                            | Detail tampil (foto, nama, kategori, harga, status, deskripsi). Lepas jari, detail tertutup.                               |              |        |
| I4-21 | Wajib     | Customer | Tambah ke keranjang             | Tekan **Pesan** pada 2 menu, isi catatan pada salah satunya.                                                 | Bar keranjang menampilkan jumlah item dan total.                                                                           |              |        |
| I4-22 | Wajib     | Customer | Ubah dan hapus item             | Buka keranjang, ubah jumlah, hapus satu item, lalu **Kosongkan**.                                            | Subtotal dan total mengikuti. Keranjang bisa dikosongkan.                                                                  |              |        |

### 7.5 Dashboard Admin

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-23 | Wajib     | Admin | Angka hari ini sesuai laporan       | Buka Dashboard dan Laporan hari ini.                                                     | Omzet, biaya, laba bersih, dan produk terlaris sama persis di kedua halaman.                                                                      |              |        |
| I4-24 | Wajib     | Admin | Data order                          | Lihat **Pesanan Masuk**, jumlah menunggu bayar, dan **Pesanan Terbaru**.                 | Sama dengan order uji hari ini. **Semua Pesanan** membuka halaman Pesanan.                                                                        |              |        |
| I4-25 | Wajib     | Admin | Data stok                           | Lihat peringatan stok dan baris Bahan baku di **Data Master**.                           | Jumlah Aman / Menipis / Habis sesuai halaman Bahan Baku.                                                                                          |              |        |
| I4-26 | Penting   | Admin | Aktivitas Operasional               | Lihat daftar aktivitas, pakai filter Semua / Kas / Pesanan / Stok, ketuk satu aktivitas. | Buka/tutup sif, pembatalan/refund, koreksi metode, mutasi stok, dan pengeluaran dari skenario sebelumnya tampil. Ketukan membuka halaman terkait. |              |        |
| I4-27 | Penting   | Admin | Data dimuat ulang                   | Buat order baru dari kasir, kembali ke Dashboard (atau tarik ke bawah).                  | Angka bertambah tanpa menutup aplikasi. Badge "Diperbarui" menunjukkan jam terbaru.                                                               |              |        |
| I4-28 | Penting   | Admin | Gagal memuat tidak tampil sebagai 0 | Matikan internet, tarik dashboard ke bawah.                                              | Muncul pesan error dan tombol coba lagi. Tidak ada omzet Rp 0 yang tampak seperti data asli.                                                      |              |        |

---

## 8. Iterasi 5: Transaksi POS, Checkout & Pembayaran Customer

**Kriteria penerimaan (PRD 35):** Kasir membuat Order; Cart benar; total benar; Payment tercatat; Order dan Order Item tersimpan; Customer melakukan Checkout, membuat Order, dan melihat Order miliknya beserta statusnya.

**Prasyarat:** Iterasi 4 diterima. KSR-1 punya sif aktif. Minimal 3 produk Tersedia dan 1 produk Tidak Tersedia. Catat harga produk untuk menghitung total manual. CUS-1 dan CUS-2 aktif. Midtrans Sandbox siap.

### 8.1 POS dan keranjang Kasir

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-01 | Wajib     | Kasir | Cari dan filter menu             | Ketik nama menu; pilih chip kategori.                              | Hanya menu yang sesuai tampil.                                                    |              |        |
| I5-02 | Wajib | Kasir | Tambah ke keranjang | Ketuk kartu 2 produk (bagian mana pun selain pil Tersedia/Habis), salah satunya 2 kali. | Keranjang berisi 2 baris, salah satunya jumlah 2. Tablet: badge angka di pojok kartu. HP: label "2 di keranjang" di sebelah harga. |  |  |
| I5-03 | Wajib     | Kasir | Produk habis tidak bisa ditambah | Ketuk produk berstatus Habis.                                      | Tidak masuk keranjang. Kartu tampak nonaktif.                                     |              |        |
| I5-04 | Wajib     | Kasir | Ubah jumlah dan hapus            | Tekan + dan − pada item, lalu ikon tempat sampah.                  | Jumlah dan total berubah. Item terhapus.                                          |              |        |
| I5-05 | Wajib     | Kasir | Total benar                      | Bandingkan total di layar dengan hitungan manual (harga × jumlah). | Sama persis.                                                                      |              |        |
| I5-06 | Penting   | Kasir | Kosongkan keranjang              | Tekan **Kosongkan keranjang**, konfirmasi.                         | Keranjang kosong.                                                                 |              |        |
| I5-07 | Tambahan | Kasir | Catatan item | Di keranjang, ketuk nama item, isi catatan "less sugar", **Simpan Catatan**. | Catatan tampil di bawah harga item (item tanpa catatan tidak menampilkan kolom catatan) dan ikut tampil di struk. |  |  |
| I5-08 | Tambahan  | Kasir | Mode ponsel                      | Jalankan I5-02 di HP.                                              | Bar keranjang mengambang muncul, **Lihat & Bayar** membuka keranjang layar penuh. |              |        |

### 8.2 Pembayaran di POS

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-09 | Wajib | Kasir | Bayar tunai dengan kembalian | Pilih Dine In, isi meja/nama, metode **Tunai**, tekan **Bayar**. Di modal "Terima pembayaran tunai" isi uang diterima lebih besar dari total (atau ketuk chip pecahan), lalu **Konfirmasi Bayar**. | Kembalian di modal dihitung benar. Setelah konfirmasi, struk "Transaksi Berhasil" menampilkan nomor order, jam, item, total, uang diterima, kembalian. |  |  |
| I5-10 | Wajib | Kasir | Uang kurang | Di modal "Terima pembayaran tunai", isi uang diterima kurang dari total. | Tombol **Konfirmasi Bayar** tidak aktif, muncul keterangan uang kurang, kembalian "-". |  |  |
| I5-11 | Wajib | Kasir | Bayar QRIS dan Debit (di kasir) | Buat 2 order: metode QRIS lalu Debit, tekan **Bayar**. | Tanpa modal uang diterima; order langsung tersimpan Lunas dengan metode masing-masing. |  |  |
| I5-12 | Wajib     | Kasir | Order dan item tersimpan        | Buka **Riwayat Transaksi**, buka detail order I5-09.                                                    | Nomor order, waktu, pelanggan, tipe, item (nama, jumlah, harga), total, metode, status bayar Lunas, status order Processing.        |              |        |
| I5-13 | Penting   | Admin | Harga order tidak ikut berubah  | Ubah harga produk yang ada di I5-09, buka lagi detail order I5-09.                                      | Detail order tetap memakai harga lama.                                                                                              |              |        |
| I5-14 | Penting   | Kasir | Produk habis saat bayar         | Tambah produk ke keranjang, lalu (dari perangkat lain) ubah produk itu jadi Tidak Tersedia, lalu bayar. | Order ditolak seluruhnya. Tidak ada order setengah tersimpan.                                                                       |              |        |

### 8.3 Checkout Customer dan bayar di kasir

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-15 | Penting   | Customer | Harga berubah saat di keranjang | Isi keranjang. Admin mengubah harga menu tersebut. Customer tarik ke bawah untuk memperbarui, lalu checkout. | Customer diberi tahu perubahan, dan total akhir pesanan memakai harga terbaru.                                             |              |        |
| I5-16 | Wajib     | Customer         | Checkout bayar di kasir        | Keranjang > Dine In, nomor meja, nama pemesan, **Tunai di Kasir** > **Konfirmasi & Buat Pesanan**. | Muncul "Pesanan Berhasil Dibuat" dengan nomor pesanan, total, dan batas bayar 15 menit.                                                           |              |        |
| I5-17 | Wajib | Kasir | Notifikasi pesanan masuk | Di tablet kasir (layar apa pun) saat I5-16 dibuat. Lalu di POS ketuk ikon lonceng di header. | Banner "Pesanan baru" muncul. Lonceng di header POS dan menu Riwayat Transaksi menampilkan angka pesanan. Panel lonceng menampilkan pesanan di kelompok "Menunggu pembayaran" dengan sisa waktu bayar. |  |  |
| I5-18 | Wajib | Kasir | Terima pembayaran | Ketuk banner, atau ketuk pesanan di panel lonceng, lalu **Konfirmasi Pembayaran & Proses**. | Detail pesanan langsung terbuka di Riwayat Transaksi. Setelah konfirmasi, order Lunas dan Processing, dan angka lonceng berkurang. |  |  |
| I5-19 | Wajib     | Customer         | Lihat pesanan dan status       | CUS-1 > **Pesanan** (Pesanan Saya).                                                                | Pesanan tampil dengan status "Sedang Disiapkan". Saat kasir ubah ke Ready dan Completed, status berubah ke "Siap Diambil" lalu "Selesai".         |              |        |
| I5-20 | Wajib     | Customer         | Hanya pesanan milik sendiri    | Login CUS-2, buka Pesanan Saya.                                                                    | Pesanan CUS-1 tidak tampil.                                                                                                                       |              |        |
| I5-21 | Penting   | Customer         | Batalkan pesanan belum dibayar | Buat pesanan bayar di kasir, lalu batalkan dari Pesanan Saya dengan alasan (minimal 3 karakter).   | Pesanan Cancelled, status bayar tetap belum dibayar. Setelah dibayar/diproses, tombol batal tidak tersedia.                                       |              |        |
| I5-22 | Penting   | Customer         | Batas 1 pesanan belum dibayar  | CUS-2 buat pesanan bayar di kasir, lalu coba buat pesanan kedua sebelum membayar.                  | Ditolak dengan keterangan pesanan yang belum dibayar.                                                                                             |              |        |
| I5-23 | Penting   | Customer         | Batas jumlah                   | Isi 1 menu dengan jumlah 100, atau 11 menu berbeda.                                                | Ditolak (maksimal 99 per menu, 10 menu berbeda).                                                                                                  |              |        |
| I5-24 | Penting   | Customer / Kasir | Kedaluwarsa 15 menit           | Buat pesanan bayar di kasir, jangan dibayar selama 15 menit.                                       | Pesanan otomatis Cancelled dengan alasan tidak dibayar. Kasir tidak bisa lagi menerima pembayarannya. Customer melihat hitung mundur sebelum itu. |              |        |

### 8.4 QRIS Online (Midtrans Sandbox)

| ID | Prioritas | Peran | Skenario | Langkah | Hasil yang diharapkan | Hasil aktual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-25 | Wajib     | Customer | Bayar QRIS Online       | Checkout dengan **QRIS Online** > **Buat Pesanan & Bayar QRIS**.                    | Layar **Bayar QRIS** menampilkan gambar QR, total, dan hitung mundur 3 menit.                                                                           |              |        |
| I5-26 | Wajib     | Customer | Pembayaran berhasil     | Bayar lewat simulator QRIS Midtrans Sandbox (pakai **Bagikan link QR** bila perlu). | Layar berganti otomatis ke **Pembayaran Berhasil**. Pesanan Lunas dan Processing.                                                                       |              |        |
| I5-27 | Wajib     | Kasir    | Pesanan online di kasir | Amati kasir sebelum dan sesudah I5-26.                                              | Sebelum lunas, pesanan tidak tampil di kasir. Setelah lunas, banner "Pesanan online lunas" muncul. Kasir tidak bisa menandai lunas secara manual.       |              |        |
| I5-28 | Penting   | Customer | QR kedaluwarsa          | Buat pesanan QRIS Online, jangan bayar selama 3 menit.                              | Layar **Batas Waktu Pembayaran Habis**, pesanan Cancelled dengan status bayar Gagal. Customer tidak bisa membatalkan pesanan QRIS Online secara manual. |              |        |
| I5-29 | Penting   | Kasir    | Tidak butuh sif         | Tutup sif, lalu ulangi I5-25 dan I5-26.                                             | Pembayaran online tetap berhasil tanpa sif aktif.                                                                                                       |              |        |

---

## 9. Uji lintas iterasi (tampilan, perangkat, aksesibilitas)

Dijalankan sekali setelah Iterasi 5, di HP dan tablet.

| ID   | Prioritas | Skenario          | Langkah                                                                                                          | Hasil yang diharapkan                                                                                                                                          | Hasil aktual | Status |
| ---- | --------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| X-01 | Penting   | Status offline    | Matikan internet di layar mana pun yang punya header merah.                                                      | Label status jaringan berubah Offline. Aksi yang gagal menampilkan pesan, tidak diam.                                                                          |              |        |
| X-02 | Penting   | Orientasi tablet  | Sidebar > Orientasi layar: Otomatis, Lanskap, Potret.                                                            | Tata letak POS dan dashboard menyesuaikan tanpa teks terpotong.                                                                                                |              |        |
| X-03 | Penting   | Area aman layar   | Buka modal keranjang Customer dan bottom sheet (misalnya tambah bahan baku) di iPhone atau HP dengan bar gestur. | Judul tidak tertutup notch, tombol Simpan/Batal tidak tertutup bar gestur.                                                                                     |              |        |
| X-04 | Penting   | Ikon status bar   | Lihat jam dan baterai di layar ber-header merah, lalu di halaman login.                                          | Terbaca jelas di keduanya.                                                                                                                                     |              |        |
| X-05 | Tambahan | Target sentuh | Pakai POS dengan jempol: tombol +/−, metode bayar, chip kategori, pil Tersedia/Habis, chip pecahan uang. | Mudah ditekan tanpa salah sentuh; mengetuk pil tidak ikut menambah produk ke keranjang. |  |  |
| X-06 | Tambahan  | Ukuran teks besar | Atur ukuran font sistem ke terbesar, buka POS, Pesanan, dan katalog.                                             | Teks tetap terbaca dan tidak saling tumpang tindih.                                                                                                            |              |        |
| X-07 | Tambahan  | Pembaca layar     | Aktifkan TalkBack/VoiceOver, telusuri katalog Customer dan keranjang POS.                                        | Tombol ikon dibacakan namanya (misalnya "Hapus ... dari keranjang"). Detail menu bisa dibuka lewat aksi "Lihat detail menu" dan ditutup dengan "Tutup detail". |              |        |

---

## 10. Lembar temuan

Catat setiap skenario berstatus G di sini.

| No  | ID skenario | Perangkat | Langkah yang dilakukan | Hasil aktual | Hasil yang diharapkan | Tingkat (Berat / Sedang / Ringan) | Bukti (foto/video) | Status perbaikan |
| --- | ----------- | --------- | ---------------------- | ------------ | --------------------- | --------------------------------- | ------------------ | ---------------- |
| 1   |             |           |                        |              |                       |                                   |                    |                  |
| 2   |             |           |                        |              |                       |                                   |                    |                  |
| 3   |             |           |                        |              |                       |                                   |                    |                  |

Tingkat temuan:

- **Berat**: data atau uang salah, fitur Wajib tidak bisa dipakai, atau akses tanpa hak berhasil.
- **Sedang**: aturan bisnis Penting tidak berjalan, tetapi ada cara lain untuk menyelesaikan tugas.
- **Ringan**: tampilan, teks, atau kenyamanan.

---

## 11. Lembar pengesahan per iterasi

Isi satu blok untuk setiap iterasi.

### Iterasi \_\_\_

| Butir                                    | Isi |
| ---------------------------------------- | --- |
| Tanggal pengujian                        |     |
| Penguji (nama, peran)                    |     |
| Perangkat yang dipakai                   |     |
| Versi / build aplikasi                   |     |
| Jumlah skenario Wajib (Lulus / total)    | /   |
| Jumlah skenario Penting (Lulus / total)  | /   |
| Jumlah skenario Tambahan (Lulus / total) | /   |
| Temuan Berat yang masih terbuka          |     |

**Keputusan:**

- [ ] Diterima
- [ ] Diterima dengan catatan (temuan Sedang/Ringan diperbaiki di iterasi berikutnya)
- [ ] Ditolak (ada skenario Wajib gagal atau temuan Berat terbuka)

Catatan penguji:

&nbsp;

|              | Penguji | Pengembang |
| ------------ | ------- | ---------- |
| Nama         |         |            |
| Tanda tangan |         |            |
| Tanggal      |         |            |

---

## 12. Rekap hasil UAT

| Iterasi                            | Wajib (L/total) | Penting (L/total) | Tambahan (L/total) | Temuan Berat terbuka | Keputusan |
| ---------------------------------- | --------------- | ----------------- | ------------------ | -------------------- | --------- |
| 1: Authentication, Employee & User | /13             | /5                | /0                 |                      |           |
| 2: Product & Inventory             | /15             | /9                | /1                 |                      |           |
| 3: Manajemen Pesanan POS           | /5              | /3                | /0                 |                      |           |
| 4: Laporan, Menu Customer & Dashboard | /16          | /12               | /0                 |                      |           |
| 5: Transaksi POS, Checkout & Pembayaran | /17        | /10               | /2                 |                      |           |
| Lintas iterasi                     | /0              | /4                | /3                 |                      |           |
