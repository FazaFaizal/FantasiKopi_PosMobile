# Panduan Setup Fantasi Kopi dari Nol

Panduan ini untuk menjalankan project dari hasil `git clone` sampai bisa dipakai di HP dan diekspor menjadi APK. Semua perintah ditulis untuk **Windows + PowerShell**.

Urutan besarnya:

1. Pasang tools di komputer
2. Clone repo dan `npm install`
3. Siapkan project Supabase (database, Auth, API key)
4. Deploy Edge Functions
5. Hubungkan Midtrans (opsional, hanya untuk bayar QRIS online)
6. Jalankan aplikasi di HP
7. Ekspor APK release

---

## 1. Tools yang harus terpasang

| Tool | Versi | Catatan |
| --- | --- | --- |
| Git | terbaru | |
| Node.js | 22 LTS atau 24 | Project ini terakhir dibangun dengan Node 24.14 dan npm 11. |
| Android Studio | terbaru | Dipakai untuk Android SDK, JDK 17, dan CMake. |
| Android SDK Platform + Build-Tools | ikut Android Studio | Gradle akan mengunduh versi yang kurang secara otomatis. |
| CMake **3.31.6** | wajib untuk build release | Lihat langkah 1.2. CMake 3.22.1 bawaan gagal di build release. |
| Akun Supabase | gratis | https://supabase.com |
| Akun Midtrans (sandbox) | opsional | Hanya untuk pembayaran QRIS online. |

Supabase CLI tidak perlu dipasang global. Semua perintah memakai `npx supabase ...`.

### 1.1 Environment variable Windows

Buka **Start → "Edit the system environment variables" → Environment Variables**, lalu isi di bagian *User variables*:

| Nama | Nilai |
| --- | --- |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |
| `ANDROID_HOME` | `C:\Users\<nama-user>\AppData\Local\Android\Sdk` |
| `Path` (tambah baris) | `%ANDROID_HOME%\platform-tools` |

`JAVA_HOME` harus mengarah ke JDK bawaan Android Studio (Java 17). Kalau `java -version` menampilkan Java 8, itu tidak masalah selama `JAVA_HOME` benar, karena Gradle memakai `JAVA_HOME`.

Tutup lalu buka lagi terminal setelah mengubah environment variable.

### 1.2 Pasang CMake 3.31.6

1. Buka Android Studio → **Tools → SDK Manager** (atau **More Actions → SDK Manager** di layar Welcome).
2. Pilih tab **SDK Tools**, centang **Show Package Details** di kanan bawah.
3. Di bagian **CMake**, centang **3.31.6**, lalu **Apply**.

Alasannya: path file C++ di build release lebih dari 260 karakter. `ninja` di CMake 3.22.1 tidak mendukung path panjang, sedangkan CMake 3.31.6 membawa `ninja` 1.12.1 yang mendukung.

---

## 2. Clone dan install dependency

Clone ke **path yang pendek**, misalnya `D:\p`. Path yang dalam (seperti `D:\Kuliah\Semester 7\Tugas Akhir\...`) membuat build native gagal karena batas panjang path Windows.

```powershell
git clone <url-repo-github> D:\p
cd D:\p
npm install
```

---

## 3. Supabase

### 3.1 Buat project

1. Buka https://supabase.com/dashboard → **New project**.
2. Isi nama, **Database Password** (simpan, nanti dipakai CLI), dan region terdekat (misalnya Singapore).
3. Tunggu sampai project siap.
4. Catat **Project Ref**: bagian acak di URL dashboard, `https://supabase.com/dashboard/project/<project-ref>`.

### 3.2 Aktifkan pg_cron (sebelum membuat tabel)

**Database → Extensions**, cari `pg_cron`, aktifkan.

pg_cron menjalankan `expire_unpaid_orders()` tiap menit untuk membatalkan pesanan yang lewat batas bayar. Migration hanya memasang jadwal ini kalau pg_cron **sudah aktif** saat migration dijalankan. Kalau lupa, lihat bagian Troubleshooting.

### 3.3 Buat tabel dan data awal

Pilih **salah satu** cara. Jangan dicampur.

#### Cara A (disarankan): Supabase CLI

Cara ini menyimpan riwayat migration di Supabase, jadi migration baru nanti cukup di-`push`.

```powershell
cd D:\p
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed
```

- `link` akan meminta Database Password dari langkah 3.1.
- `db push` menjalankan semua file di `supabase/migrations` berurutan, lalu `supabase/seed.sql`.

#### Cara B: SQL Editor di dashboard

1. **SQL Editor → New query**, salin seluruh isi `supabase/schema.sql`, klik **Run**.
2. **New query** lagi, salin seluruh isi `supabase/seed.sql`, klik **Run**.

Salin dengan **Ctrl+C**, jangan Ctrl+X, supaya file di repo tidak ikut kosong.

Kalau memakai cara B, Supabase tidak punya riwayat migration. Jangan jalankan `npx supabase db push` di project itu, karena semua migration akan dijalankan ulang. Migration baru dijalankan manual lewat SQL Editor.

#### Isi data awal (dari `seed.sql`)

- Akun **Admin**: `admin@faza.com` / `password123`
- Akun **Kasir**: `kasir@faza.com` / `password123`
- Data karyawan untuk kedua akun itu (setiap akun Admin/Kasir wajib terhubung ke satu data karyawan)
- 4 kategori, 7 produk, 6 bahan baku

`seed.sql` aman dijalankan lebih dari sekali.

**Ganti password kedua akun ini** setelah login pertama, terutama kalau project dipakai di luar pengujian.

### 3.4 Pengaturan Auth

Buka **Authentication → Sign In / Providers → Email**:

| Pengaturan | Nilai | Alasan |
| --- | --- | --- |
| Enable Email provider | ON | Login memakai email + password. |
| **Confirm email** | **OFF** | Setelah daftar, aplikasi langsung menganggap akun Customer siap dipakai. Kalau ON, customer tidak bisa login sebelum klik email konfirmasi, dan SMTP bawaan Supabase hanya mengirim beberapa email per jam. |
| Minimum password length | **8** | Sama dengan validasi di aplikasi (`PASSWORD_MIN_LENGTH`). |

### 3.5 Isi `.env`

1. **Project Settings → API Keys**, salin **Project URL** dan **Publishable key** (atau *anon key* di tab Legacy, keduanya bisa).
2. Buat file `.env` dari template:

```powershell
Copy-Item .env.example .env
```

3. Isi `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-atau-anon-key>
```

Jangan pernah memasukkan **service_role key** ke `.env`. Semua variabel `EXPO_PUBLIC_*` ikut tertanam di APK dan bisa dibaca siapa saja.

---

## 4. Edge Functions

Ada 3 function di `supabase/functions`:

| Function | Dipanggil oleh | JWT |
| --- | --- | --- |
| `create-staff-user` | Admin, saat membuat akun Admin/Kasir di menu Akun Pengguna | wajib (default) |
| `create-midtrans-payment` | Customer, saat memilih bayar QRIS online | wajib (default) |
| `midtrans-webhook` | Server Midtrans | **tanpa JWT** (`--no-verify-jwt`), keaslian dicek lewat signature |

Deploy (project harus sudah di-`link`, lihat 3.3 cara A; kalau memakai cara B, jalankan `npx supabase login` dan `npx supabase link` dulu):

```powershell
npx supabase functions deploy create-staff-user
npx supabase functions deploy create-midtrans-payment
npx supabase functions deploy midtrans-webhook --no-verify-jwt
```

Tanpa `create-staff-user`, Admin tidak bisa membuat akun karyawan baru. Dua function Midtrans boleh di-deploy walaupun Midtrans belum diatur. Selama secret-nya belum ada, aplikasi menampilkan "Pembayaran online belum dikonfigurasi. Silakan bayar di kasir."

---

## 5. Midtrans (opsional)

Lewati bagian ini kalau hanya memakai pembayaran di kasir.

### 5.1 Ambil key di dashboard Midtrans (mode Sandbox)

1. Pastikan dashboard dalam mode **Sandbox**.
2. **Settings → Access Keys**:
   - **Server Key**: saat membuat key, beri izin **Core API = Write**. Izin Read saja membuat pembuatan QR gagal. Server Key hanya ditampilkan sekali saat dibuat, jadi langsung simpan.
   - **Signature Secret Key** (ikon mata di bagian Payment). Sejak akhir Oktober 2026, Midtrans menandatangani notifikasi dengan key ini, terpisah dari Server Key.

### 5.2 Simpan sebagai Supabase Secrets

Supabase dashboard → **Edge Functions → Secrets** → tambahkan:

| Nama | Nilai |
| --- | --- |
| `MIDTRANS_SERVER_KEY` | Server Key |
| `MIDTRANS_SIGNATURE_KEY` | Signature Secret Key |
| `MIDTRANS_IS_PRODUCTION` | isi `true` hanya untuk mode produksi. Kosongkan atau jangan dibuat untuk sandbox. |

Key Midtrans hanya disimpan di Supabase Secrets. Jangan dimasukkan ke `.env`, ke kode, atau dikirim lewat chat.

### 5.3 Atur Notification URL

Di dashboard Midtrans, **Settings → Payment → Notification URL** (Payment Notification URL), isi:

```
https://<project-ref>.supabase.co/functions/v1/midtrans-webhook
```

### 5.4 Uji pembayaran sandbox

1. Login sebagai Customer, buat pesanan, pilih **QRIS Online**.
2. Di layar QR, tekan **Bagikan link QR** (hanya muncul di sandbox) dan salin link gambar QR-nya.
3. Buka simulator QRIS sandbox Midtrans, tempel link gambar QR tersebut, lalu bayar.
4. Aplikasi seharusnya menampilkan **Pembayaran Berhasil**, dan pesanan muncul di kasir.

QR online berlaku **3 menit**. Lewat dari itu, pesanan otomatis batal.

---

## 6. Jalankan aplikasi saat development

### 6.1 Cek kode (opsional, disarankan setelah clone)

```powershell
npm test
npx tsc --noEmit
npx expo lint
```

Ketiganya harus lulus tanpa error.

### 6.2 Jalankan di HP Android

1. Di HP: aktifkan **Developer options → USB debugging**, sambungkan ke komputer dengan kabel USB, lalu izinkan debugging saat ditanya.
2. Cek HP terdeteksi:

```powershell
adb devices
```

3. Build dan pasang aplikasi development:

```powershell
npx expo run:android
```

Build pertama butuh waktu lama (10–20 menit) karena mengompilasi kode native. Perintah ini juga membuat folder `android/` secara otomatis. Folder itu di-gitignore.

Setelah terpasang, aplikasi mengambil kode JavaScript dari komputer (Metro). Untuk sesi berikutnya cukup jalankan:

```powershell
npx expo start
```

lalu buka aplikasinya di HP. HP harus tersambung USB atau satu Wi-Fi dengan komputer.

Expo Go dari Play Store hanya bisa dipakai kalau versinya mendukung Expo SDK 58. Cara yang pasti jalan adalah `npx expo run:android`.

---

## 7. Ekspor APK release

APK release membawa kode JavaScript di dalamnya, jadi bisa dipasang di HP mana pun tanpa komputer.

### 7.1 Pastikan `.env` sudah benar

Nilai di `.env` ditanam saat build. Kalau `.env` diubah, APK harus di-build ulang.

### 7.2 Buat folder `android/` (kalau belum ada)

```powershell
cd D:\p
npx expo prebuild --platform android
```

Kalau sebelumnya sudah menjalankan `npx expo run:android`, folder ini sudah ada dan langkah ini boleh dilewati.

### 7.3 Arahkan Gradle ke CMake 3.31.6

Buka `android\local.properties`, tambahkan baris kedua (ganti `<nama-user>`):

```properties
sdk.dir=C\:\\Users\\<nama-user>\\AppData\\Local\\Android\\Sdk
cmake.dir=C\:\\Users\\<nama-user>\\AppData\\Local\\Android\\Sdk\\cmake\\3.31.6
```

Backslash harus ditulis ganda (`\\`) dan titik dua ditulis `\:`, karena `\` adalah karakter escape di file `.properties`.

Baris `cmake.dir` ini hilang kalau folder `android/` dibuat ulang (misalnya `npx expo prebuild --clean`). Tambahkan lagi setiap kali itu terjadi.

### 7.4 Build

```powershell
cd D:\p\android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

- Build pertama sekitar 20 menit. Build berikutnya jauh lebih cepat.
- `-PreactNativeArchitectures=...` membatasi build ke HP/tablet asli (lebih cepat, APK lebih kecil). Hapus opsi ini kalau APK juga perlu jalan di emulator x86.

Hasilnya:

```
D:\p\android\app\build\outputs\apk\release\app-release.apk
```

### 7.5 Pasang di HP

- Kirim `app-release.apk` ke HP (kabel, Google Drive, WhatsApp, dll.), buka, lalu izinkan **Install from unknown sources** kalau diminta.
- Atau lewat kabel: `adb install -r app\build\outputs\apk\release\app-release.apk`
- Kalau di HP sudah ada versi lain dengan tanda tangan berbeda (misalnya build development), uninstall dulu.

### 7.6 Tentang tanda tangan APK

APK ini ditandatangani dengan **debug keystore** bawaan template. Cukup untuk dipasang dan diuji, tapi **tidak bisa diunggah ke Play Store**. Untuk Play Store perlu keystore sendiri (lihat panduan React Native "Publishing to Google Play Store") atau EAS Build. Jangan pernah meng-commit file keystore (`*.jks`, `*.keystore` sudah di-gitignore).

---

## 8. Troubleshooting

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| `ninja: error: mkdir(...): No such file or directory` saat `assembleRelease` | Path terlalu panjang untuk CMake 3.22.1 | Pasang CMake 3.31.6 (1.2), isi `cmake.dir` (7.3), hapus folder `android\app\.cxx`, build ulang. Pastikan repo ada di path pendek. |
| `'gradlew' is not recognized` | Perintah dijalankan dari folder yang salah, atau tanpa `.\` | `cd D:\p\android` lalu `.\gradlew.bat ...` |
| Gradle mengeluh versi Java | `JAVA_HOME` tidak mengarah ke Java 17 | Set `JAVA_HOME` ke `...\Android Studio\jbr` (1.1), buka terminal baru. |
| `seed.sql` gagal: "Akun karyawan wajib terhubung dengan data karyawan" | Memakai `seed.sql` versi lama | Pakai `seed.sql` terbaru dari repo. |
| Pesanan belum dibayar tidak pernah batal otomatis | pg_cron belum aktif waktu migration jalan | Aktifkan pg_cron (3.2), lalu jalankan di SQL Editor: `SELECT cron.schedule('expire-unpaid-orders', '* * * * *', 'SELECT public.expire_unpaid_orders()');` Cek dengan `SELECT * FROM cron.job;` |
| Customer baru tidak bisa login setelah daftar | **Confirm email** masih ON | Matikan (3.4). |
| "Pembayaran online belum dikonfigurasi" | Secret `MIDTRANS_SERVER_KEY` belum diisi | Isi secret (5.2). |
| QR tidak muncul / error dari Midtrans saat membuat QR | Server Key belum punya izin Core API = Write | Buat Server Key baru dengan izin Write, perbarui secret. |
| Sudah bayar di simulator tapi status tetap menunggu | Notification URL salah, atau signature ditolak (401) | Cek Notification URL (5.3) dan `MIDTRANS_SIGNATURE_KEY` (5.2). Lihat log di Supabase → Edge Functions → `midtrans-webhook` → Logs. |
| Admin gagal membuat akun karyawan | `create-staff-user` belum di-deploy | Deploy (bagian 4). |
| Aplikasi tidak bisa terhubung ke Supabase | `.env` kosong/salah, atau APK di-build sebelum `.env` diisi | Perbaiki `.env`. Untuk development jalankan `npx expo start -c`. Untuk APK, build ulang. |

---

## 9. Ringkasan perintah

```powershell
# Sekali di awal
git clone <url-repo-github> D:\p
cd D:\p
npm install
Copy-Item .env.example .env          # lalu isi URL + key Supabase
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed
npx supabase functions deploy create-staff-user
npx supabase functions deploy create-midtrans-payment
npx supabase functions deploy midtrans-webhook --no-verify-jwt

# Development
npx expo run:android                 # build pertama / setelah ganti dependency native
npx expo start                       # sesi berikutnya

# Cek kode
npm test
npx tsc --noEmit
npx expo lint

# APK release
npx expo prebuild --platform android # kalau folder android/ belum ada
# tambahkan cmake.dir ke android\local.properties
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# hasil: android\app\build\outputs\apk\release\app-release.apk
```

Kalau ada migration baru di `supabase/migrations` (project yang memakai cara A):

```powershell
npx supabase db push
```
