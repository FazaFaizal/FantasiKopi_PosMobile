# Supabase Database - Fantasi Coffee POS

Direktori ini berisi seluruh konfigurasi, migrasi berkala (_migrations_), skema master (_master schema_), dan data awal (_seeds_) untuk backend database PostgreSQL Fantasi Coffee.

---

## 📁 Struktur Direktori

```text
supabase/
├── config.toml         # Konfigurasi lokal Supabase CLI
├── schema.sql          # Master declarative schema lengkap (idempotent)
├── seed.sql            # Master seed data lengkap (Admin, Kategori, Produk, Bahan Baku)
├── migrations/         # Migrasi berurutan (timestamp-versioned)
│   ├── 20261004000000_init_auth_employee.sql       # Iterasi 1: Karyawan, Pengguna, Trigger, RLS
│   ├── 20261004000001_iteration_2_product_inventory.sql # Iterasi 2: Kategori, Produk, Inventaris, Mutasi
│   └── 20261004000002_snapshot_and_orders.sql      # Pola Snapshot & Transaksi POS
└── README.md           # Panduan ini
```

---

## 🗄️ Ringkasan Tabel & Relasi

| Nama Tabel        | Peran / Deskripsi                               | Relasi & Constraint Penting                                                                      |
| :---------------- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `employees`       | Data master tenaga kerja & staf kedai           | Master staf (`status: Aktif / Nonaktif`)                                                         |
| `users`           | Akun pengguna sistem (Admin, Kasir, Customer)   | `id` PK & FK ke `auth.users(id)` (CASCADE), FK ke `employees(id)` (SET NULL)                     |
| `categories`      | Kelompok kategori menu kedai kopi               | Master kategori                                                                                  |
| `products`        | Menu minuman & makanan                          | FK ke `categories(id)` (`ON DELETE RESTRICT`)                                                    |
| `inventory_items` | Master stok bahan baku fisik                    | Tracking stok saat ini & batas minimum (`min_stock`)                                             |
| `stock_movements` | Catatan audit trail mutasi stok (In/Out/Opname) | FK ke `inventory_items(id)` (`ON DELETE SET NULL`) + kolom snapshot                              |
| `orders`          | Header transaksi kasir POS                      | FK ke `users(id)` (`ON DELETE SET NULL`) + kolom snapshot kasir                                  |
| `order_items`     | Rincian menu pada setiap transaksi POS          | FK ke `orders(id)` (`CASCADE`), FK ke `products(id)` (`SET NULL`) + snapshot harga & nama produk |

---

## 🔒 Keamanan & Row-Level Security (RLS)

1. **Anti-Infinite-Recursion:** Pengecekan role Admin menggunakan fungsi `is_admin()` bertipe `SECURITY DEFINER` dengan `SET search_path = public`.
2. **Hierarki Role:**
   - **Admin:** Memiliki akses penuh (CRUD) ke seluruh modul (`employees`, `users`, `categories`, `products`, `inventory_items`, `orders`).
   - **Kasir:** Memiliki akses operasional ke `inventory_items` (baca, catat mutasi), `orders` (baca, buat transaksi), dan tidak memiliki akses ke `employees` / `users`.
   - **Customer:** Hanya dapat melihat produk aktif & kategori, melihat profil sendiri, dan riwayat pesanan milik sendiri.
3. **Pola Snapshot Transaksi:**
   - Jika master produk atau bahan baku diubah/dihapus, data transaksi historis pada `order_items` dan `stock_movements` tetap utuh karena menyimpan snapshot harga, nama, dan satuan saat kejadian.

---

## 🚀 Panduan Eksekusi

### Opsi A: Menggunakan Supabase Dashboard (SQL Editor)

1. Buka project di **Supabase Dashboard** -> pilih menu **SQL Editor**.
2. Salin isi file `supabase/schema.sql`, lalu klik **Run** untuk mengeksekusi skema lengkap.
3. Salin isi file `supabase/seed.sql`, lalu klik **Run** untuk memasukkan akun Super Admin dan data menu awal.

### Opsi B: Menggunakan Supabase CLI

```bash
# Menjalankan migrasi lokal
supabase migration up

# Mereset database lokal dan menjalankan seed otomatis
supabase db reset
```

---

## 👤 Akun Super Admin Awal

- **Email:** `admin@faza.com`
- **Password:** `password123`
- **Role:** `Admin`
