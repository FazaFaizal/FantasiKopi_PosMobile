# Fantasi Kopi: POS dan Operasional Kedai

Aplikasi Android untuk kedai kopi Fantasi Coffee. Kasir mencatat penjualan di POS, admin mengelola menu, stok, karyawan, kas, dan laporan, sedangkan customer bisa memesan dari HP dan membayar di kasir atau lewat QRIS online. Tampilan disesuaikan untuk HP dan tablet, portrait maupun landscape.

## Cara menjalankan

Panduan lengkap dari `git clone` sampai ekspor APK ada di **[docs/panduan-setup.md](docs/panduan-setup.md)**. Isinya: tools yang harus dipasang, setup Supabase (migration, seed, Auth, Edge Functions), Midtrans sandbox, menjalankan di HP, dan build APK release.

Versi singkat untuk yang sudah punya semua tools dan project Supabase:

```powershell
git clone <url-repo-github> D:\p     # pakai path pendek, build native gagal di path panjang
cd D:\p
npm install
Copy-Item .env.example .env          # isi URL dan publishable/anon key Supabase
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed
npx expo run:android
```

## Akun bawaan dari `supabase/seed.sql`

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@faza.com` | `password123` |
| Kasir | `kasir@faza.com` | `password123` |
| Customer | daftar sendiri di halaman Register | minimal 8 karakter |

Ganti password akun Admin dan Kasir setelah login pertama. Akun Admin/Kasir baru dibuat oleh Admin dari menu **Akun Pengguna**, berdasarkan data di menu **Karyawan**. Akun Customer tidak bisa diubah menjadi akun karyawan.

## Fitur per role

| Role | Halaman |
| --- | --- |
| Admin | Dashboard dan aktivitas terbaru, Pesanan, Produk, Kategori, Bahan Baku, Karyawan, Akun Pengguna, Kas Harian, Pengeluaran, Laporan, Profil |
| Kasir | POS (wajib buka sif dulu), Pesanan, Bahan Baku (stok masuk/keluar), Kas Harian, Profil |
| Customer | Menu dan keranjang, Pesanan Saya, Pembayaran QRIS online, Profil |

Aturan bisnis penting:

- Zona waktu bisnis **WITA (Asia/Makassar)** untuk nomor pesanan, laporan, dan kas harian.
- Pesanan customer yang dibayar di kasir batal otomatis jika tidak dibayar dalam 15 menit. QRIS online berlaku 3 menit.
- Pesanan QRIS online baru muncul di kasir setelah Midtrans mengonfirmasi pembayaran.
- Stok bahan baku hanya berubah lewat catatan mutasi (masuk, keluar, opname).
- Harga menu sudah termasuk pajak.

## Teknologi

- Expo SDK 58, React Native 0.88, TypeScript, Expo Router
- NativeWind 4 (Tailwind CSS)
- Supabase: Postgres dengan Row-Level Security, Auth, Realtime, Edge Functions (Deno), pg_cron
- Midtrans Core API untuk QRIS online
- Jest dan React Native Testing Library

## Struktur folder

```text
app/                  Halaman (Expo Router), dikelompokkan per role: (admin), (kasir), (customer), (auth)
components/           Komponen UI bersama
hooks/                Hook React (responsif, status jaringan, pesanan masuk)
lib/                  Logika bisnis murni, koneksi Supabase, AuthContext
types/                Tipe database
supabase/
  migrations/         Riwayat migration berurutan
  schema.sql          Skema lengkap dalam satu file (alternatif migration, untuk SQL Editor)
  seed.sql            Data awal: akun Admin/Kasir, kategori, produk, bahan baku
  functions/          Edge Functions: create-staff-user, create-midtrans-payment, midtrans-webhook
__tests__/            Test Jest
docs/                 Panduan setup dan skenario UAT
```

Folder `android/` tidak ada di repo. Folder itu dibuat otomatis oleh `npx expo run:android` atau `npx expo prebuild`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npx expo run:android` | Build dan pasang aplikasi development ke HP/emulator |
| `npx expo start` | Jalankan Metro untuk aplikasi development yang sudah terpasang |
| `npx expo start -c` | Sama, sambil membersihkan cache (misalnya setelah mengubah `.env`) |
| `npm test` | Jalankan semua test |
| `npx tsc --noEmit` | Cek tipe TypeScript |
| `npx expo lint` | Cek lint |
| `cd android; .\gradlew.bat assembleRelease` | Build APK release (lihat panduan bagian 7) |
