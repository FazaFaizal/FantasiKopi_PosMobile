# ☕ Fantasi Coffee - Mobile Point of Sale (POS) & Operational System

Aplikasi mobile Point of Sale (POS) dan manajemen operasional kedai kopi **Fantasi Coffee**, dirancang khusus untuk efisiensi transaksi kasir, pelacakan inventaris bahan baku fisik (_stock opname_), katalog menu, dan pembagian hak akses (_Role-Based Access Control_ / RBAC).

Aplikasi ini dioptimalkan untuk perangkat **Smartphone & Tablet** (mendukung rotasi otomatis / _landscape mode_).

---

## 🚀 Teknologi Utama

- **Framework:** [Expo SDK 57](https://expo.dev) & [React Native 0.86](https://reactnative.dev)
- **Bahasa:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [NativeWind v4](https://www.nativewind.dev/) (Tailwind CSS untuk React Native)
- **Database & Autentikasi:** [Supabase](https://supabase.com) (PostgreSQL 15+, Row-Level Security, Auth)
- **Routing:** [Expo Router v57](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Testing:** [Jest](https://jestjs.io/) (83 automated unit & integration tests per iterasi)

---

## 📋 Prasyarat Sistem (_Prerequisites_)

Pastikan perangkat komputer Anda telah terinstal:

1. **Node.js** (Versi LTS v18 atau v20 ke atas) -> [Unduh Node.js](https://nodejs.org/)
2. **Git** -> [Unduh Git](https://git-scm.com/)
3. **Akun Supabase** (Gratis) -> [Daftar Supabase](https://supabase.com/)
4. **Aplikasi Expo Go** di smartphone Android/iOS (tersedia di Google Play Store & Apple App Store) atau **Android Studio Emulator**.

---

## 🛠️ Panduan Menjalankan Proyek Pertama Kali

Ikuti langkah-langkah berurutan di bawah ini untuk memulai dari nol:

### Langkah 1: Kloning Repositori & Instalasi Dependensi

Buka terminal (PowerShell / Command Prompt / Terminal) dan jalankan:

```bash
# 1. Masuk ke direktori proyek
cd POS_TA_FAZA

# 2. Instal seluruh dependensi proyek
npm install
```

---

### Langkah 2: Menyiapkan Database di Supabase

1. Buka [Dashboard Supabase](https://supabase.com/dashboard) dan lakukan login.
2. Klik tombol **New Project**.
3. Masukkan informasi proyek:
   - **Name:** `Fantasi Coffee POS` (atau nama lain pilihan Anda).
   - **Database Password:** Buat password yang kuat dan simpan baik-baik.
   - **Region:** Pilih lokasi terdekat (misal: `Singapore (ap-southeast-1)`).
4. Klik **Create new project** dan tunggu proses inisialisasi server selesai (~1-2 menit).

---

### Langkah 3: Menjalankan Skema SQL di SQL Editor Supabase

Diperlukan 2 tahap eksekusi SQL: membuat struktur tabel (**schema**), lalu memasukkan data awal (**seed**).

#### A. Eksekusi Skema Tabel (`schema.sql`)

1. Di Dashboard Supabase Anda, buka tab **SQL Editor** (ikon terminal `>_` pada bilah menu samping kiri).
2. Klik tombol **+ New query**.
3. Buka file [`supabase/schema.sql`](supabase/schema.sql) di text editor / VS Code Anda.
4. Salin seluruh isi file (`Ctrl + A`, lalu `Ctrl + C`).
5. Tempelkan kode tersebut ke dalam kolom query di Supabase SQL Editor.
6. Klik tombol **Run** (berwarna hijau di kanan bawah query).
7. Pastikan muncul pesan sukses: `Success. No rows returned`.
   > _Catatan: Skema ini otomatis membuat 8 tabel utama, fungsi keamanan RLS anti-rekursi `is_admin()` & `is_staff()`, trigger sinkronisasi akun, dan index performa query._

#### B. Eksekusi Data Awal & Akun Super Admin (`seed.sql`)

1. Di tab **SQL Editor** Supabase, klik tombol **+ New query** kembali.
2. Buka file [`supabase/seed.sql`](supabase/seed.sql).
3. Salin seluruh isinya dan tempelkan ke query editor.
4. Klik tombol **Run**.
5. Pastikan muncul pesan sukses: `Success. No rows returned`.
   > _Catatan: Tahap ini otomatis mendaftarkan akun Super Admin awal, 4 kategori menu, 7 produk minuman kopi, dan 6 bahan baku inventaris._

---

### Langkah 4: Konfigurasi Environment Variable (`.env`)

1. Pada root direktori proyek, salin file template `.env.example` menjadi `.env`:
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item .env.example .env
     ```
   - **Linux / Mac / Bash:**
     ```bash
     cp .env.example .env
     ```
2. Ambil kunci API Supabase Anda:
   - Di Dashboard Supabase, buka menu **Project Settings** (ikon gerigi di kiri bawah) -> pilih tab **API**.
   - Salin **Project URL**.
   - Salin **Project API Keys (`anon` / `public`)**.
3. Buka file `.env` di VS Code dan tempelkan nilainya:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://proyek-anda.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbgciOiJKV1QiLCJhbGc...
   ```
4. Simpan file `.env`.

---

### Langkah 5: Memastikan Kualitas Kode & Menjalankan Pengujian (Opsional namun Disarankan)

Sebelum menjalankan aplikasi, jalankan pengujian otomatis untuk memastikan seluruh modul berjalan 100%:

```bash
# Menjalankan 83 unit test otomatis Jest (terorganisir per iterasi)
npm test

# Memeriksa kesesuaian tipe data TypeScript
npx tsc --noEmit

# Memeriksa standarisasi kode linter
npx expo lint
```

---

### Langkah 6: Menjalankan Aplikasi Mobile

Jalankan server pengembangan Expo:

```bash
npx expo start
```

Setelah server Expo menyala, di terminal akan muncul **QR Code**:

- **Menjalankan di Smartphone Fisik / Tablet (Paling Disarankan):**
  1. Pastikan HP/Tablet dan Komputer terhubung pada **jaringan Wi-Fi yang sama**.
  2. Buka aplikasi **Expo Go** di HP/Tablet Android.
  3. Scan QR Code yang ada di terminal.
  4. Aplikasi Fantasi Coffee akan otomatis di-bundle dan terbuka di layar perangkat Anda!
- **Menjalankan di Emulator Android:**
  - Tekan tombol `a` pada keyboard di terminal.
- **Menjalankan di Web Browser:**
  - Tekan tombol `w` pada keyboard di terminal.

---

## 👤 Akun Bawaan untuk Pengujian (_Default Credentials_)

Setelah aplikasi terbuka, Anda dapat langsung login menggunakan akun pengujian berikut:

| Peran (_Role_)       | Alamat Email                   | Kata Sandi (_Password_) | Hak Akses Utama                                                               |
| :------------------- | :----------------------------- | :---------------------- | :---------------------------------------------------------------------------- |
| **Super Admin**      | `admin@faza.com`               | `password123`           | Akses penuh: Dashboard, Produk, Kategori, Bahan Baku, Karyawan, Akun Pengguna |
| **Pendaftaran Baru** | _(Daftar di halaman Register)_ | _(Bebas)_               | Otomatis memiliki role **Customer** untuk menjelajahi katalog menu            |

> **Tips:** Untuk membuat akun **Kasir**, Anda dapat login sebagai Super Admin, masuk ke menu **Karyawan / Akun Pengguna**, lalu ubah peran akun yang diinginkan menjadi **Kasir**.

---

## 📁 Struktur Direktori Proyek

```text
POS_TA_FAZA/
├── app/                      # Rute halaman Expo Router
│   ├── (admin)/              # Modul Admin: Dashboard, Produk, Stok, Karyawan, User
│   ├── (auth)/               # Halaman Login, Register, Inactive, Unauthorized
│   ├── (customer)/           # Modul Customer: Katalog Menu
│   ├── (kasir)/              # Modul Kasir: Transaksi POS & Pencatatan Stok
│   ├── _layout.tsx           # Proteksi Auth State & Provider Navigasi
│   └── index.tsx             # Redirect rute awal berdasarkan role
├── components/               # Komponen UI modular (Button, Input, Badge, Sidebar, Header)
├── hooks/                    # Custom React Hooks (useResponsive, orientasi layar)
├── lib/                      # Utilitas murni & koneksi Supabase (AuthContext, inventory-logic)
├── supabase/                 # Berkas Database Backend
│   ├── schema.sql            # Master skema database PostgreSQL (idempotent)
│   ├── seed.sql              # Master seed data awal
│   └── migrations/           # Riwayat migrasi versioned
├── types/                    # Definisi tipe TypeScript Supabase (database.ts)
├── __tests__/                # Pengujian otomatis TDD per iterasi (83 Jest tests)
├── .env.example              # Template variabel konfigurasi
└── app.json                  # Konfigurasi nama, ikon, dan orientasi Expo
```

---

## 💡 Perintah Bantuan (_Command Cheatsheet_)

```bash
# Menjalankan Expo server dalam mode pembersihan cache
npx expo start -c

# Menjalankan unit test dengan mode watch (otomatis tes ulang saat kode diedit)
npm test -- --watch

# Memperbaiki dependensi expo yang tidak kompatibel
npx expo install --fix
```
