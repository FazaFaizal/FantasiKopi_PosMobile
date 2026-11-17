# Panduan Kode Fantasi Kopi

Panduan ini menjelaskan isi kode project: frontend, backend, dan API, beserta file yang perlu dibuka kalau ingin mengubah sesuatu. Ditulis untuk orang yang sudah paham MVC Laravel, jadi setiap bagian diberi padanan konsep Laravel-nya.

Untuk cara instalasi dan menjalankan aplikasi, lihat [panduan-setup.md](panduan-setup.md). Untuk skenario uji, lihat [uat-per-iterasi.md](uat-per-iterasi.md).

---

## 1. Perbedaan terbesar dengan Laravel

Project ini **tidak punya server yang kita tulis sendiri** seperti Laravel. Susunannya begini:

```text
┌──────────────────────────────┐        ┌─────────────────────────────────────┐
│ APLIKASI ANDROID (frontend)  │        │ SUPABASE (backend)                  │
│ Expo + React Native          │        │                                     │
│                              │  HTTPS │  Postgres  : tabel, function, trigger│
│ app/         halaman         │ ─────► │  RLS       : aturan hak akses        │
│ components/  komponen UI     │ ◄───── │  Auth      : login, sesi             │
│ lib/         logika + client │        │  Realtime  : notifikasi perubahan    │
│                              │        │  Edge Func.: kode server (Deno)      │
└──────────────────────────────┘        └──────────────┬──────────────────────┘
                                                       │
                                                       ▼
                                              Midtrans (QRIS online)
```

- Di Laravel, aplikasi memanggil route, route memanggil controller, controller memakai model untuk query database.
- Di sini, aplikasi **langsung meng-query database** lewat library `@supabase/supabase-js`. Supabase otomatis menyediakan REST API untuk setiap tabel.
- Karena aplikasi bisa query langsung, **keamanan dan aturan bisnis yang wajib dijaga ada di database**: Row-Level Security (RLS), trigger, dan SQL function. Inilah "controller sisi server" project ini.
- Kode server dalam arti biasa hanya ada 3, di `supabase/functions/` (Edge Functions), untuk hal yang butuh kunci rahasia: membuat akun staf dan memanggil Midtrans.

### Padanan Laravel → project ini

| Di Laravel | Di project ini | Lokasi |
| --- | --- | --- |
| `routes/web.php` | Nama file di folder `app/` (file-based routing Expo Router) | `app/` |
| Blade view | Komponen React (`.tsx`) yang mengembalikan JSX | `app/**/*.tsx`, `components/` |
| Layout Blade (`@extends`) | `_layout.tsx` di tiap folder | `app/_layout.tsx`, `app/(admin)/_layout.tsx`, dst. |
| Middleware `auth` + cek role | Navigation guard | `lib/navigation-logic.ts`, `lib/auth-logic.ts`, dipanggil di `app/_layout.tsx` |
| Controller (validasi + aksi) | Fungsi di dalam halaman + fungsi murni di `lib/*-logic.ts` | `app/**/*.tsx`, `lib/` |
| Form Request (validasi) | Fungsi `validate...()` | `lib/*-logic.ts` |
| Eloquent (`Product::where(...)`) | `supabase.from('products').select(...).eq(...)` | dipanggil di halaman |
| Model / `$fillable` / cast | Tipe TypeScript tabel | `types/database.ts` |
| Policy / Gate | RLS policy di Postgres | `supabase/schema.sql` (`CREATE POLICY`) |
| Observer / event model | Trigger Postgres | `supabase/schema.sql` (`CREATE TRIGGER`) |
| Service class / `DB::transaction` | SQL function (dipanggil dengan `supabase.rpc()`) | `supabase/schema.sql` (`CREATE FUNCTION`) |
| Migration | File SQL berurutan | `supabase/migrations/` |
| Seeder | `seed.sql` | `supabase/seed.sql` |
| Scheduler (`schedule:run`) | `pg_cron` | `expire_unpaid_orders` di `schema.sql` |
| Broadcasting / Pusher | Supabase Realtime (`supabase.channel(...)`) | lihat bagian 5.4 |
| Controller API eksternal + `.env` rahasia | Edge Function + Supabase Secrets | `supabase/functions/` |
| `config/` + `.env` | `.env` (hanya URL + anon key), `app.json`, `tailwind.config.js` | root project |
| `auth()->user()` | `useAuth()` → `{ session, user }` | `lib/AuthContext.tsx` |
| PHPUnit | Jest | `__tests__/` |

---

## 2. Peta folder

```text
app/                    HALAMAN. Setiap file = satu route.
  _layout.tsx           Root: font, AuthProvider, navigation guard
  index.tsx             Route "/" → langsung redirect ke login
  (auth)/               login, register, inactive, unauthorized
  (admin)/              semua halaman Admin
  (kasir)/              semua halaman Kasir
  (customer)/           semua halaman Customer
components/             Komponen UI yang dipakai banyak halaman
hooks/                  Hook React (ukuran layar, jaringan, pesanan masuk)
lib/
  supabase.ts           Client Supabase (satu-satunya koneksi ke backend)
  AuthContext.tsx       Sesi login + profil user (role, status)
  *-logic.ts            Aturan bisnis murni: validasi, hitungan, filter
  formatters.ts         formatRupiah
  timezone.ts           Tanggal bisnis WITA
  online-payment.ts     Memanggil Edge Function Midtrans
types/database.ts       Tipe tabel dan function database (ditulis manual)
supabase/
  schema.sql            Seluruh skema database dalam satu file
  migrations/           Riwayat perubahan skema, berurutan
  seed.sql              Data awal (akun, kategori, produk, bahan baku)
  functions/            Edge Functions (kode server Deno)
__tests__/              Test Jest, dikelompokkan per iterasi UAT
tailwind.config.js      Warna, font, radius tema
app.json                Nama aplikasi, ikon, package Android
```

Nama folder dalam kurung seperti `(admin)` adalah **route group**: tidak muncul di URL, hanya untuk mengelompokkan halaman dan memberi layout bersama. File `app/(admin)/product.tsx` dibuka dengan route `/(admin)/product`.

Folder `android/`, `dist/`, `temp_app/`, `node_modules/` tidak perlu disentuh. `android/` dibuat otomatis saat build.

---

## 3. Contoh alur lengkap: kasir menyimpan pesanan

Supaya terlihat bagaimana semua bagian tersambung, ini alur saat kasir menekan tombol bayar di POS:

1. **Halaman** `app/(kasir)/pos.tsx` mengumpulkan isi keranjang dan pilihan pembayaran.
2. **Validasi di aplikasi**: `validateOrderPayload()` dari `lib/pos-logic.ts`. Kalau gagal, tampil `Alert` dan berhenti. Ini setara Form Request, hanya untuk pengalaman pengguna.
3. **Panggil backend**: `supabase.rpc('create_order', buildCreateOrderParams(cart, {...}))`. Parameter disusun oleh `buildCreateOrderParams()` di `lib/pos-logic.ts`.
4. **Di database**, SQL function `create_order` (di `supabase/schema.sql`) dalam satu transaksi:
   - mengecek role pemanggil (kasir/admin/customer),
   - mengambil harga dari tabel `products` (harga dari aplikasi tidak dipercaya),
   - menyimpan ke `orders` dan `order_items`.
5. **Trigger** di tabel `orders` ikut berjalan: `assign_order_number` membuat nomor `ORD-YYYYMMDD-NNNN`, `set_order_payment_due` mengisi batas bayar, `track_order_payment_shift` menempelkan pesanan ke sif kasir yang sedang buka.
6. **RLS** memastikan kasir hanya bisa melakukan yang diizinkan policy.
7. Database mengembalikan pesanan yang dibuat. Halaman menampilkan struk.
8. **Realtime**: perubahan di `orders` dikirim ke layar lain yang berlangganan (misalnya halaman Pesanan Admin).

Pola ini berlaku di hampir semua fitur: **halaman → fungsi `lib/*-logic.ts` → `supabase` → aturan di database**.

---

## 4. Frontend

### 4.1 Cara halaman disusun

Hampir semua halaman punya pola yang sama. Contoh `app/(admin)/category.tsx`:

```tsx
export default function CategoryScreen() {
  // 1. state (setara variabel yang dikirim ke view)
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // 2. ambil data (setara method index() di controller)
  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase.from("categories").select("*").order("name");
    ...
  }, []);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // 3. aksi simpan (setara store()/update())
  const handleSave = async () => {
    const check = validateCategoryInput(name);          // dari lib/category-logic.ts
    if (!check.isValid) return setNameError(check.error);
    await supabase.from("categories").insert({...});    // atau .update().eq("id", ...)
    fetchCategories();
  };

  // 4. tampilan (setara Blade)
  return (<View className="...">...</View>);
}
```

Jadi satu file `.tsx` berisi **controller dan view sekaligus**. Bagian atas = logika, bagian `return (...)` paling bawah = tampilan. Aturan yang bisa diuji (validasi, hitungan, filter) dipisah ke `lib/*-logic.ts`.

### 4.2 Login, sesi, dan pembatasan role

| File | Isi |
| --- | --- |
| `lib/supabase.ts` | Membuat client Supabase dari `.env`. Sesi disimpan di AsyncStorage, jadi user tetap login setelah aplikasi ditutup. |
| `lib/AuthContext.tsx` | Menyimpan `session` dan `user` (baris tabel `users`: role, status). Profil dimuat ulang saat aplikasi kembali dibuka dan tiap 5 menit. Pakai `const { user } = useAuth()` di halaman mana pun. |
| `app/_layout.tsx` | Root layout. Memuat font, membungkus aplikasi dengan `AuthProvider`, lalu menjalankan guard setiap kali route berubah. |
| `lib/navigation-logic.ts` | `evaluateNavigationGuard()`: belum login → login; akun Nonaktif → `/inactive`; role salah → `/unauthorized`. |
| `lib/auth-logic.ts` | `checkRoleRouteAccess()` (group mana boleh dibuka role apa) dan `getDefaultRouteForRole()` (halaman awal tiap role). Juga validasi email dan password. |
| `app/(auth)/login.tsx` | `supabase.auth.signInWithPassword` |
| `app/(auth)/register.tsx` | `supabase.auth.signUp` (hanya untuk Customer). Profil di tabel `users` dibuat otomatis oleh trigger `handle_new_user`. |

Guard di aplikasi hanya untuk navigasi. Pengaman sebenarnya tetap RLS di database (bagian 5.3).

### 4.3 Daftar halaman

Kolom "Data" menunjukkan tabel (`from`), SQL function (`rpc`), dan Edge Function (`fn`) yang dipakai halaman itu.

**Admin** (`app/(admin)/`, layout: tab bar mengambang + sidebar)

| Route | File | Data | Logika |
| --- | --- | --- | --- |
| Dashboard | `dashboard.tsx` | from: orders, products, categories, inventory_items, employees, users · rpc: get_sales_summary, expire_unpaid_orders | `dashboard-logic.ts`, komponen `RecentActivityCard` (rpc get_recent_activity) |
| Pesanan | `orders.tsx` → `components/OrdersScreen.tsx` | from: orders, order_items · realtime orders | `order-logic.ts` |
| Produk | `product.tsx` | from: products, categories | `product-logic.ts` |
| Kategori | `category.tsx` | from: categories, products | `category-logic.ts` |
| Bahan Baku | `inventory.tsx` | from: inventory_items, stock_movements · rpc: record_stock_movement, record_stock_in | `inventory-logic.ts` |
| Karyawan | `employee.tsx` | from: employees, users | `employee-logic.ts` |
| Akun Pengguna | `user.tsx` | from: users, employees · fn: create-staff-user | `staff-account-logic.ts` |
| Kas Harian | `cash.tsx` → `components/DailyCashScreen.tsx` | from: cash_shifts, expenses, orders · rpc: get_shift_summary, open_cash_shift, close_cash_shift | `cash-logic.ts`, `shift-logic.ts` |
| Pengeluaran | `expense.tsx` | from: expenses | `expense-logic.ts` |
| Laporan | `report.tsx` | rpc: get_sales_summary | `report-logic.ts` |
| Profil | `profile.tsx` → `components/ProfileScreen.tsx` | auth.updateUser | `auth-logic.ts` |

**Kasir** (`app/(kasir)/`, layout: sidebar saja, tanpa tab bar)

| Route | File | Data | Logika |
| --- | --- | --- | --- |
| POS | `pos.tsx` | from: categories, products, cash_shifts · rpc: create_order | `pos-logic.ts`, `shift-logic.ts` (POS terkunci tanpa sif buka) |
| Pesanan | `orders.tsx` → `components/OrdersScreen.tsx` | sama dengan Admin | `order-logic.ts`, `payment-gateway-logic.ts` |
| Bahan Baku | `inventory.tsx` | from: inventory_items, stock_movements · rpc: record_stock_movement, record_stock_in | `inventory-logic.ts` |
| Kas Harian | `cash.tsx` → `components/DailyCashScreen.tsx` | sama dengan Admin | `cash-logic.ts`, `shift-logic.ts` |
| Profil | `profile.tsx` → `components/ProfileScreen.tsx` | | |

**Customer** (`app/(customer)/`, layout: stack, tanpa sidebar)

| Route | File | Data | Logika |
| --- | --- | --- | --- |
| Menu + keranjang | `product.tsx` | from: categories, products, orders · rpc: create_order | `customer-order-logic.ts`, `payment-gateway-logic.ts`, `online-payment.ts` |
| Pesanan Saya | `orders.tsx` | from: orders, order_items · rpc: cancel_my_order, expire_unpaid_orders · realtime | `customer-order-logic.ts`, `order-logic.ts` |
| Bayar QRIS | `payment.tsx` | from: orders · realtime (menunggu status Paid) | `order-logic.ts` |
| Profil | `profile.tsx` → `components/ProfileScreen.tsx` | | |

Halaman Pesanan, Kas Harian, dan Profil **dipakai bersama** oleh beberapa role. File di `app/` hanya pembungkus pendek; isi sebenarnya ada di `components/OrdersScreen.tsx`, `components/DailyCashScreen.tsx`, dan `components/ProfileScreen.tsx`. Mengubah komponen itu berarti mengubah halaman di semua role yang memakainya.

### 4.4 Komponen bersama (`components/`)

| Komponen | Dipakai untuk |
| --- | --- |
| `Button.tsx` | Semua tombol. Varian: `primary`, `secondary`, `outline`, `ghost`, `danger`, `success`. Ukuran: `sm`, `md`, `lg`. |
| `Input.tsx` | Kolom isian dengan label dan pesan error |
| `ChoiceGroup.tsx` | Pilihan bergaya tombol (segmented) |
| `Badge.tsx` | Label status berwarna. `statusTone()` memetakan teks status ke warna. |
| `States.tsx` | `LoadingState`, `EmptyState`, `ErrorState` |
| `ScreenHeader.tsx` | Judul halaman + tombol buka sidebar |
| `SidebarDrawer.tsx` | Sidebar Admin dan Kasir. **Daftar menu ada di sini**: `SIDEBAR_NAV_ITEMS` (Admin) dan `KASIR_NAV_ITEMS` (Kasir). |
| `FloatingNavbar.tsx` | Tab bar bawah Admin (Dashboard, Produk, Bahan Baku) |
| `IncomingOrderBanner.tsx`, `IncomingOrdersButton.tsx` | Notifikasi pesanan customer masuk |
| `RecentActivityCard.tsx` | Aktivitas terbaru di Dashboard |
| `ShiftRequiredNotice.tsx` | Pesan "buka sif dulu" di POS |
| `StockInPurchaseFields.tsx` | Isian harga beli saat stok masuk |
| `OrdersScreen.tsx`, `DailyCashScreen.tsx`, `ProfileScreen.tsx` | Halaman utuh yang dipakai bersama (lihat 4.3) |

### 4.5 Hooks (`hooks/`)

| Hook | Fungsi |
| --- | --- |
| `useResponsive.ts` | Lebar layar, HP atau tablet, portrait/landscape, jumlah kolom grid. Aturan breakpoint ada di `lib/orientation-logic.ts`. |
| `useAwaitingCustomerOrders.ts` | Langganan realtime pesanan customer yang menunggu bayar. Dipakai layout Admin dan Kasir untuk banner dan badge. |
| `useNetworkStatus.ts` | Status online/offline |
| `useSheetPadding.ts` | Jarak bawah untuk modal/bottom sheet |

### 4.6 Styling

Styling memakai **NativeWind**, yaitu Tailwind untuk React Native. Penulisannya sama dengan Tailwind di web: `className="bg-primary rounded-card p-4"`.

- **Warna, font, radius tema**: `tailwind.config.js`. Contoh `primary: "#D1001F"` dipakai sebagai `bg-primary`, `text-primary`, `border-primary`.
- **Font** dimuat di `app/_layout.tsx` (Poppins untuk judul, Inter untuk isi). Nama kelasnya `font-heading`, `font-body`, dan seterusnya.
- Beberapa warna masih ditulis langsung sebagai hex di kode (misalnya warna spinner `#D1001F` di `Button.tsx` dan `app/_layout.tsx`, serta warna ikon). Kalau mengganti warna utama, cari juga hex lama di seluruh project.
- Ikon: `Ionicons` dari `@expo/vector-icons`. Daftar nama ikon: https://icons.expo.fyi

### 4.7 Logika bisnis (`lib/*-logic.ts`)

File-file ini **tidak boleh berisi JSX atau query Supabase**. Isinya fungsi murni: input masuk, hasil keluar. Karena itu bisa diuji dengan Jest tanpa HP.

| File | Isi utama |
| --- | --- |
| `auth-logic.ts` | Validasi email/password, akses route per role, halaman awal per role, ganti password |
| `navigation-logic.ts` | Guard navigasi, pencocokan route aktif di sidebar |
| `employee-logic.ts` | Validasi data karyawan, pesan saat status karyawan diubah |
| `staff-account-logic.ts` | Validasi akun Admin/Kasir, karyawan mana yang boleh ditautkan |
| `category-logic.ts`, `product-logic.ts` | Validasi dan filter kategori/produk |
| `inventory-logic.ts` | Status stok (Aman/Low/Out), parameter mutasi stok, pembelian saat stok masuk |
| `pos-logic.ts` | Keranjang, total, kembalian, saran uang tunai, parameter `create_order` |
| `order-logic.ts` | Status pesanan dan pembayaran, transisi status yang diizinkan, pembatalan, batas waktu bayar |
| `customer-order-logic.ts` | Batas keranjang customer, validasi checkout, label status untuk customer |
| `payment-gateway-logic.ts` | Pilihan bayar customer (kasir / QRIS online) |
| `cash-logic.ts`, `shift-logic.ts` | Rekap kas harian, buka/tutup sif |
| `expense-logic.ts` | Kategori dan validasi pengeluaran, filter periode |
| `report-logic.ts`, `dashboard-logic.ts` | Rentang tanggal laporan, olah hasil `get_sales_summary` |
| `activity-logic.ts`, `incoming-orders-logic.ts` | Teks aktivitas terbaru, pengelompokan pesanan masuk |
| `orientation-logic.ts` | Breakpoint HP/tablet, jumlah kolom, kunci orientasi |
| `timezone.ts` | Tanggal bisnis WITA |
| `formatters.ts` | `formatRupiah` |

---

## 5. Backend (Supabase)

### 5.1 Tabel

| Tabel | Isi |
| --- | --- |
| `employees` | Data karyawan. Tidak bisa dihapus, hanya dinonaktifkan. |
| `users` | Profil akun: `role` (Admin/Kasir/Customer), `status`, `employee_id`. `id` sama dengan `auth.users.id`. |
| `categories` | Kategori menu |
| `products` | Menu. `status` = Tersedia / Tidak Tersedia. |
| `inventory_items` | Bahan baku dan stok saat ini |
| `stock_movements` | Riwayat mutasi stok (masuk, keluar, opname). Stok hanya berubah lewat tabel ini. |
| `orders` | Header pesanan: nomor, status pesanan, status bayar, metode, kanal (Kasir/Online), data Midtrans |
| `order_items` | Isi pesanan, dengan salinan nama dan harga produk saat itu |
| `order_number_counters` | Penghitung nomor pesanan per hari (diisi trigger) |
| `expenses` | Pengeluaran operasional |
| `cash_shifts` | Sif kasir: kas awal, kas akhir, selisih |
| `order_payment_corrections` | Log koreksi metode bayar oleh Admin |

Akun login sendiri disimpan Supabase di `auth.users` (bukan tabel kita). Trigger `handle_new_user` membuat baris `public.users` setiap ada akun baru.

### 5.2 `schema.sql` dan `migrations/`

- `supabase/migrations/` berisi perubahan skema berurutan sesuai tanggal di nama file. Sama seperti migration Laravel, tapi ditulis dalam SQL.
- `supabase/schema.sql` adalah **gabungan semua migration dalam satu file**, untuk dijalankan di SQL Editor pada project Supabase baru.
- Setiap kali ada migration baru, isinya juga **ditambahkan ke bagian bawah `schema.sql`**. Riwayat git menunjukkan keduanya selalu diubah bersamaan.

**Penting:** karena `schema.sql` adalah tumpukan migration, beberapa function didefinisikan lebih dari sekali dengan `CREATE OR REPLACE`. Contoh: `create_order` muncul 4 kali, `get_sales_summary` 2 kali. **Yang berlaku adalah definisi paling bawah.** Saat membaca atau mengubah function, selalu cari kemunculan terakhirnya (di VS Code: Ctrl+F, lalu tekan Shift+Enter dari akhir file).

### 5.3 RLS (pengganti Policy Laravel)

Setiap tabel memakai Row-Level Security. Policy menentukan siapa boleh `SELECT`, `INSERT`, `UPDATE`, `DELETE` baris mana. Contoh:

```sql
CREATE POLICY "Admins can manage categories" ON public.categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

Fungsi bantu yang dipakai policy:

| Function | Artinya |
| --- | --- |
| `is_admin()` | User login adalah Admin aktif |
| `is_staff()` | User login adalah Admin atau Kasir aktif |
| `is_active_customer()` | User login adalah Customer aktif |

Kalau query dari aplikasi tiba-tiba mengembalikan data kosong atau error "permission denied" / "row-level security", hampir pasti penyebabnya policy. Cari `CREATE POLICY` untuk tabel itu di `schema.sql`.

### 5.4 Trigger penting (pengganti Observer)

| Trigger | Tabel | Fungsi |
| --- | --- | --- |
| `on_auth_user_created` → `handle_new_user` | auth.users | Membuat profil di `users`, role default Customer |
| `on_employee_status_updated` | employees | Karyawan dinonaktifkan → akunnya ikut nonaktif |
| `on_stock_movement_created` → `apply_stock_movement` | stock_movements | Menambah/mengurangi stok di `inventory_items` |
| `guard_inventory_stock_change` | inventory_items | Menolak perubahan stok langsung (harus lewat mutasi) |
| `assign_order_number_before_insert` | orders | Nomor `ORD-YYYYMMDD-NNNN` |
| `set_order_payment_due` | orders | Batas waktu bayar (15 menit kasir, 3 menit QRIS online) |
| `enforce_payment_before_processing` | orders | Pesanan belum lunas tidak bisa diproses |
| `track_order_payment_shift`, `assign_expense_shift` | orders, expenses | Menautkan ke sif kasir yang sedang buka |
| `guard_order_payment_correction` | orders | Hanya Admin yang boleh koreksi metode bayar, dan dicatat |
| `guard_product_staff_update` | products | Kasir hanya boleh mengubah status produk |
| `guard_category_deactivation`, `guard_product_category_active` | categories, products | Kategori yang masih punya produk tidak bisa dinonaktifkan |
| `protect_last_admin` | users | Admin terakhir tidak bisa dihapus/diturunkan |
| `guard_user_account_rules` | users | Customer tidak bisa jadi staf, staf wajib punya data karyawan |
| `prevent_employee_delete` | employees | Karyawan tidak bisa dihapus |

Trigger ini berarti **ada aturan bisnis yang dijaga dua kali**: di `lib/*-logic.ts` (supaya pesan error rapi di aplikasi) dan di database (supaya tidak bisa diakali). Kalau mengubah aturan, ubah keduanya.

### 5.5 Zona waktu dan jadwal otomatis

- Zona waktu bisnis: `business_timezone()` di database mengembalikan `'Asia/Makassar'` (WITA). Pasangannya di aplikasi: `lib/timezone.ts`.
- `pg_cron` menjalankan `expire_unpaid_orders()` setiap menit untuk membatalkan pesanan yang lewat batas bayar. Aplikasi juga memanggil function ini saat memuat daftar pesanan, sebagai cadangan.

---

## 6. API

Aplikasi berkomunikasi dengan backend dengan 4 cara. Semuanya lewat objek `supabase` dari `lib/supabase.ts`.

### 6.1 Query tabel langsung

```ts
// SELECT
const { data, error } = await supabase.from('products').select('*, category:categories(name)').eq('status', 'Tersedia');
// INSERT
await supabase.from('categories').insert({ name, status: 'Aktif' });
// UPDATE
await supabase.from('products').update({ status: 'Tidak Tersedia' }).eq('id', id);
// DELETE
await supabase.from('expenses').delete().eq('id', id);
```

Dipakai untuk CRUD sederhana (kategori, produk, karyawan, pengeluaran). Hak akses dijaga RLS. Supabase mengubah ini menjadi request REST ke `https://<project>.supabase.co/rest/v1/<tabel>`.

### 6.2 RPC: memanggil SQL function

Dipakai untuk operasi yang harus atomik atau tidak boleh dipercayakan ke aplikasi (harga, stok, kas). Setara memanggil method service yang dibungkus `DB::transaction`.

```ts
const { data, error } = await supabase.rpc('create_order', { p_items: [...], p_payment_method: 'Tunai', ... });
```

| Function | Fungsi | Dipanggil dari |
| --- | --- | --- |
| `create_order` | Membuat pesanan + item, harga diambil dari database | `app/(kasir)/pos.tsx`, `app/(customer)/product.tsx` |
| `cancel_my_order` | Customer membatalkan pesanannya sendiri yang belum dibayar | `app/(customer)/orders.tsx` |
| `expire_unpaid_orders` | Membatalkan pesanan lewat batas bayar | `OrdersScreen.tsx`, `dashboard.tsx`, `(customer)/orders.tsx`, `useAwaitingCustomerOrders.ts` |
| `record_stock_movement` | Stok keluar / opname | `(admin)/inventory.tsx`, `(kasir)/inventory.tsx` |
| `record_stock_in` | Stok masuk, sekaligus mencatat pengeluaran pembelian | `(admin)/inventory.tsx`, `(kasir)/inventory.tsx` |
| `open_cash_shift`, `close_cash_shift` | Buka/tutup sif kasir | `components/DailyCashScreen.tsx` |
| `get_shift_summary` | Rekap kas sif berjalan | `components/DailyCashScreen.tsx` |
| `get_sales_summary` | Omzet, jumlah transaksi, produk terlaris, pengeluaran per periode | `(admin)/report.tsx`, `(admin)/dashboard.tsx` |
| `get_recent_activity` | Daftar aktivitas terbaru | `components/RecentActivityCard.tsx` |
| `apply_midtrans_notification` | Menerapkan status bayar dari Midtrans (hanya service role) | Edge Function `midtrans-webhook` |

Tipe parameter dan hasilnya ada di `types/database.ts` bagian `Functions`.

### 6.3 Edge Functions (`supabase/functions/`)

Kode TypeScript yang berjalan di server Supabase (Deno). Dipakai kalau butuh kunci rahasia atau hak penuh (service role). Setara controller Laravel biasa.

| Function | Dipanggil oleh | Fungsi |
| --- | --- | --- |
| `create-staff-user/index.ts` | `app/(admin)/user.tsx` lewat `supabase.functions.invoke('create-staff-user', { body })` | Membuat akun Admin/Kasir. Tidak bisa dari aplikasi langsung karena `signUp` akan mengganti sesi Admin. |
| `create-midtrans-payment/index.ts` | `lib/online-payment.ts` | Meminta QRIS ke Midtrans, mengembalikan URL gambar QR |
| `midtrans-webhook/index.ts` | Server Midtrans | Memverifikasi tanda tangan, cek ulang status ke Midtrans, lalu memanggil `apply_midtrans_notification` |
| `_shared/midtrans.ts` | dua function Midtrans | Helper bersama: URL API, format payload, pemetaan status |

Kunci Midtrans disimpan di **Supabase Secrets**, bukan di `.env`. Setelah mengubah kode Edge Function, harus di-deploy ulang (lihat bagian 8).

### 6.4 Realtime

Aplikasi berlangganan perubahan tabel `orders` supaya layar langsung berubah tanpa refresh:

| Lokasi | Untuk apa |
| --- | --- |
| `hooks/useAwaitingCustomerOrders.ts` | Banner dan badge pesanan customer masuk (Admin, Kasir) |
| `components/OrdersScreen.tsx` | Daftar pesanan staf ikut berubah |
| `app/(customer)/orders.tsx` | Customer melihat status pesanannya berubah |
| `app/(customer)/payment.tsx` | Layar QRIS menunggu status Paid |

Polanya:

```ts
const channel = supabase
  .channel('nama-unik')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => { ... })
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

Realtime tetap tunduk pada RLS: customer hanya menerima perubahan pesanannya sendiri.

### 6.5 Auth

| Pemanggilan | Lokasi |
| --- | --- |
| `supabase.auth.signInWithPassword` | `app/(auth)/login.tsx`, `components/ProfileScreen.tsx` (verifikasi password lama) |
| `supabase.auth.signUp` | `app/(auth)/register.tsx` |
| `supabase.auth.updateUser` | `components/ProfileScreen.tsx` (ganti password) |
| `supabase.auth.signOut`, `getSession`, `onAuthStateChange` | `lib/AuthContext.tsx` |

---

## 7. Mau mengubah X, buka file apa?

### Tampilan

| Ingin mengubah | Buka |
| --- | --- |
| Warna utama, warna status, font, sudut membulat | `tailwind.config.js` (lalu cari hex lama di project, lihat 4.6) |
| Tampilan semua tombol / input / badge | `components/Button.tsx`, `Input.tsx`, `Badge.tsx` |
| Teks atau tata letak satu halaman | File halaman di tabel 4.3, bagian `return (...)` |
| Halaman Pesanan, Kas Harian, atau Profil | `components/OrdersScreen.tsx`, `DailyCashScreen.tsx`, `ProfileScreen.tsx` (berlaku untuk semua role) |
| Menu sidebar Admin/Kasir (urutan, label, ikon) | `components/SidebarDrawer.tsx` → `SIDEBAR_NAV_ITEMS` / `KASIR_NAV_ITEMS` |
| Tab bar bawah Admin | `app/(admin)/_layout.tsx` (`Tabs.Screen`) dan `components/FloatingNavbar.tsx` |
| Tampilan loading / kosong / error | `components/States.tsx` |
| Batas HP vs tablet, jumlah kolom grid | `lib/orientation-logic.ts` |
| Nama aplikasi, ikon, nama package Android | `app.json` dan folder `assets/` (perlu build ulang) |
| Halaman awal setelah login per role | `lib/auth-logic.ts` → `getDefaultRouteForRole()` |
| Struk transaksi POS | `app/(kasir)/pos.tsx` (cari `receiptModalVisible`) |

### Aturan bisnis

| Ingin mengubah | Aplikasi | Database |
| --- | --- | --- |
| Validasi form (wajib isi, panjang minimal) | `lib/<fitur>-logic.ts` → `validate...()` | Constraint/trigger tabel terkait, kalau ada |
| Minimal panjang password | `lib/auth-logic.ts` → `PASSWORD_MIN_LENGTH` | `create-staff-user/index.ts` + pengaturan Auth di dashboard Supabase |
| Aturan akun staf | `lib/staff-account-logic.ts` | `guard_user_account_rules` + `create-staff-user/index.ts` (file itu menyebut harus diubah bersamaan) |
| Batas waktu bayar di kasir (15 menit) | `lib/order-logic.ts` → `CUSTOMER_PAYMENT_TIMEOUT_MINUTES` | `customer_payment_timeout()` |
| Batas waktu QRIS online (3 menit) | `lib/order-logic.ts` → `ONLINE_PAYMENT_TIMEOUT_MINUTES` | `online_payment_timeout()` + `supabase/functions/_shared/midtrans.ts` |
| Batas keranjang customer (maks. item, maks. pesanan belum bayar) | `lib/customer-order-logic.ts` (konstanta `CUSTOMER_MAX_...`) | `create_order` (definisi terakhir) |
| Cara menghitung harga/total pesanan | `lib/pos-logic.ts` (hanya tampilan) | `create_order` (yang menentukan) |
| Transisi status pesanan (Pending → Processing → Ready → Completed) | `lib/order-logic.ts` → `canTransitionOrderStatus()` | `enforce_payment_before_processing` |
| Rumus omzet, laporan, produk terlaris | `lib/report-logic.ts`, `lib/dashboard-logic.ts` | `get_sales_summary` (definisi terakhir) |
| Status stok Aman/Low/Out | `lib/inventory-logic.ts` → `computeStockStatus()` | |
| Cara stok bertambah/berkurang | `lib/inventory-logic.ts` | `apply_stock_movement`, `record_stock_movement`, `record_stock_in` |
| Aturan buka/tutup sif | `lib/shift-logic.ts` | `open_cash_shift`, `close_cash_shift` |
| Kategori pengeluaran | `lib/expense-logic.ts` → `EXPENSE_CATEGORIES` | Constraint kolom `category` di `expenses` |
| Siapa boleh membuka halaman apa | `lib/auth-logic.ts` → `checkRoleRouteAccess()` | RLS policy tabel terkait |
| Siapa boleh membaca/mengubah data | | `CREATE POLICY` di `schema.sql` |
| Zona waktu bisnis | `lib/timezone.ts` | `business_timezone()` (ubah keduanya) |
| Pilihan metode bayar | `lib/order-logic.ts` → `PAYMENT_METHODS`, `lib/payment-gateway-logic.ts` | Constraint kolom `payment_method` di `orders` |
| Integrasi Midtrans | `lib/online-payment.ts`, `app/(customer)/payment.tsx` | `supabase/functions/create-midtrans-payment`, `midtrans-webhook`, `_shared/midtrans.ts` |
| Data awal (akun, menu contoh) | | `supabase/seed.sql` |

### Resep: menambah halaman baru untuk Admin

Contoh: halaman "Supplier".

1. Buat `app/(admin)/supplier.tsx` dengan `export default function SupplierScreen() {...}`. Salin pola dari `category.tsx`.
2. Daftarkan di `app/(admin)/_layout.tsx` sebagai `Tabs.Screen name="supplier"`. Kalau tidak ingin muncul di tab bar bawah, beri `tabBarItemStyle: { display: "none" }` seperti halaman lain.
3. Tambahkan menu di `components/SidebarDrawer.tsx` → `SIDEBAR_NAV_ITEMS` dengan `route: "/(admin)/supplier"`.
4. Kalau ada validasi, buat `lib/supplier-logic.ts` dan test-nya di `__tests__/`.
5. Kalau butuh tabel baru, ikuti resep berikutnya.

Akses role sudah otomatis terjaga karena file berada di group `(admin)`.

### Resep: menambah kolom atau tabel

Contoh: menambah kolom `sku` di `products`.

1. **Migration**: buat file baru `supabase/migrations/<YYYYMMDDHHMMSS>_product_sku.sql`, misalnya:
   ```sql
   ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
   ```
   Tulis SQL yang aman dijalankan ulang (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` sebelum `CREATE POLICY`).
2. **schema.sql**: salin isi migration yang sama ke bagian paling bawah `supabase/schema.sql`.
3. **Jalankan di Supabase**: lihat bagian 8.
4. **Tipe**: tambahkan `sku` di `types/database.ts` → `products` bagian `Row`, `Insert`, dan `Update`. File ini ditulis manual, jadi jangan lupa; tanpa ini TypeScript akan protes.
5. **Logika**: kalau ada validasi, tambahkan di `lib/product-logic.ts` dan test-nya.
6. **Tampilan**: tambahkan input dan kirim nilainya di `.insert()` / `.update()` di `app/(admin)/product.tsx`.
7. Kalau tabel baru: aktifkan RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) dan buat policy-nya. Tanpa policy, aplikasi tidak bisa membaca apa pun dari tabel itu.

### Resep: mengubah SQL function

1. Cari definisi **terakhir** function itu di `supabase/schema.sql`.
2. Salin seluruh `CREATE OR REPLACE FUNCTION ... $$;` beserta baris `GRANT`/`REVOKE` sesudahnya ke file migration baru, lalu ubah.
3. Tambahkan isi migration itu ke bawah `schema.sql`.
4. Jalankan di Supabase (bagian 8).
5. Kalau parameter atau hasilnya berubah, perbarui `types/database.ts` bagian `Functions` dan pemanggil di aplikasi (tabel 6.2).

Kalau jumlah atau tipe parameter berubah, Postgres membuat function **baru** dengan nama sama, bukan mengganti yang lama. Hapus versi lama dengan `DROP FUNCTION IF EXISTS nama(tipe_param_lama, ...)`.

---

## 8. Menerapkan perubahan

| Yang diubah | Cara menerapkan |
| --- | --- |
| File di `app/`, `components/`, `hooks/`, `lib/` | Langsung terlihat di HP saat `npx expo start` berjalan (fast refresh) |
| `tailwind.config.js`, `.env` | Hentikan Metro, jalankan `npx expo start -c` |
| `app.json`, ikon, atau menambah library native | `npx expo run:android` (build ulang) |
| Library baru | `npx expo install <nama-paket>`, bukan `npm install`, supaya versinya cocok dengan Expo SDK 58 |
| SQL (migration) | Lihat di bawah |
| Edge Function | `npx supabase functions deploy <nama>`; khusus webhook tambahkan `--no-verify-jwt` |
| APK release | Lihat [panduan-setup.md bagian 7](panduan-setup.md#7-ekspor-apk-release) |

**Menjalankan migration ke Supabase:**

- Project Supabase yang dipakai sekarang dibangun lewat SQL Editor, sehingga **tidak punya riwayat migration**. Jangan jalankan `npx supabase db push` ke project ini, karena semua migration akan dicoba dijalankan ulang dari awal.
- Untuk project ini: buka **SQL Editor** di dashboard Supabase, salin isi file migration baru (Ctrl+C, bukan Ctrl+X), lalu **Run**.
- Untuk project Supabase baru yang dibuat dengan cara A di panduan setup, `npx supabase db push` boleh dipakai.

Folder `android/` jangan diedit manual. Perubahan konfigurasi native lewat `app.json`.

---

## 9. Test dan pengecekan

Test ada di `__tests__/`, dikelompokkan per iterasi UAT. Nama `describe` mengikuti kode skenario di [uat-per-iterasi.md](uat-per-iterasi.md), misalnya `I2-01 Tambah kategori`.

| File | Cakupan |
| --- | --- |
| `iterasi-1.test.ts` | Login, guard role, karyawan, akun pengguna |
| `iterasi-2.test.ts` | Kategori, produk, bahan baku |
| `iterasi-3.test.ts` | Status pesanan, pembatalan dan refund, koreksi metode bayar, riwayat pesanan |
| `iterasi-4.test.ts` | Sif dan kas harian, pengeluaran, laporan, menu dan keranjang customer, dashboard |
| `iterasi-5.test.ts` | Transaksi POS, checkout dan pembayaran customer (di kasir dan QRIS online) |
| `lintas-iterasi.test.ts` | Orientasi layar tablet |

Komentar di baris atas tiap file menyebut skenario UAT mana yang **tidak** diuji di sana karena aturannya ada di database atau Edge Function.

Test hanya menguji `lib/*-logic.ts`. Aturan yang hanya ada di database (trigger, RLS) tidak tercakup, jadi perubahan SQL perlu dicoba langsung di aplikasi.

Sebelum menganggap perubahan selesai, jalankan:

```powershell
npm test            # semua test lulus
npx tsc --noEmit    # tidak ada error tipe
npx expo lint       # tidak ada error lint
```

---

## 10. Hal yang sering menjebak

1. **Aturan ada di dua atau tiga tempat.** Aplikasi (`lib/`), database (trigger/function), dan kadang Edge Function. Mengubah satu saja membuat aplikasi menampilkan "boleh" tapi database menolak, atau sebaliknya.
2. **Function di `schema.sql` didefinisikan berkali-kali.** Yang berlaku adalah yang paling bawah.
3. **`types/database.ts` tidak otomatis ikut berubah.** Setiap kolom atau function baru harus ditambahkan manual.
4. **Data kosong tanpa error** biasanya karena RLS, bukan karena query salah.
5. **Harga dan total dari aplikasi tidak dipakai.** `create_order` menghitung ulang dari tabel `products`. Mengubah hitungan di `pos-logic.ts` hanya mengubah tampilan keranjang.
6. **Isi `.env` tertanam saat build.** Setelah mengubahnya, restart dengan `-c`, dan build ulang APK.
7. **Jangan pernah menaruh service_role key atau key Midtrans di `.env` atau kode.** Semua variabel `EXPO_PUBLIC_*` bisa dibaca siapa saja dari APK.
8. **`STRUKTUR_PROYEK_MVC.md` di root** adalah dokumen lama. Beberapa nama file test dan daftar hook di sana sudah tidak sesuai; pakai panduan ini sebagai acuan.
