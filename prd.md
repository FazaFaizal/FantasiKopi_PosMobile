# Product Requirements Document (PRD)

## Fantasi Coffee Mobile POS

**Version:** 3.0
**Platform:** Android
**Frontend:** React Native + Expo
**Routing:** Expo Router
**Styling:** NativeWind
**Backend:** Supabase (PostgreSQL, Auth, Storage)

---

# 1. Project Overview

Fantasi Coffee Mobile POS adalah aplikasi mobile berbasis Android yang dikembangkan untuk mendukung operasional Fantasi Coffee dalam mengelola penjualan, product, category, inventory, employee, user account, order, payment, serta pemesanan oleh customer.

Sistem memiliki tiga role utama:

* **Admin**
* **Kasir**
* **Customer**

Sistem dikembangkan secara iteratif dalam empat tahap:

1. Authentication, Employee & User Management
2. Product & Inventory Management
3. POS, Order & Financial Report
4. Customer Ordering & Admin Dashboard

Aplikasi ditujukan untuk meningkatkan efisiensi operasional, mengurangi kesalahan pencatatan pesanan, meningkatkan pengelolaan inventory, serta menyediakan data transaksi yang terstruktur.

---

# 2. Product Goals

## 2.1 Business Goals

Sistem harus membantu Fantasi Coffee untuk:

* Mempercepat proses transaksi penjualan.
* Mengurangi kesalahan pencatatan order.
* Mengurangi ketergantungan pada pencatatan manual.
* Mempermudah pengelolaan product dan category.
* Membantu pengelolaan inventory.
* Mendigitalisasi pencatatan order dan payment.
* Menyediakan laporan penjualan dan keuangan.
* Menyediakan kanal pemesanan bagi customer.
* Membantu Admin memantau kondisi operasional melalui dashboard.
* Menyediakan data operasional yang terstruktur untuk mendukung pengambilan keputusan.

## 2.2 User Goals

Sistem harus memungkinkan pengguna untuk:

* Mendaftar akun secara mandiri (khusus Customer).
* Login menggunakan akun yang dimiliki.
* Mengakses fitur berdasarkan role.
* Melakukan aktivitas sesuai dengan hak akses.
* Melakukan transaksi dengan cepat dan mudah.
* Melihat dan memilih product.
* Melakukan checkout dan payment.
* Melihat status order.

---

# 3. User Roles

Sistem memiliki tiga role:

* Admin
* Kasir
* Customer

Role merupakan bagian dari **User Account** dan menentukan hak akses terhadap fitur sistem.

## 3.1 Admin

Admin merupakan pengguna internal yang memiliki akses terhadap pengelolaan dan pemantauan operasional sistem.

Admin dapat:

* Login dan logout.
* Mengakses Admin Dashboard.
* Mengelola Employee.
* Mengelola User Account.
* Menetapkan role pada User Account.
* Mengelola Category.
* Mengelola Product.
* Mengelola Inventory, termasuk menghapus bahan baku.
* Mengelola Order, termasuk membatalkan Order dan memproses refund.
* Mengelola Payment.
* Mengelola Expense.
* Melihat laporan penjualan.
* Melihat laporan keuangan.
* Mengakses profil.

Admin merupakan satu-satunya role yang dapat mengakses Dashboard.

## 3.2 Kasir

Kasir merupakan pengguna internal yang bertanggung jawab menjalankan proses penjualan melalui POS.

Kasir dapat:

* Login dan logout.
* Mengakses POS.
* Melihat Product.
* Mencari Product.
* Memfilter Product berdasarkan Category.
* Menambahkan Product ke Cart.
* Mengubah quantity Product.
* Menghapus Product dari Cart.
* Memilih jenis Order.
* Memproses Payment.
* Menyelesaikan Order.
* Melihat seluruh Order, termasuk Order dari Customer.
* Mengubah status Order.
* Membatalkan Order dan memproses refund.
* Mengelola Inventory, kecuali menghapus bahan baku.
* Mengakses profil.

Kasir tidak dapat:

* Mengakses Admin Dashboard.
* Mengelola Employee.
* Mengelola User Account.
* Mengelola Category.
* Mengelola Product.
* Menghapus bahan baku.
* Mengelola Expense.
* Mengakses laporan keuangan.
* Mengubah konfigurasi sistem.

## 3.3 Customer

Customer merupakan pengguna yang melakukan pemesanan Product melalui aplikasi.

Customer dapat:

* Mendaftar akun secara mandiri.
* Login dan logout.
* Melihat Category.
* Melihat Product.
* Melihat detail Product.
* Mencari Product.
* Memfilter Product.
* Mengelola Cart.
* Melakukan Checkout.
* Memilih jenis Order.
* Memilih Payment Method yang tersedia.
* Melihat konfirmasi Order.
* Melihat status Order.
* Mengakses profil.

Customer tidak dapat mengakses fitur internal pengelolaan sistem.

---

# 4. Employee & User Account

Employee dan User Account merupakan dua entitas yang berbeda.

## 4.1 Employee

Employee merupakan data karyawan Fantasi Coffee.

Data Employee digunakan untuk menyimpan informasi karyawan dan tidak secara otomatis berarti karyawan tersebut memiliki akses ke aplikasi.

Data Employee memiliki:

* Nama.
* Nomor telepon.
* Email (opsional).
* Jabatan atau posisi.
* Tanggal mulai bekerja.
* Status karyawan (Aktif / Nonaktif).

## 4.2 User Account

User Account merupakan akun yang digunakan untuk login dan mengakses aplikasi.

User Account memiliki:

* Informasi identitas akun.
* Email atau identifier login.
* Role.
* Status akun.
* Relasi dengan Employee untuk akun internal.

User Account internal dapat terhubung dengan Employee.

Contoh:

```text
Employee
├── Nama: Ahmad
├── Posisi: Kasir
└── Status: Aktif

User Account
├── Email: ahmad@example.com
├── Role: Kasir
├── Status: Aktif
└── Employee: Ahmad
```

Tidak semua Employee harus memiliki User Account.

Aturan relasi (ditegakkan aplikasi dan database):

* **Akun karyawan** (Admin/Kasir) dibuat berdasarkan data Employee: setiap akun karyawan wajib terhubung ke tepat satu Employee, dan satu Employee maksimal memiliki satu akun.
* Akun karyawan hanya dapat Aktif bila Employee-nya Aktif.

Customer membuat User Account sendiri melalui fitur registrasi. User Account Customer **terpisah total** dari Employee: tidak dapat dihubungkan ke Employee dan tidak dapat diubah menjadi akun Admin/Kasir (atau sebaliknya). Nama yang diisi saat registrasi tersimpan di profil Customer.

Fitur Guest (pemesanan tanpa akun) belum termasuk versi awal dan dapat dipertimbangkan pada pengembangan berikutnya.

---

# 5. Scope & Development Iteration

Pengembangan sistem dibagi menjadi empat iterasi.

## Iterasi 1 — Authentication, Employee & User

Fokus:

* Login.
* Logout.
* Registrasi akun Customer.
* Authentication.
* Session management.
* Role-based authorization.
* Employee management.
* User Account management.
* Relasi Employee dan User Account.

Output:

* Admin dapat mengelola Employee.
* Admin dapat mengelola User Account.
* Admin dapat menetapkan role.
* Customer dapat mendaftar akun sendiri.
* User dapat login sesuai role.
* Sistem membatasi akses berdasarkan role.

---

## Iterasi 2 — Product & Inventory

Fokus:

* Category management.
* Product management.
* Product availability (Tersedia / Tidak Tersedia).
* Inventory (bahan baku) management.
* Pencatatan perubahan stok secara manual (Stock In, Stock Out, Stock Adjustment).
* Status stok bahan baku berdasarkan Minimum Stock.

Output:

* Admin dapat mengelola Category.
* Admin dapat mengelola Product.
* Admin dapat mengatur ketersediaan Product.
* Admin dan Kasir dapat mengelola bahan baku.
* Admin dan Kasir dapat mencatat perubahan stok secara manual.
* Setiap perubahan stok tercatat dalam riwayat.
* Sistem menampilkan status Low Stock dan Out of Stock pada bahan baku.

---

## Iterasi 3 — POS, Order & Financial Report

Fokus:

* POS.
* Cart.
* Order.
* Order Item.
* Payment.
* Pembatalan dan refund Order.
* Transaction history.
* Expense.
* Sales report.
* Financial report.

Output:

* Kasir dapat membuat Order.
* Kasir dapat memproses Payment.
* Kasir dapat mengubah status Order.
* Admin dan Kasir dapat membatalkan Order dan memproses refund.
* Sistem menyimpan Order dan Order Item.
* Sistem mencatat Payment.
* Admin dapat melihat laporan penjualan.
* Admin dapat melihat laporan keuangan.

---

## Iterasi 4 — Customer Ordering & Admin Dashboard

Fokus:

* Customer Product browsing.
* Customer Cart.
* Customer Checkout.
* Customer Payment.
* Order status.
* Admin Dashboard.

Output:

* Customer dapat melakukan pemesanan.
* Customer dapat melihat status Order.
* Admin dapat melihat kondisi operasional melalui Dashboard.
* Dashboard menggunakan data aktual dari sistem.

---

# 6. Functional Requirements

## 6.1 Authentication

Sistem harus menyediakan:

* Login menggunakan email dan password.
* Validasi credential.
* Show/hide password.
* Pesan error ketika credential tidak valid.
* Penyimpanan session setelah login.
* Identifikasi role setelah login.
* Redirect berdasarkan role.
* Logout.
* Penanganan session yang tidak valid atau expired.

Redirect:

```text
Admin     → Admin Dashboard
Kasir     → POS
Customer  → Customer Product
```

Password tidak dikelola sebagai data bisnis biasa pada User Account.

## 6.2 Customer Registration

Customer dapat membuat akun sendiri melalui halaman Register.

Data registrasi:

* Nama.
* Email.
* Password.
* Konfirmasi password.

Aturan:

* Email harus unik dan belum terdaftar.
* Password dan konfirmasi password harus sama.
* Akun hasil registrasi otomatis memiliki role **Customer** dan status **Aktif**.
* Role Admin dan Kasir tidak dapat dibuat melalui registrasi.
* Setelah registrasi berhasil, Customer diarahkan ke halaman Customer Product atau ke halaman Login.

---

# 7. Employee Management

Employee Management hanya dapat diakses oleh Admin.

Admin dapat:

* Melihat daftar Employee.
* Mencari Employee.
* Menambahkan Employee.
* Mengubah data Employee.
* Melihat detail Employee.
* Menonaktifkan Employee.
* Melihat status Employee.

Employee yang dinonaktifkan tidak dapat digunakan untuk akun internal baru.

Ketika Employee dinonaktifkan, User Account yang terhubung dengannya ikut dinonaktifkan sehingga tidak dapat login.

Ketika Employee diaktifkan kembali, User Account-nya **tetap nonaktif** dan harus diaktifkan secara manual oleh Admin di menu Akun Pengguna.

Employee tidak dapat dihapus permanen. Employee hanya dapat dinonaktifkan agar riwayat Order dan aktivitas sistem yang terkait tetap valid. Aturan ini juga ditegakkan oleh database.

Data Employee mencakup tanggal mulai bekerja (opsional, tidak boleh di masa depan). Dari daftar Employee, Admin dapat langsung membuat akun login untuk Employee aktif yang belum memiliki akun.

---

# 8. User Account Management

User Account Management hanya dapat diakses oleh Admin.

Admin dapat:

* Melihat daftar User Account.
* Mencari User Account.
* Membuat User Account internal (Admin dan Kasir).
* Mengubah informasi User Account.
* Menetapkan role.
* Mengaktifkan atau menonaktifkan User Account, termasuk akun Customer.
* Menghubungkan User Account dengan Employee.
* Melihat status akun.

User Account Customer dibuat oleh Customer melalui registrasi (lihat 6.2), bukan oleh Admin.

Pembuatan User Account internal dilakukan di sisi server (Edge Function `create-staff-user`) agar:

* Sesi Admin yang sedang login tidak tergantikan oleh akun baru.
* Role (Admin/Kasir) dan relasi Employee langsung tersimpan; jika gagal, akun dibatalkan (rollback).
* Akun langsung aktif tanpa perlu konfirmasi email.

Role yang tersedia:

```text
Admin
Kasir
Customer
```

Role bersifat tetap dan bukan merupakan data yang dapat dibuat atau dihapus oleh Admin.

Aturan perubahan User Account:

* Akun karyawan dibuat dengan memilih Employee aktif yang belum memiliki akun (wajib).
* Role akun karyawan dapat diubah antara Admin dan Kasir. Akun Customer tidak dapat diubah menjadi Admin/Kasir, dan sebaliknya.
* Admin tidak dapat mengubah role atau menonaktifkan akunnya sendiri; perubahan tersebut dilakukan oleh Admin lain. Admin aktif terakhir juga tidak dapat dihapus, diturunkan, atau dinonaktifkan.
* Perubahan status akun berlaku di aplikasi pengguna saat aplikasi dibuka kembali.

---

# 9. Category Management

Category Management hanya dapat diakses oleh Admin.

Admin dapat:

* Melihat Category.
* Menambahkan Category.
* Mengubah Category.
* Menonaktifkan Category apabila tidak memiliki Product yang terhubung.
* Mengaktifkan kembali Category.
* Menghapus Category apabila tidak memiliki Product yang terhubung.

Category memiliki:

* Name.
* Description.
* Status.

Category yang tidak aktif tidak dapat digunakan untuk Product baru.

Aturan status Category:

* Category tidak dapat dinonaktifkan selama masih ada Product yang terhubung. Admin harus memindahkan Product ke Category lain atau menghapus Product terlebih dahulu.
* Product tidak dapat ditambahkan, dipindahkan, atau diaktifkan kembali ke Category yang nonaktif.
* Dengan aturan ini, setiap Product yang tampil di POS dan menu Customer selalu berada di Category aktif. Aturan ditegakkan oleh aplikasi dan database.

---

# 10. Product Management

Product Management hanya dapat diakses oleh Admin.

Admin dapat:

* Melihat Product.
* Menambahkan Product.
* Mengubah Product.
* Melihat detail Product.
* Mengubah status ketersediaan Product.
* Mencari Product.
* Memfilter Product berdasarkan Category dan status.

Product memiliki:

* Name.
* Description.
* Category.
* Price.
* Image.
* Status.

Status Product:

```text
Tersedia
Tidak Tersedia
```

Status Product diatur secara manual dan tidak dihitung dari stok bahan baku.

Kasir hanya dapat mengubah status ketersediaan Product (Tersedia / Tidak Tersedia). Perubahan data Product lain (nama, harga, kategori, gambar, aktif/nonaktif) hanya dapat dilakukan Admin dan ditegakkan oleh sistem.

Product dengan status Tidak Tersedia tetap ditampilkan, tetapi tidak dapat ditambahkan ke Cart atau digunakan untuk membuat Order baru.

Penghapusan Product menggunakan metode **Hard Delete dengan Snapshot Pattern**:
* Baris Product dihapus secara permanen dari database Supabase (`DELETE FROM products`).
* Riwayat Product yang telah digunakan dalam Order tetap terjaga keutuhannya melalui data snapshot pada tabel `order_items` (`product_id REFERENCES products(id) ON DELETE SET NULL`, `product_name TEXT NOT NULL`, `unit_price NUMERIC NOT NULL`).
* Dengan pola snapshot ini, tabel katalog produk di database tetap bersih dan sinkron, sementara struk pesanan dan laporan penjualan historis tetap menampilkan nama menu dan harga aslinya saat transaksi terjadi.

---

# 11. Inventory Management

Inventory digunakan untuk memantau dan mencatat kondisi stok bahan baku yang digunakan oleh Fantasi Coffee.

Inventory tidak terintegrasi dengan penjualan Product. Penjualan Product tidak mengurangi stok bahan baku secara otomatis. Seluruh perubahan stok dicatat secara manual oleh Admin atau Kasir.

## 11.1 Data Bahan Baku

Bahan baku memiliki:

* Nama.
* Satuan (misalnya gram, ml, pcs).
* Stok saat ini.
* Minimum Stock.
* Status stok.
* Keterangan (opsional).

## 11.2 Status Stok Bahan Baku

Status stok dihitung otomatis oleh sistem berdasarkan stok saat ini dan Minimum Stock:

| Status | Kondisi |
|---|---|
| Aman | Stok saat ini > Minimum Stock |
| Low Stock | 0 < Stok saat ini ≤ Minimum Stock |
| Out of Stock | Stok saat ini = 0 |

Status diperbarui setiap kali terjadi perubahan stok atau perubahan Minimum Stock. Status tidak dapat diubah secara manual.

## 11.3 Hak Akses

| Aksi | Admin | Kasir | Customer |
|---|:---:|:---:|:---:|
| Melihat daftar dan detail bahan baku | ✓ | ✓ | ✗ |
| Menambahkan bahan baku | ✓ | ✓ | ✗ |
| Mengubah informasi bahan baku | ✓ | ✓ | ✗ |
| Menentukan Minimum Stock | ✓ | ✓ | ✗ |
| Mencatat Stock In | ✓ | ✓ | ✗ |
| Mencatat Stock Out | ✓ | ✓ | ✗ |
| Melakukan Stock Adjustment | ✓ | ✓ | ✗ |
| Melihat riwayat perubahan stok | ✓ | ✓ | ✗ |
| Menghapus bahan baku | ✓ | ✗ | ✗ |
| Mengubah atau menghapus riwayat stok | ✗ | ✗ | ✗ |

Penghapusan bahan baku menggunakan metode **Hard Delete dengan Snapshot Pattern (Admin Only)**:
* Baris bahan baku dihapus secara fisik dari tabel `inventory_items` di database Supabase (`DELETE FROM inventory_items`).
* Riwayat perubahan stok pada tabel `stock_movements` tetap tersimpan utuh dan terlindungi melalui relasi `inventory_id REFERENCES inventory_items(id) ON DELETE SET NULL` serta kolom data snapshot (`item_name TEXT NOT NULL`, `item_unit TEXT NOT NULL`, `user_name TEXT`).
* Kasir dilarang keras menghapus bahan baku (hanya Admin yang memiliki hak akses hapus).
* Sistem tidak menggunakan soft delete untuk bahan baku.

---

# 12. Stock Movement

Perubahan stok hanya dapat dilakukan oleh Admin dan Kasir, dan selalu dicatat secara manual.

## 12.1 Stock In

Digunakan untuk mencatat penambahan stok bahan baku, misalnya:

* Pembelian bahan baku.
* Restock.
* Penerimaan bahan baku.

Stock In tidak otomatis tercatat sebagai Expense. Namun saat mencatat Stock In, Admin atau Kasir **dapat menandainya sebagai pembelian** dan mengisi total harga untuk bahan tersebut. Jika ditandai:

* Sistem mencatat mutasi stok dan Expense sekaligus dalam satu transaksi (tidak mungkin hanya salah satu yang tersimpan).
* Expense dibuat dengan kategori Raw Material, deskripsi otomatis "Pembelian <bahan> <jumlah> <satuan>", tanggal hari ini (WITA), dan terhubung ke Stock In tersebut.
* Satu Stock In paling banyak memiliki satu Expense, sehingga biaya tidak tercatat ganda.
* Stock In yang bukan pembelian (pemberian, retur, dan sebagainya) cukup tidak ditandai.

## 12.2 Stock Out

Digunakan untuk mencatat pengurangan stok bahan baku, misalnya:

* Pemakaian bahan untuk operasional harian.
* Bahan rusak.
* Bahan terbuang atau kedaluwarsa.

## 12.3 Stock Adjustment

Digunakan untuk menyesuaikan jumlah stok berdasarkan kondisi aktual, misalnya:

* Hasil stock opname.
* Kesalahan pencatatan.
* Selisih antara stok sistem dan stok fisik.

## 12.4 Aturan Perubahan Stok

* Stok tidak dapat bernilai negatif. Stock Out atau Stock Adjustment yang membuat stok di bawah 0 ditolak.
* Jumlah perubahan harus lebih besar dari 0. Untuk Stock Adjustment (opname), yang diisi adalah stok fisik aktual; nilai 0 diperbolehkan (bahan habis), sedangkan nilai yang sama dengan stok sistem ditolak.
* Riwayat perubahan stok tidak dapat diubah atau dihapus.
* Angka stok hanya dapat berubah melalui riwayat mutasi (Stock In, Stock Out, Stock Adjustment). Mengubah angka stok secara langsung ditolak sistem, termasuk oleh Admin.
* Stok sebelum dan sesudah dihitung oleh sistem (database) dengan mengunci data bahan baku, sehingga dua perubahan bersamaan tidak saling menimpa.

Setiap perubahan stok mencatat:

* Bahan baku.
* Jenis perubahan (Stock In / Stock Out / Stock Adjustment).
* Jumlah perubahan.
* Stok sebelum dan sesudah perubahan.
* Waktu perubahan.
* User yang melakukan perubahan.
* Keterangan (wajib untuk Stock Out dan Stock Adjustment).

---

# 13. POS

POS hanya dapat digunakan oleh Kasir.

Kasir dapat:

* Melihat Product.
* Mencari Product.
* Memfilter Product berdasarkan Category.
* Menambahkan Product ke Cart.
* Menambah quantity.
* Mengurangi quantity.
* Menghapus Product.
* Melihat subtotal.
* Melihat total.
* Memilih jenis Order.
* Memasukkan nama Customer (opsional) untuk identifikasi pesanan.
* Memproses Payment.
* Menyelesaikan Order.

Product dengan status Tidak Tersedia tidak dapat ditambahkan ke Cart.

Jenis Order:

```text
Dine-in
Takeaway
```

Untuk Dine-in, sistem dapat mencatat nomor meja (opsional).

Delivery tidak termasuk dalam versi awal sistem.

---

# 14. Cart

Cart digunakan untuk menyimpan Product yang akan dipesan.

Cart harus mendukung:

* Add Product.
* Increase quantity.
* Decrease quantity.
* Remove Product.
* Clear Cart.
* Menghitung subtotal.
* Menghitung total.

Cart tidak dianggap sebagai Order sampai proses Checkout berhasil.

---

# 15. Order

Order merupakan data pemesanan yang dibuat melalui POS atau Customer Ordering.

Order memiliki informasi:

* Order number.
* Customer/User.
* Order type.
* Order items.
* Subtotal.
* Total.
* Order status.
* Payment status.
* Waktu Order.

Order Item menyimpan:

* Product.
* Quantity.
* Price saat Order dibuat.
* Subtotal.

Harga Product yang tersimpan pada Order Item merupakan harga saat Order dibuat sehingga perubahan harga Product tidak mengubah riwayat Order sebelumnya.

## 15.1 Pengelolaan Order oleh Admin

Admin dapat:

* Melihat seluruh Order beserta detailnya.
* Membatalkan Order.
* Memproses refund.
* Melihat dan mengoreksi data Payment.

Implementasi: halaman Pesanan Admin memakai layar yang sama dengan Riwayat Pesanan Kasir (filter, detail, konfirmasi pembayaran, pembatalan/refund). Daftar dimuat bertahap (50 Order per halaman, tombol "Muat lebih banyak"), dan filter tanggal "Hari ini" mengikuti hari bisnis WITA.

Koreksi data Payment:

* Hanya Admin yang dapat mengubah Payment Method (Tunai / QRIS / Debit) pada Order yang sudah Paid, misalnya bila kasir salah memilih metode.
* Setiap koreksi otomatis dicatat pada catatan Order: siapa yang mengoreksi serta metode lama → baru. Aturan ini ditegakkan oleh database, sehingga Kasir tidak dapat mengubah Payment Method.
* Koreksi ikut menyesuaikan rekap kas sif yang masih aktif; sif yang sudah ditutup tidak berubah.

---

# 16. Payment

> **Catatan:** Customer dapat membayar dengan QRIS online melalui payment gateway Midtrans (lihat "Pembayaran QRIS Online" di bawah) atau membayar di kasir.

Payment merupakan data pembayaran yang berkaitan dengan Order.

Payment dapat dikelola oleh Admin.

Payment Method versi awal:

```text
Tunai
QRIS
Debit
```

Hanya pembayaran Tunai yang masuk ke laci kas. QRIS dan Debit (mesin EDC) adalah pembayaran non-tunai: dicatat terpisah pada rekap kas dan sif, serta tidak mengurangi atau menambah uang laci (termasuk saat refund).

Untuk Cash:

1. Sistem menampilkan total pembayaran.
2. Kasir memasukkan jumlah uang yang diterima.
3. Sistem menghitung kembalian.
4. Order dapat diselesaikan setelah pembayaran valid.

Payment memiliki status:

```text
Pending
Paid
Failed
Refunded
```

Hanya empat nilai ini yang disimpan di database (nilai lama `Lunas` dan `Batal` tidak digunakan lagi). Tampilan memakai label Bahasa Indonesia:

| Status | Label |
|---|---|
| Paid | Lunas |
| Pending | Belum Dibayar (atau Tidak Dibayar jika Order Cancelled) |
| Refunded | Dikembalikan |
| Failed | Gagal |

Pembayaran Customer di kasir:

1. Order Customer selalu dibuat dengan Payment Status **Pending**, baik Tunai maupun QRIS. Customer tidak dapat menandai pembayarannya sendiri sebagai Paid.
2. Customer membayar di kasir (tunai, atau scan QRIS kedai dan menunjukkan bukti).
3. Kasir memverifikasi (uang diterima / mutasi QRIS masuk di aplikasi merchant) lalu menekan **Konfirmasi Pembayaran**. Untuk order Pending, aksi ini sekaligus menerima order (Payment Status → Paid, Order Status → Processing).
4. **Batas bayar 15 menit.** Order Customer harus dibayar di kasir paling lambat 15 menit setelah dibuat (`payment_due_at`, diisi database dan tidak dapat diperpanjang). Lewat batas itu:
   * Order dibatalkan otomatis (Order Status Cancelled, Payment Status tetap Pending karena tidak ada uang yang berpindah) dengan alasan "Otomatis dibatalkan: tidak dibayar dalam 15 menit."
   * Kasir tidak dapat lagi menerima pembayarannya (ditolak database). Bila Customer tetap ingin membeli, kasir membuat order baru lewat POS.
   * Pembatalan otomatis dijalankan database tiap menit (pg_cron) dan juga setiap kali daftar pesanan dimuat.
5. Customer melihat hitung mundur sisa waktu bayar; kasir melihat sisa waktu pada daftar pesanan.
6. Saat Customer membuat order, kasir dan Admin langsung mendapat notifikasi di layar mana pun (realtime), dan menu Pesanan menampilkan jumlah order yang menunggu pembayaran.

Pembayaran QRIS Online (payment gateway Midtrans Snap):

1. Saat checkout, Customer memilih **QRIS Online** atau bayar di kasir (Tunai / QRIS di kasir / Debit).
2. Untuk QRIS Online, order dibuat dengan Payment Status Pending, lalu server membuat transaksi QRIS di Midtrans (Core API) dan aplikasi menampilkan **gambar QR** pada layar "Bayar QRIS" milik aplikasi, lengkap dengan total pembayaran, hitung mundur, dan petunjuk membayar. Batas bayar **3 menit**. Layar otomatis berganti menjadi "Pembayaran Berhasil" begitu order lunas, atau "Batas Waktu Habis" bila kedaluwarsa.
3. Setelah Customer membayar, Midtrans mengirim notifikasi ke server (webhook). Server memverifikasi tanda tangan notifikasi dan memeriksa ulang status ke Midtrans, lalu menandai order **Paid** dan **Processing**.
4. Order QRIS Online **tidak tampil di kasir sebelum lunas**. Setelah lunas, kasir mendapat notifikasi "Pesanan online lunas" dan langsung menyiapkan pesanan.
5. Bila QR tidak dibayar sampai batas waktu, order dibatalkan otomatis (Payment Status Failed). Customer tidak dapat membatalkan order QRIS Online secara manual, untuk mencegah order dibatalkan tetapi QR tetap dibayar.
6. Kasir tidak dapat menandai order QRIS Online sebagai lunas secara manual; hanya notifikasi Midtrans yang terverifikasi yang dapat melunasinya. Nominal dari Midtrans harus sama dengan total order.
7. Pembayaran QRIS Online tidak masuk laci kas dan tidak memerlukan sif kasir yang terbuka. Refund order QRIS Online dilakukan lewat dashboard Midtrans.
8. Server key Midtrans hanya disimpan di server (Supabase Secrets), tidak pernah di aplikasi. Versi tugas akhir memakai mode Sandbox Midtrans.

---

# 17. Order Status

Order memiliki status:

```text
Pending
Processing
Ready
Completed
Cancelled
```

Alur normal:

```text
Pending
   ↓
Processing
   ↓
Ready
   ↓
Completed
```

Perubahan status pada alur normal hanya dapat dilakukan oleh Kasir, baik untuk Order dari POS maupun dari Customer.

Status Order harus menunjukkan kondisi aktual Order dan tidak boleh hanya digunakan sebagai status pembayaran.

Payment Status dan Order Status merupakan dua informasi yang berbeda.

Gerbang pembayaran: Order tidak dapat berstatus Processing, Ready, atau Completed sebelum Payment Status lunas (Paid). Aturan ini ditegakkan oleh database, sehingga kedai tidak menyiapkan pesanan yang belum dibayar.

Kasir dapat menyelesaikan sekaligus seluruh Order berstatus Ready yang sudah lunas (aksi "Selesaikan Pesanan Siap").

## 17.1 Pembatalan dan Refund

Pembatalan dan refund dapat dilakukan oleh Admin dan Kasir. Customer dapat membatalkan Order miliknya sendiri selama Order masih Pending dan belum dibayar (lihat bagian 26).

Aturan:

* Order dengan status Pending, Processing, atau Ready dapat dibatalkan dan statusnya berubah menjadi Cancelled.
* Order dengan status Completed atau Cancelled tidak dapat dibatalkan.
* Jika Order yang dibatalkan sudah berstatus Paid, refund diproses dan Payment Status berubah menjadi Refunded.
* Jika Order yang dibatalkan belum dibayar, Payment Status tetap Pending (tidak ada uang yang berpindah); pembatalan tercatat pada Order Status Cancelled.
* Setiap pembatalan dan refund mencatat user yang melakukan, waktu, dan alasan.
* Pembatalan Order tidak memengaruhi stok bahan baku karena Inventory tidak terintegrasi dengan penjualan.

---

# 18. Order Data Consistency

Ketika Order berhasil diselesaikan sesuai aturan Payment:

1. Sistem memastikan Order valid.
2. Sistem memastikan seluruh Product pada Order berstatus Tersedia.
3. Sistem menyimpan Order.
4. Sistem menyimpan Order Item.
5. Sistem mencatat Payment.
6. Sistem memperbarui status Order.

Proses tersebut harus dilakukan secara konsisten sehingga tidak terjadi kondisi seperti:

* Order tersimpan tetapi Order Item tidak tersimpan.
* Payment berhasil tetapi Order tidak tercatat.
* Order tercatat tetapi Payment tidak tercatat.

Implementasi: Order dan seluruh Order Item disimpan dalam satu transaksi database (`create_order`). Harga, subtotal, dan total dihitung dari data Product di database, bukan dari aplikasi; jika salah satu item tidak valid (misalnya Product sudah Tidak Tersedia), seluruh Order dibatalkan sehingga tidak ada Order tanpa item.

---

# 19. Transaction History

Admin dan Kasir dapat melihat riwayat Order.

Informasi yang dapat ditampilkan:

* Order number.
* Waktu Order.
* Customer.
* Order type.
* Total.
* Payment Method.
* Payment Status.
* Order Status.

Admin dan Kasir dapat melihat seluruh Order. Kasir membutuhkan akses ini untuk memproses Order dari Customer, mengubah status Order, serta melakukan pembatalan dan refund.

Hanya Admin yang dapat mengoreksi data Payment.

---

# 20. Expense Management

Expense hanya dapat dikelola oleh Admin. Pengecualian: Kasir dapat menghasilkan Expense pembelian bahan baku melalui Stock In yang ditandai sebagai pembelian (lihat Section 12.1); mengubah dan menghapus Expense tetap hanya dapat dilakukan Admin.

Expense mencatat uang yang dikeluarkan pada hari tersebut, termasuk yang dibayar menggunakan pemasukan hari itu.

Setiap Expense memiliki penanda **Dibayar dari kas laci** (default: ya). Admin dapat mematikannya untuk pengeluaran yang dibayar lewat transfer atau sumber lain, sehingga tidak mengurangi perhitungan uang laci.

Kasir dapat mencatat pengeluaran harian (misalnya es batu, gas, parkir) dengan aturan:

* Tanggal selalu hari ini (WITA) dan dianggap dibayar dari kas laci.
* Tercatat atas nama Kasir yang mencatat.
* Kasir hanya dapat melihat pengeluaran hari ini; mengubah dan menghapus tetap hanya Admin.

## 20.1 Kas Harian

Kasir dan Admin dapat melihat rekap kas hari ini (WITA). Penjualan masuk rekap pada hari pembayarannya diterima, sama dengan sif dan laporan:

```text
Penjualan Tunai (order lunas & tidak Cancelled)
- Pengeluaran dari kas laci
------------------------------------------------
Uang seharusnya di laci
```

Rekap juga menampilkan penjualan QRIS (tidak masuk laci), pengeluaran dari sumber lain, dan jumlah order yang belum dibayar. Pencocokan uang fisik dilakukan saat tutup sif (Section 20.2).

## 20.2 Sif Kasir (Buka / Tutup Sif)

Fantasi Coffee memakai satu laci kas dengan sif bergantian (misalnya sif pagi dan sif malam). Uang di laci terakumulasi lintas sif sampai disetor.

Aturan:

* Hanya ada satu sif aktif dalam satu waktu.
* POS terkunci sampai sif dibuka. Menerima pembayaran, memproses refund, dan mencatat pengeluaran dari kas (termasuk Stock In pembelian) oleh Kasir ditolak jika tidak ada sif aktif.
* **Buka sif:** Kasir mengisi modal awal di laci. Sistem menyarankan modal awal = uang dihitung − uang disetor pada sif terakhir. Jika berbeda, Kasir wajib mengisi catatan.
* Uang tunai masuk ke sif saat pembayaran diterima (bukan saat order dibuat); refund tunai mengurangi kas pada sif tempat refund dilakukan.
* Kas seharusnya = modal awal + tunai diterima − refund tunai − pengeluaran dari kas.
* **Tutup sif:** Kasir menghitung uang fisik di laci dan (opsional) mengisi uang yang disetor/diambil. Jika ada selisih, catatan wajib diisi. Sisa uang (dihitung − disetor) menjadi modal awal sif berikutnya.
* Sif dapat ditutup oleh Kasir yang membukanya atau oleh Admin (misalnya sif yang lupa ditutup).
* Riwayat sif (modal, kas seharusnya, uang dihitung, disetor, selisih, dan catatan) tidak dapat diubah dan dapat dilihat Admin.

Admin dapat:

* Melihat Expense.
* Menambahkan Expense.
* Mengubah Expense.
* Menghapus Expense setelah konfirmasi.
* Memfilter Expense berdasarkan periode.
* Mengelompokkan Expense berdasarkan category.

Expense category:

```text
Raw Material
Operational
Equipment
Other
```

Expense memiliki:

* Description.
* Category.
* Amount.
* Date.
* Creator.
* Stock In terkait (jika berasal dari Stock In pembelian).
* Created At.
* Updated At.

---

# 21. Sales Report

Admin dapat melihat laporan penjualan berdasarkan periode.

Laporan penjualan menghitung Order yang **sudah lunas (Paid) dan tidak Cancelled**, apa pun status dapurnya (Processing, Ready, atau Completed). Order Cancelled dan Order yang belum dibayar tidak dihitung.

Alasan: penjualan diakui saat uang diterima. Jika omzet hanya dihitung dari status Completed, order yang sudah dibayar tetapi lupa ditutup kasir tidak masuk laporan sehingga omzet tercatat lebih kecil dari uang yang diterima.

Tanggal penjualan adalah **waktu pembayaran diterima** (`paid_at`), bukan waktu order dibuat. Contoh: order dibuat 23:50 dan dibayar 00:10 keesokan harinya tercatat pada hari kedua, sama dengan rekap sif dan Kas Harian. Order lama yang belum memiliki `paid_at` memakai waktu order dibuat.

Informasi minimal:

* Total Order.
* Total Product terjual.
* Total Sales.
* Product terlaris.
* Sales berdasarkan periode.

Filter berdasarkan:

* Hari.
* Rentang tanggal.

Laporan dihitung oleh database untuk periode yang dipilih, sehingga tetap akurat berapa pun jumlah transaksinya.

Zona waktu: seluruh batas "hari" di sistem (laporan, dashboard, kas harian, sif, nomor order, tanggal Expense) memakai zona waktu kedai, yaitu **WITA (Asia/Makassar, UTC+8)**, bukan zona waktu perangkat.

---

# 22. Financial Report

Financial Report hanya dapat diakses oleh Admin.

Ringkasan keuangan menggunakan:

```text
Total Sales
- Total Expense
----------------
Net Result
```

Total Sales dihitung dari total Order yang **sudah lunas dan tidak Cancelled** pada periode yang dipilih (aturan yang sama dengan Sales Report).

Total Expense dihitung dari Expense yang dicatat manual pada periode yang dipilih. Stock In tidak otomatis menjadi Expense.

Sistem tidak boleh menghitung Sales dan Income sebagai dua sumber pemasukan yang berbeda apabila keduanya berasal dari transaksi yang sama.

Laporan harus menggunakan data Order dan Expense yang tercatat di sistem.

---

# 23. Customer Product

Customer dapat:

* Melihat Category.
* Melihat Product.
* Mencari Product.
* Memfilter Product berdasarkan Category.
* Melihat detail Product.
* Melihat harga Product.
* Melihat status ketersediaan Product.

Product dengan status Tidak Tersedia tidak dapat dipesan.

Aturan tampilan Product (berlaku di POS dan menu Customer):

* Product **nonaktif** tidak ditampilkan sama sekali.
* Product **Tidak Tersedia (habis)** tetap ditampilkan tetapi dalam keadaan disabled (tidak dapat ditambahkan ke Cart). Di POS, kasir mengubah status lewat toggle ketersediaan pada kartu Product.

---

# 24. Customer Cart

Customer dapat:

* Menambahkan Product.
* Mengubah quantity.
* Menghapus Product.
* Melihat subtotal.
* Melihat total.
* Mengosongkan Cart.

Cart Customer harus tetap konsisten selama proses pemesanan.

Setiap kali menu dimuat ulang, harga dan ketersediaan item di Cart disesuaikan dengan data terbaru dan Customer diberi tahu perubahannya. Total yang ditagih selalu dihitung database dari harga terbaru; bila berbeda dari Cart, konfirmasi pesanan menampilkan total akhirnya.

---

# 25. Customer Checkout

Flow:

```text
Product
   ↓
Product Detail
   ↓
Cart
   ↓
Checkout
   ↓
Payment
   ↓
Order Confirmation
   ↓
Order Status
```

Checkout menampilkan:

* Product.
* Quantity.
* Subtotal.
* Total.
* Order Type.
* Nama Customer (diambil dari User Account).
* Nomor meja untuk Dine-in (opsional).
* Payment Method.

Batas pesanan Customer (bayar di kasir; POS kasir tidak dibatasi):

* Satu akun Customer hanya boleh memiliki **1 pesanan yang belum dibayar** pada satu waktu. Pesanan baru dapat dibuat setelah pesanan tersebut dibayar, dibatalkan, atau kedaluwarsa (15 menit).
* Jumlah per menu maksimal **99**, dan maksimal **10 menu berbeda** per pesanan.
* Aturan ditegakkan oleh database: Customer hanya dapat membuat pesanan melalui fungsi `create_order` (tidak dapat menulis langsung ke tabel Order), sehingga batas tidak dapat dilewati.

Product Detail: Customer **menahan** kartu menu untuk melihat detail Product (foto besar, nama, Category, harga, status ketersediaan, dan deskripsi lengkap). Detail langsung tertutup saat jari dilepas. Product yang habis tetap dapat dilihat detailnya tetapi tidak dapat dipesan.

Alur Payment untuk Customer mengikuti "Pembayaran Customer" pada Section 16: order dibuat dengan Payment Status Pending dan baru diproses setelah kasir mengonfirmasi pembayaran.

---

# 26. Customer Order Status

Customer dapat melihat status Order miliknya.

Status:

```text
Pending
Processing
Ready
Completed
Cancelled
```

Customer hanya dapat melihat Order yang berkaitan dengan User Account miliknya.

Pembatalan oleh Customer:

* Customer dapat membatalkan Order miliknya selama Order Status Pending dan Payment Status Pending (belum dibayar), dengan mengisi alasan (minimal 3 karakter).
* Setelah kasir mengonfirmasi pembayaran atau Order sudah diproses, Customer tidak dapat membatalkan sendiri dan harus menghubungi kasir.
* Pembatalan dilakukan melalui fungsi database yang mengunci baris Order, sehingga tidak bentrok dengan kasir yang sedang mengonfirmasi pembayaran. Payment Status tetap Pending karena tidak ada uang yang berpindah, dan pembatalan mencatat user, waktu, dan alasan.

---

# 27. Admin Dashboard

Dashboard hanya dapat diakses oleh Admin.

Dashboard menampilkan ringkasan operasional seperti:

### Sales

* Total Sales hari ini (Order lunas & tidak Cancelled).
* Jumlah Order hari ini.
* Jumlah Order yang masih menunggu pembayaran.
* Product terlaris.

### Inventory

* Bahan baku dengan status Low Stock.
* Bahan baku dengan status Out of Stock.

### Financial

* Total Sales.
* Total Expense.
* Net Result.

### Recent Activity

* Order terbaru.
* Aktivitas operasional penting.

Dashboard harus menggunakan data aktual dari sistem.

Implementasi:

* Total Sales, Total Expense, Net Result, dan Product terlaris hari ini dihitung database dengan fungsi yang sama dengan halaman Laporan, sehingga angkanya selalu sama.
* Jumlah order yang menunggu pembayaran mencakup seluruh order Customer yang belum dibayar (tidak hanya yang dibuat hari ini).
* Dashboard dimuat ulang setiap kali dibuka. Jika data gagal dimuat, dashboard menampilkan pesan error dan tombol "Coba lagi", bukan angka 0.
* **Aktivitas Operasional** (Recent Activity) menampilkan kejadian terbaru dari seluruh kedai, dengan filter Semua / Kas / Pesanan / Stok:
  * Buka dan tutup sif, termasuk selisih kas (ditandai peringatan bila tidak sesuai).
  * Pembatalan Order dan refund (beserta pelaku dan alasan), serta pembatalan otomatis karena tidak dibayar dalam 15 menit.
  * Koreksi metode pembayaran oleh Admin (tercatat sebagai riwayat tersendiri).
  * Stock In, Stock Out, dan Stock Adjustment.
  * Pengeluaran (termasuk keterangan bila dibayar dari kas laci).
  Mengetuk aktivitas membuka halaman terkait. Aktivitas hanya dapat dilihat oleh Admin.

---

# 28. Navigation

## Authentication

```text
Splash
  ↓
Session Check
  ↓
Login  ←→  Register (Customer)
  ↓
Role Detection
```

## Admin

```text
Dashboard
Employee
User
Category
Product
Inventory
Order
Kas Harian
Report
Profile
```

## Kasir

```text
POS
Order History
Inventory
Kas Harian
Profile
```

## Customer

```text
Product
Cart
Orders
Profile
```

Navigation harus menyesuaikan role dan tidak menampilkan fitur yang tidak memiliki hak akses.

Halaman Profile (semua role) menampilkan email, role, status, dan tanggal terdaftar; menyediakan ganti password (password lama wajib diverifikasi ulang, password baru minimal 8 karakter dan berbeda dari password lama); serta tombol keluar dengan konfirmasi. Admin dan Kasir membuka Profile dari sidebar; Customer membuka Profile dari tombol di header halaman Product.

---

# 29. UI/UX Requirements

Aplikasi harus memiliki desain yang:

* Sederhana.
* Konsisten.
* Mudah dipahami.
* Memiliki hierarki visual yang jelas.
* Meminimalkan jumlah langkah pada proses transaksi.
* Memberikan feedback terhadap setiap aksi pengguna.
* Menampilkan loading state.
* Menampilkan empty state.
* Menampilkan error state.
* Menampilkan success feedback.

## Theme

```text
Primary:    #D1001F
Secondary:  #F59E0B
Background: #FFF7F5
Surface:    #FFFFFF
Text:       #1F2937
```

Typography:

```text
Heading: Poppins
Body: Inter
```

Border radius:

```text
Card: 24px
Button: 16px
Input: 16px
```

---

# 30. Security Requirements

Sistem harus:

* Menggunakan authentication yang aman.
* Menggunakan HTTPS pada environment production.
* Menyimpan credential/token secara aman.
* Menerapkan role-based authorization.
* Melakukan validasi input.
* Melakukan authorization pada backend/database.
* Tidak mengandalkan pembatasan UI sebagai satu-satunya mekanisme keamanan.
* Menangani session yang expired atau tidak valid.
* Mencegah User mengakses data yang bukan miliknya.
* Mencegah Customer mengakses data internal Admin atau Kasir.

---

# 31. Error & State Handling

Setiap fitur harus menangani minimal:

```text
Loading
Success
Empty
Error
Retry
```

Error harus memberikan informasi yang dapat dipahami pengguna.

Sistem tidak boleh menganggap Order atau Payment berhasil sebelum terdapat konfirmasi keberhasilan dari backend/database.

---

# 32. Offline Handling

Full offline transaction tidak termasuk dalam versi awal.

Ketika tidak terdapat koneksi:

* Sistem menampilkan status koneksi.
* Request dapat gagal dan menampilkan pesan error.
* User dapat melakukan retry.
* Order tidak boleh dianggap berhasil sebelum dikonfirmasi oleh server/backend.

---

# 33. Performance Requirements

Target awal (pada perangkat Android kelas menengah dengan koneksi stabil):

* Startup aplikasi: < 3 detik.
* Perpindahan antar halaman: < 1 detik.
* Hasil pencarian Product tampil: < 1 detik.
* Penyimpanan Order hingga konfirmasi dari backend: < 3 detik.

Target performa dapat dievaluasi kembali selama pengembangan berdasarkan kemampuan perangkat dan kondisi jaringan.

---

# 34. Testing & Test-Driven Development (TDD) Mandate

Setiap pengembangan fitur baru pada Fantasi Coffee Mobile POS **wajib menerapkan metodologi Test-Driven Development (TDD)** dengan framework pengujian Jest.

## 34.1 Metodologi TDD (Red-Green-Refactor)

Pengembangan setiap fitur pada iterasi berjalan harus mengikuti siklus TDD yang ketat:

1. **Red (Tulis Tes Terlebih Dahulu):**
   * Sebelum menulis implementasi layar atau alur database, pengembang wajib mendefinisikan kasus uji di folder `__tests__/`.
   * Kasus uji harus mencakup seluruh skenario keberhasilan, kegagalan validasi, batasan hak akses (RBAC), serta kalkulasi matematis (stok, harga, diskon).
   * Verifikasi bahwa tes gagal terlebih dahulu (*Red*) sebagai bukti bahwa tes benar-benar menguji fungsionalitas yang belum ada.

2. **Green (Implementasi Minimal):**
   * Tulis fungsi logika murni pada modul `lib/` atau komponen terkait seminimal mungkin yang diperlukan untuk membuat seluruh pengujian berhasil (*Pass / Green*).

3. **Refactor (Penyempurnaan & Integrasi):**
   * Rapikan struktur kode, hilangkan duplikasi, integrasikan dengan Supabase dan Expo UI, serta pastikan tidak ada regresi pada tes yang sudah ada.

## 34.2 Pemisahan Logika Murni (Decoupled Business Logic)

Untuk menjamin tes berjalan cepat, deterministik, dan bebas ketergantungan native runtime:
* **Logika Bisnis Wajib Dipisahkan:** Seluruh fungsi kalkulasi (misal `computeStockStatus`, `calculateStockMovement`), validasi form (`validateProductInput`, `validateCategoryInput`), pemfilteran data, dan aturan hak akses (RBAC) wajib diletakkan di modul terpisah dalam folder `lib/`.
* **Testing Komponen Reusable:** Komponen UI bersama (`Badge`, `Button`, `Input`, `ChoiceGroup`, `States`) wajib memiliki unit test visual dan behavioral.

## 34.3 Definition of Done (DoD) untuk Setiap Fitur

Sebuah fitur atau iterasi **dilarang dinyatakan selesai** sebelum memenuhi checklist teknis berikut:
1. `npm test` : Seluruh test suites di Jest lulus 100% (*0 failed*).
2. `npx tsc --noEmit` : Lolos typecheck TypeScript (*0 type errors*).
3. `npx expo lint` : Lolos linter proyek (*0 errors, 0 warnings*).
4. `npx expo-doctor` : Dependensi dan konfigurasi Expo valid.

---

# 35. Iteration Acceptance Criteria

## Iterasi 1

Dianggap selesai apabila:

* Admin dapat login.
* Kasir dapat login.
* Customer dapat mendaftar akun sendiri.
* Customer dapat login.
* Logout berfungsi.
* Role dapat menentukan akses.
* Admin dapat mengelola Employee.
* Menonaktifkan Employee ikut menonaktifkan User Account yang terhubung.
* Admin dapat mengelola User Account.
* User Account dapat dihubungkan dengan Employee.
* User Account memiliki role.
* Unauthorized access ditolak.

## Iterasi 2

Dianggap selesai apabila:

* Admin dapat mengelola Category.
* Admin dapat mengelola Product.
* Product dapat memiliki Category.
* Admin dapat mengatur status Product menjadi Tersedia atau Tidak Tersedia.
* Admin dan Kasir dapat menambahkan, mengubah, dan melihat bahan baku.
* Hanya Admin yang dapat menghapus bahan baku.
* Admin dan Kasir dapat mencatat Stock In, Stock Out, dan Stock Adjustment.
* Setiap perubahan stok tercatat dalam riwayat dan tidak dapat diubah.
* Stock tidak dapat bernilai negatif.
* Status stok bahan baku (Aman, Low Stock, Out of Stock) berubah otomatis sesuai Minimum Stock.

## Iterasi 3

Dianggap selesai apabila:

* Kasir dapat membuat Order.
* Cart dapat digunakan dengan benar.
* Total Order dihitung dengan benar.
* Payment dapat dicatat.
* Order dapat disimpan.
* Order Item tersimpan.
* Kasir dapat mengubah status Order.
* Admin dan Kasir dapat membatalkan Order dan memproses refund.
* Transaction/Order history dapat dilihat.
* Admin dapat melihat Sales Report.
* Admin dapat mengelola Expense.
* Admin dapat melihat Financial Report.

## Iterasi 4

Dianggap selesai apabila:

* Customer dapat melihat Product.
* Customer dapat menggunakan Cart.
* Customer dapat melakukan Checkout.
* Customer dapat membuat Order.
* Customer dapat melihat Order miliknya.
* Customer dapat melihat Order Status.
* Admin Dashboard menampilkan data aktual.
* Dashboard menampilkan informasi Sales, Order, Inventory, dan Financial.

---

# 36. Development Roadmap

```text
ITERASI 1
Authentication
    ↓
Customer Registration
    ↓
Employee
    ↓
User Account
    ↓
Role & Authorization
    ↓
Testing


ITERASI 2
Category
    ↓
Product
    ↓
Inventory (Bahan Baku)
    ↓
Stock Movement
    ↓
Testing


ITERASI 3
POS
    ↓
Cart
    ↓
Order
    ↓
Payment
    ↓
Order Status, Cancel & Refund
    ↓
Expense
    ↓
Sales Report
    ↓
Financial Report
    ↓
Testing


ITERASI 4
Customer Product
    ↓
Customer Cart
    ↓
Checkout
    ↓
Payment
    ↓
Order Status
    ↓
Admin Dashboard
    ↓
Final Testing
```

---

# 37. Out of Scope

Fitur berikut tidak termasuk dalam versi awal:

* Multi-branch.
* Employee attendance.
* Payroll.
* Loyalty program.
* Voucher.
* Discount system.
* Advanced promotion.
* Full offline transaction.
* Thermal printer integration.
* External digital receipt.
* Advanced business analytics.
* Delivery management.
* Payment gateway selain QRIS Online Midtrans (kartu kredit, virtual account, e-wallet langsung).
* Accounting system.
* Multi-payment dalam satu Order.
* Recipe dan pengurangan stok bahan baku otomatis berdasarkan penjualan.
* Guest ordering (pemesanan tanpa akun).

Fitur di luar scope dapat dipertimbangkan pada pengembangan berikutnya.

---

# 38. Project Success Criteria

Project dianggap berhasil apabila:

1. Authentication dan authorization berjalan dengan benar.
2. Customer dapat mendaftar akun sendiri.
3. Admin dapat mengelola Employee dan User Account.
4. Role Admin, Kasir, dan Customer berjalan sesuai hak akses.
5. Admin dapat mengelola Category dan Product.
6. Admin dan Kasir dapat mengelola Inventory dan mencatat perubahan stok secara manual.
7. Kasir dapat melakukan proses POS.
8. Order dan Payment dapat tercatat dengan benar.
9. Pembatalan dan refund Order tercatat dengan benar.
10. Sales Report dapat dihasilkan.
11. Financial Report dapat dihasilkan.
12. Customer dapat melakukan pemesanan.
13. Customer dapat melihat status Order.
14. Admin dapat memantau operasional melalui Dashboard.
15. Sistem tidak mengalami crash pada penggunaan normal.
16. Data transaksi dan inventory tetap konsisten.

---

# 39. Product Principles

Seluruh pengembangan sistem harus mengikuti prinsip:

### 1. Correctness over Convenience

Sistem harus menjaga kebenaran data meskipun implementasinya menjadi sedikit lebih kompleks.

### 2. Business Rules First

Aturan bisnis harus ditentukan sebelum implementasi fitur.

### 3. Role-Based Access

Setiap role hanya mendapatkan akses yang diperlukan.

### 4. Data Integrity

Order, Payment, dan Inventory harus tetap konsisten.

### 5. Simple Before Complex

Fitur harus dibuat sesederhana mungkin selama kebutuhan bisnis telah terpenuhi.

### 6. No Unnecessary Features

Fitur yang tidak dibutuhkan tidak boleh ditambahkan hanya karena secara teknis memungkinkan.

### 7. Incremental Development

Setiap iterasi harus menghasilkan bagian sistem yang dapat diuji.

### 8. Maintainability

Implementasi harus mudah dipahami dan dikembangkan kembali.

### 9. Test Before Done

Sebuah fitur tidak dianggap selesai hanya karena kode berhasil dibuat. Fitur harus memenuhi acceptance criteria dan lolos testing.

