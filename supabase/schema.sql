-- ==============================================================================
-- FANTASI COFFEE MOBILE POS - MASTER DATABASE SCHEMA
-- Database: PostgreSQL (Supabase)
-- Deskripsi: Skema terpadu mencakup Modul Karyawan, Autentikasi Pengguna, 
--            Katalog Menu & Kategori, Inventaris Bahan Baku & Audit Mutasi Stok, 
--            serta Transaksi Kasir POS (Pola Snapshot).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EKSTENSI DATABASE
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 2. TABEL-TABEL MASTER & TRANSAKSI
-- ------------------------------------------------------------------------------

-- 2.1. Tabel Karyawan Kedai (employees)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    position TEXT,
    start_date DATE,
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2. Tabel Profil Pengguna (users, relasi ke auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    -- Sama dengan auth.users.id. Sengaja TANPA foreign key: jika akun login dihapus,
    -- profil tetap ada (ditandai Nonaktif) agar riwayat yang terhubung tidak hilang.
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Customer' CHECK (role IN ('Admin', 'Kasir', 'Customer')),
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3. Tabel Kategori Menu (categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4. Tabel Menu Produk (products)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    image TEXT,
    status TEXT NOT NULL DEFAULT 'Tersedia' CHECK (status IN ('Tersedia', 'Tidak Tersedia')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5. Tabel Inventaris Bahan Baku (inventory_items)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock NUMERIC NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false, -- tidak dipakai lagi (digantikan is_active)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bahan baku Aktif/Nonaktif (untuk database lama yang belum punya kolom ini)
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2.6. Tabel Riwayat Mutasi Stok (stock_movements, Pola Snapshot)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    item_name TEXT,                     -- Snapshot nama bahan baku saat mutasi
    item_unit TEXT,                     -- Snapshot satuan bahan saat mutasi
    user_name TEXT,                     -- Snapshot nama staf/kasir pencatat
    movement_type TEXT NOT NULL CHECK (movement_type IN ('Stock In', 'Stock Out', 'Stock Adjustment')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    stock_before NUMERIC NOT NULL CHECK (stock_before >= 0),
    stock_after NUMERIC NOT NULL CHECK (stock_after >= 0),
    notes TEXT,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7. Tabel Pesanan Kasir POS (orders, Pola Snapshot)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    cashier_name TEXT,                  -- Snapshot nama kasir saat transaksi
    customer_name TEXT,                 -- Nama pelanggan (opsional)
    total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Tunai', 'QRIS', 'Debit')),
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded')),
    order_status TEXT NOT NULL DEFAULT 'Processing' CHECK (order_status IN ('Pending', 'Processing', 'Ready', 'Completed', 'Cancelled')),
    order_type TEXT NOT NULL DEFAULT 'Dine In' CHECK (order_type IN ('Dine In', 'Take Away')),
    notes TEXT,
    cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.8. Tabel Detail Item Pesanan (order_items, Pola Snapshot)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,         -- Snapshot nama produk saat transaksi
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0), -- Snapshot harga produk saat transaksi
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.9. Counter Nomor Order Harian (diisi otomatis oleh trigger assign_order_number)
CREATE TABLE IF NOT EXISTS public.order_number_counters (
    order_date DATE PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);

-- ------------------------------------------------------------------------------
-- 3. INDEXING UNTUK OPTIMASI PERFORMA & QUERY
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON public.users(role, status);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

CREATE INDEX IF NOT EXISTS idx_categories_status ON public.categories(status);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

CREATE INDEX IF NOT EXISTS idx_inventory_is_deleted ON public.inventory_items(is_deleted);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_id ON public.stock_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- ------------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Fungsi untuk memeriksa apakah akun aktif merupakan Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'Admin' AND status = 'Aktif'
  );
$$;

-- Fungsi untuk memeriksa apakah akun aktif merupakan Staf Kedai (Admin atau Kasir)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('Admin', 'Kasir') AND status = 'Aktif'
  );
$$;

-- Fungsi untuk memeriksa apakah akun aktif merupakan Customer
CREATE OR REPLACE FUNCTION public.is_active_customer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'Customer' AND status = 'Aktif'
  );
$$;

-- Zona waktu bisnis: WITA (pasangan lib/timezone.ts — ubah keduanya bersamaan)
CREATE OR REPLACE FUNCTION public.business_timezone()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 'Asia/Makassar'::text;
$$;

CREATE OR REPLACE FUNCTION public.business_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (NOW() AT TIME ZONE public.business_timezone())::DATE;
$$;

-- ------------------------------------------------------------------------------
-- 5. FUNGSI OTOMASI & TRIGGERS
-- ------------------------------------------------------------------------------

-- 5.1. Trigger Pembuatan Profil Otomatis saat Auth User Baru Mendaftar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, role, status)
    VALUES (NEW.id, NEW.email, 'Customer', 'Aktif')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.2. Trigger Sinkronisasi Status: Karyawan Nonaktif -> Akun User Nonaktif
CREATE OR REPLACE FUNCTION public.handle_employee_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'Nonaktif' AND OLD.status = 'Aktif' THEN
        UPDATE public.users SET status = 'Nonaktif' WHERE employee_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_status_updated ON public.employees;
CREATE TRIGGER on_employee_status_updated
    AFTER UPDATE ON public.employees
    FOR EACH ROW 
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.handle_employee_status_change();

-- 5.3. Trigger Pembaruan Otomatis Stok Bahan Baku saat Ada Mutasi
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.inventory_id IS NOT NULL THEN
        -- Tanda bahwa perubahan stok berasal dari riwayat mutasi (berlaku di transaksi ini saja).
        PERFORM set_config('app.stock_movement', 'on', true);
        UPDATE public.inventory_items
           SET current_stock = NEW.stock_after,
               updated_at = NOW()
         WHERE id = NEW.inventory_id;
        PERFORM set_config('app.stock_movement', 'off', true);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_stock_movement_created ON public.stock_movements;
CREATE TRIGGER on_stock_movement_created
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_stock_movement();

-- 5.4. Fungsi Generik Pembaruan Kolom updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 5.5. Nomor Order Atomik ORD-YYYYMMDD-XXXX (zona waktu WIB)
-- Upsert pada counter mengunci baris per tanggal sehingga aman untuk transaksi
-- bersamaan. Nomor yang dikirim klien selalu ditimpa.
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_date DATE := public.business_today();
    v_seq INTEGER;
BEGIN
    INSERT INTO public.order_number_counters AS c (order_date, last_seq)
    VALUES (v_date, 1)
    ON CONFLICT (order_date) DO UPDATE SET last_seq = c.last_seq + 1
    RETURNING c.last_seq INTO v_seq;

    NEW.order_number := 'ORD-' || to_char(v_date, 'YYYYMMDD') || '-' ||
        CASE WHEN v_seq < 10000 THEN lpad(v_seq::TEXT, 4, '0') ELSE v_seq::TEXT END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_order_number_before_insert ON public.orders;
CREATE TRIGGER assign_order_number_before_insert
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_order_number();

-- 5.6. Gerbang Pembayaran: order tidak boleh diproses sebelum lunas
CREATE OR REPLACE FUNCTION public.enforce_payment_before_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.order_status IN ('Processing', 'Ready', 'Completed')
       AND NEW.payment_status <> 'Paid' THEN
        RAISE EXCEPTION 'Pembayaran belum dikonfirmasi: order % tidak dapat berstatus % sebelum lunas.',
            COALESCE(NEW.order_number, '(baru)'), NEW.order_status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_payment_before_processing ON public.orders;
CREATE TRIGGER enforce_payment_before_processing
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_payment_before_processing();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
-- Tanpa policy: counter hanya bisa diakses trigger SECURITY DEFINER
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;

-- 6.1. Policies: users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" 
    ON public.users FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
    ON public.users FOR SELECT
    TO authenticated
    USING ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users"
    ON public.users FOR UPDATE
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users"
    ON public.users FOR DELETE
    TO authenticated
    USING ((select public.is_admin()));

-- 6.2. Policies: employees
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees" 
    ON public.employees FOR ALL 
    TO authenticated
    USING (public.is_admin());

-- 6.3–6.6. Policies: categories, products, inventory_items, stock_movements
-- (select ...) agar fungsi dievaluasi sekali per query.
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Anyone can view categories"
    ON public.categories FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (is_active = true OR (select public.is_admin()));

DROP POLICY IF EXISTS "Staff can update product status" ON public.products;
CREATE POLICY "Staff can update product status"
    ON public.products FOR UPDATE
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products"
    ON public.products FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Staff can view inventory" ON public.inventory_items;
CREATE POLICY "Staff can view inventory"
    ON public.inventory_items FOR SELECT
    TO authenticated
    USING ((select public.is_staff()) AND (is_active OR (select public.is_admin())));

DROP POLICY IF EXISTS "Staff can insert inventory" ON public.inventory_items;
CREATE POLICY "Staff can insert inventory"
    ON public.inventory_items FOR INSERT
    TO authenticated
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory_items;
CREATE POLICY "Staff can update inventory"
    ON public.inventory_items FOR UPDATE
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory_items;
CREATE POLICY "Admins can delete inventory"
    ON public.inventory_items FOR DELETE
    TO authenticated
    USING ((select public.is_admin()));

DROP POLICY IF EXISTS "Staff can view stock movements" ON public.stock_movements;
CREATE POLICY "Staff can view stock movements"
    ON public.stock_movements FOR SELECT
    TO authenticated
    USING ((select public.is_staff()));

-- Riwayat mutasi hanya ditulis lewat record_stock_in / record_stock_movement.
DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;

-- 6.7. Policies: orders
DROP POLICY IF EXISTS "Staff can manage orders" ON public.orders;
CREATE POLICY "Staff can manage orders"
    ON public.orders FOR ALL
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
CREATE POLICY "Customers can create own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_active_customer())
        AND user_id = (select auth.uid())
        AND order_status = 'Pending'
        AND payment_status = 'Pending'
        AND cancelled_by IS NULL
        AND cancelled_at IS NULL
    );

-- 6.8. Policies: order_items
DROP POLICY IF EXISTS "Staff can manage order items" ON public.order_items;
CREATE POLICY "Staff can manage order items"
    ON public.order_items FOR ALL
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;
CREATE POLICY "Customers can view own order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id AND orders.user_id = (select auth.uid())
        )
    );

-- Customer hanya boleh menambah item ke order Pending miliknya, dengan harga
-- resmi produk (mencegah manipulasi harga dari klien).
DROP POLICY IF EXISTS "Customers can add items to own pending orders" ON public.order_items;
CREATE POLICY "Customers can add items to own pending orders"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_active_customer())
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.user_id = (select auth.uid())
              AND o.order_status = 'Pending'
        )
        AND EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = order_items.product_id
              AND p.is_active = true
              AND p.status = 'Tersedia'
              AND p.price = order_items.unit_price
        )
        AND order_items.subtotal = order_items.unit_price * order_items.quantity
    );

-- ------------------------------------------------------------------------------
-- 7. HAK AKSES ROLE & POSTGREST CACHE
-- ------------------------------------------------------------------------------
-- Semua policy hanya untuk `authenticated`; role `anon` tidak butuh akses tabel.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- Counter nomor order hanya untuk trigger internal
REVOKE ALL ON public.order_number_counters FROM anon, authenticated;

-- Refresh cache PostgREST Supabase
-- ==============================================================================
-- 9. TABEL EXPENSES (BIAYA OPERASIONAL - ITERASI 3.7)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Raw Material', 'Operational', 'Equipment', 'Other')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Biaya pembelian yang dicatat lewat Stock In (satu Stock In maksimal satu expense)
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS stock_movement_id UUID UNIQUE REFERENCES public.stock_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expenses FROM anon;
GRANT ALL ON public.expenses TO authenticated;

DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
CREATE POLICY "Admins can manage expenses"
    ON public.expenses FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP TRIGGER IF EXISTS set_expenses_updated_at ON public.expenses;
CREATE TRIGGER set_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Kas harian: pengeluaran dibayar dari kas laci (default) atau sumber lain
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS paid_from_cash BOOLEAN NOT NULL DEFAULT true;

-- Staf dapat melihat pengeluaran hari ini (WIB) untuk rekap kas
DROP POLICY IF EXISTS "Staff can view expenses today" ON public.expenses;
CREATE POLICY "Staff can view expenses today"
    ON public.expenses FOR SELECT
    TO authenticated
    USING (
        (select public.is_staff())
        AND expense_date = (select public.business_today())
    );

-- Staf dapat mencatat pengeluaran kas hari ini atas namanya sendiri
DROP POLICY IF EXISTS "Staff can record cash expenses today" ON public.expenses;
CREATE POLICY "Staff can record cash expenses today"
    ON public.expenses FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_staff())
        AND expense_date = (select public.business_today())
        AND created_by = (select auth.uid())
        AND paid_from_cash = true
        AND stock_movement_id IS NULL
    );

-- ==============================================================================
-- 9.1. STOCK IN SEKALIGUS BIAYA PEMBELIAN (#4)
-- Mutasi stok + expense opsional dalam satu transaksi. Kasir boleh memakainya;
-- ubah/hapus expense tetap khusus Admin. Expense bertanggal hari ini WIB.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_stock_in(
    p_inventory_id UUID,
    p_quantity NUMERIC,
    p_notes TEXT DEFAULT NULL,
    p_purchase_amount NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.inventory_items%ROWTYPE;
    v_after NUMERIC;
    v_user_name TEXT;
    v_movement_id UUID;
    v_expense_id UUID;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir aktif yang dapat mencatat Stock In.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Jumlah Stock In harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
    END IF;

    IF p_purchase_amount IS NOT NULL AND p_purchase_amount <= 0 THEN
        RAISE EXCEPTION 'Total harga pembelian harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE id = p_inventory_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan atau nonaktif.' USING ERRCODE = 'no_data_found';
    END IF;

    v_after := v_item.current_stock + p_quantity;
    SELECT email INTO v_user_name FROM public.users WHERE id = auth.uid();

    INSERT INTO public.stock_movements
        (inventory_id, item_name, item_unit, movement_type, quantity, stock_before, stock_after, notes, user_id, user_name)
    VALUES
        (v_item.id, v_item.name, v_item.unit, 'Stock In', p_quantity, v_item.current_stock, v_after,
         NULLIF(btrim(p_notes), ''), auth.uid(), v_user_name)
    RETURNING id INTO v_movement_id;

    IF p_purchase_amount IS NOT NULL THEN
        INSERT INTO public.expenses (description, category, amount, expense_date, created_by, stock_movement_id)
        VALUES (
            'Pembelian ' || v_item.name || ' ' || trim_scale(p_quantity)::TEXT || ' ' || v_item.unit,
            'Raw Material',
            p_purchase_amount,
            public.business_today(),
            auth.uid(),
            v_movement_id
        )
        RETURNING id INTO v_expense_id;
    END IF;

    RETURN json_build_object(
        'movement_id', v_movement_id,
        'expense_id', v_expense_id,
        'stock_after', v_after
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_stock_in(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_in(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

-- ==============================================================================
-- 10. HAK EKSEKUSI FUNGSI (Supabase Security Advisor)
-- Default Postgres memberi EXECUTE ke PUBLIC sehingga fungsi bisa dipanggil via
-- /rest/v1/rpc/... oleh anon. Trigger tetap berjalan tanpa hak EXECUTE.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_before_processing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_employee_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

-- Helper RLS hanya untuk authenticated (semua policy berlaku TO authenticated)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_customer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_customer() TO authenticated;

-- ==============================================================================
-- 11. SIF KASIR — BUKA / TUTUP SIF (PRD Section 20.2)
-- Satu laci, sif bergantian; uang di laci terakumulasi lintas sif.
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Tabel sif
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    opened_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    opened_by_name TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opening_cash NUMERIC NOT NULL CHECK (opening_cash >= 0),
    opening_note TEXT,
    closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    closed_by_name TEXT,
    closed_at TIMESTAMPTZ,
    expected_cash NUMERIC,
    counted_cash NUMERIC CHECK (counted_cash >= 0),
    cash_withdrawn NUMERIC NOT NULL DEFAULT 0 CHECK (cash_withdrawn >= 0),
    difference NUMERIC,
    closing_note TEXT,
    CONSTRAINT cash_shifts_closed_complete CHECK (
        status = 'Open'
        OR (closed_at IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL
            AND cash_withdrawn <= counted_cash)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cash_shifts_one_open ON public.cash_shifts ((true)) WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at ON public.cash_shifts(opened_at DESC);

ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_shifts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cash_shifts FROM authenticated;
GRANT SELECT ON public.cash_shifts TO authenticated;

DROP POLICY IF EXISTS "Staff can view cash shifts" ON public.cash_shifts;
CREATE POLICY "Staff can view cash shifts"
    ON public.cash_shifts FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- ------------------------------------------------------------------------------
-- 2. Relasi pembayaran / refund / pengeluaran ke sif
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_shift_id UUID REFERENCES public.cash_shifts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS refunded_shift_id UUID REFERENCES public.cash_shifts(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.cash_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_paid_shift_id ON public.orders(paid_shift_id);
CREATE INDEX IF NOT EXISTS idx_orders_refunded_shift_id ON public.orders(refunded_shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON public.expenses(shift_id);

CREATE OR REPLACE FUNCTION public.current_open_shift_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.cash_shifts WHERE status = 'Open' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.track_order_payment_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift UUID;
BEGIN
    -- Uang masuk ke sif saat pembayaran diterima (bukan saat order dibuat).
    IF NEW.payment_status = 'Paid'
       AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid') THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum menerima pembayaran.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.paid_shift_id := v_shift;
        NEW.paid_at := NOW();
    END IF;

    -- Refund mengurangi kas pada sif tempat refund dilakukan.
    IF TG_OP = 'UPDATE' AND NEW.payment_status = 'Refunded'
       AND OLD.payment_status IS DISTINCT FROM 'Refunded' THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum memproses refund.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.refunded_shift_id := v_shift;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_order_payment_shift ON public.orders;
CREATE TRIGGER track_order_payment_shift BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.track_order_payment_shift();

CREATE OR REPLACE FUNCTION public.assign_expense_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift UUID;
BEGIN
    IF NOT NEW.paid_from_cash THEN
        NEW.shift_id := NULL;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL THEN
            -- Admin boleh mencatat pengeluaran kas lampau/di luar sif (tidak masuk sif mana pun).
            IF NOT public.is_admin() THEN
                RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum mencatat pengeluaran dari kas.'
                    USING ERRCODE = 'check_violation';
            END IF;
        ELSIF NEW.expense_date = public.business_today() THEN
            NEW.shift_id := v_shift;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_expense_shift ON public.expenses;
CREATE TRIGGER assign_expense_shift BEFORE INSERT OR UPDATE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.assign_expense_shift();

-- ------------------------------------------------------------------------------
-- 3. Ringkasan, buka & tutup sif
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shift_summary(p_shift_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift public.cash_shifts%ROWTYPE;
    v_cash_in NUMERIC;
    v_cash_refunds NUMERIC;
    v_qris_in NUMERIC;
    v_debit_in NUMERIC;
    v_cash_expenses NUMERIC;
    v_paid_count INTEGER;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir yang dapat melihat ringkasan sif.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_shift_id IS NULL THEN
        SELECT * INTO v_shift FROM public.cash_shifts WHERE status = 'Open' LIMIT 1;
    ELSE
        SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
    END IF;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'Tunai'), 0),
           COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'QRIS'), 0),
           COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'Debit'), 0),
           COUNT(*)
      INTO v_cash_in, v_qris_in, v_debit_in, v_paid_count
      FROM public.orders WHERE paid_shift_id = v_shift.id;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_refunds
      FROM public.orders WHERE refunded_shift_id = v_shift.id AND payment_method = 'Tunai';

    SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
      FROM public.expenses WHERE shift_id = v_shift.id AND paid_from_cash;

    RETURN json_build_object(
        'id', v_shift.id,
        'status', v_shift.status,
        'opened_by', v_shift.opened_by,
        'opened_by_name', v_shift.opened_by_name,
        'opened_at', v_shift.opened_at,
        'opening_cash', v_shift.opening_cash,
        'opening_note', v_shift.opening_note,
        'cash_in', v_cash_in,
        'cash_refunds', v_cash_refunds,
        'qris_in', v_qris_in,
        'debit_in', v_debit_in,
        'cash_expenses', v_cash_expenses,
        'paid_order_count', v_paid_count,
        'expected_cash', v_shift.opening_cash + v_cash_in - v_cash_refunds - v_cash_expenses,
        'closed_at', v_shift.closed_at,
        'closed_by_name', v_shift.closed_by_name,
        'counted_cash', v_shift.counted_cash,
        'cash_withdrawn', v_shift.cash_withdrawn,
        'difference', v_shift.difference,
        'closing_note', v_shift.closing_note
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_shift(p_opening_cash NUMERIC, p_note TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open public.cash_shifts%ROWTYPE;
    v_suggested NUMERIC;
    v_id UUID;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir yang dapat membuka sif.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_open FROM public.cash_shifts WHERE status = 'Open' LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Masih ada sif aktif yang dibuka oleh %. Tutup sif tersebut terlebih dahulu.',
            COALESCE(v_open.opened_by_name, 'staf lain') USING ERRCODE = 'unique_violation';
    END IF;

    IF p_opening_cash IS NULL OR p_opening_cash < 0 THEN
        RAISE EXCEPTION 'Modal awal harus 0 atau lebih.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT counted_cash - cash_withdrawn INTO v_suggested
      FROM public.cash_shifts WHERE status = 'Closed' ORDER BY closed_at DESC LIMIT 1;

    IF v_suggested IS NOT NULL AND p_opening_cash <> v_suggested AND NULLIF(btrim(p_note), '') IS NULL THEN
        RAISE EXCEPTION 'Modal awal berbeda dari sisa kas sif sebelumnya (%). Isi catatan penyebabnya.', v_suggested
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.cash_shifts (opened_by, opened_by_name, opening_cash, opening_note)
    VALUES (auth.uid(), (SELECT email FROM public.users WHERE id = auth.uid()), p_opening_cash, NULLIF(btrim(p_note), ''))
    RETURNING id INTO v_id;

    RETURN public.get_shift_summary(v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_shift(
    p_counted NUMERIC,
    p_withdrawn NUMERIC DEFAULT 0,
    p_note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift public.cash_shifts%ROWTYPE;
    v_expected NUMERIC;
    v_difference NUMERIC;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir yang dapat menutup sif.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_shift FROM public.cash_shifts WHERE status = 'Open' LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tidak ada sif aktif untuk ditutup.' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_shift.opened_by IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya kasir yang membuka sif atau Admin yang dapat menutup sif ini.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_counted IS NULL OR p_counted < 0 THEN
        RAISE EXCEPTION 'Uang fisik di laci wajib diisi (0 atau lebih).' USING ERRCODE = 'check_violation';
    END IF;

    p_withdrawn := COALESCE(p_withdrawn, 0);
    IF p_withdrawn < 0 OR p_withdrawn > p_counted THEN
        RAISE EXCEPTION 'Uang yang disetor harus antara 0 dan uang di laci.' USING ERRCODE = 'check_violation';
    END IF;

    v_expected := (public.get_shift_summary(v_shift.id) ->> 'expected_cash')::NUMERIC;
    v_difference := p_counted - v_expected;

    IF v_difference <> 0 AND NULLIF(btrim(p_note), '') IS NULL THEN
        RAISE EXCEPTION 'Ada selisih kas sebesar %. Isi catatan penyebab selisih.', v_difference
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.cash_shifts SET
        status = 'Closed',
        closed_by = auth.uid(),
        closed_by_name = (SELECT email FROM public.users WHERE id = auth.uid()),
        closed_at = NOW(),
        expected_cash = v_expected,
        counted_cash = p_counted,
        cash_withdrawn = p_withdrawn,
        difference = v_difference,
        closing_note = NULLIF(btrim(p_note), '')
    WHERE id = v_shift.id;

    RETURN public.get_shift_summary(v_shift.id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.current_open_shift_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_order_payment_shift() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_expense_shift() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_shift_summary(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_cash_shift(NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_cash_shift(NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shift_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_shift(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ==============================================================================
-- 12. SIKLUS HIDUP AKUN (AUDIT ITERASI 1)
-- Hapus profil → akun login ikut terhapus; hapus akun login → profil tetap (Nonaktif).
-- Admin aktif terakhir tidak dapat dihapus / diturunkan / dinonaktifkan.
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Profil tidak lagi ikut terhapus saat akun login dihapus
-- ------------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.users
       SET status = 'Nonaktif', updated_at = NOW()
     WHERE id = OLD.id AND status <> 'Nonaktif';
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Hapus profil → hapus akun login (sesi & refresh token ikut terhapus)
CREATE OR REPLACE FUNCTION public.handle_profile_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM auth.users WHERE id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.users;
CREATE TRIGGER on_profile_deleted AFTER DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_profile_deleted();

-- ------------------------------------------------------------------------------
-- 2. Pengaman Admin aktif terakhir
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.role = 'Admin' AND OLD.status = 'Aktif'
       AND (TG_OP = 'DELETE' OR NEW.role <> 'Admin' OR NEW.status <> 'Aktif') THEN
        -- Serialisasi: dua Admin yang saling menurunkan secara bersamaan tidak boleh lolos berdua.
        PERFORM pg_advisory_xact_lock(hashtext('public.protect_last_admin'));
        IF NOT EXISTS (
            SELECT 1 FROM public.users
             WHERE id <> OLD.id AND role = 'Admin' AND status = 'Aktif'
        ) THEN
            RAISE EXCEPTION 'Tidak dapat menghapus, menurunkan role, atau menonaktifkan Admin aktif terakhir. Tambahkan Admin lain terlebih dahulu.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_admin ON public.users;
CREATE TRIGGER protect_last_admin BEFORE UPDATE OR DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- ------------------------------------------------------------------------------
-- 4. Fungsi trigger tidak boleh dipanggil lewat RPC
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_deleted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 13. INTEGRITAS STOK & PRODUK (AUDIT ITERASI 2)
-- Angka stok hanya berubah lewat riwayat mutasi; Stock Out & Opname dihitung di
-- database; non-Admin hanya boleh mengubah status produk.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.guard_inventory_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.current_stock IS DISTINCT FROM OLD.current_stock
       AND COALESCE(current_setting('app.stock_movement', true), 'off') <> 'on'
       AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Stok tidak dapat diubah langsung. Catat lewat Stock In, Stock Out, atau Stock Opname agar tercatat di riwayat.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active
       AND auth.uid() IS NOT NULL
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya Admin yang dapat mengaktifkan atau menonaktifkan bahan baku.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_inventory_stock_change ON public.inventory_items;
CREATE TRIGGER guard_inventory_stock_change BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_stock_change();

CREATE OR REPLACE FUNCTION public.record_stock_movement(
    p_inventory_id UUID,
    p_movement_type TEXT,
    p_quantity NUMERIC,
    p_notes TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.inventory_items%ROWTYPE;
    v_after NUMERIC;
    v_change NUMERIC;
    v_id UUID;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir aktif yang dapat mencatat perubahan stok.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_movement_type NOT IN ('Stock Out', 'Stock Adjustment') THEN
        RAISE EXCEPTION 'Jenis perubahan stok tidak valid. Stock In dicatat lewat record_stock_in.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NULLIF(btrim(p_notes), '') IS NULL THEN
        RAISE EXCEPTION 'Keterangan wajib diisi untuk Stock Out dan Stock Opname.' USING ERRCODE = 'check_violation';
    END IF;

    IF p_quantity IS NULL THEN
        RAISE EXCEPTION 'Jumlah wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Kunci baris bahan agar perubahan bersamaan tidak saling menimpa.
    SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan.' USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT v_item.is_active THEN
        RAISE EXCEPTION 'Bahan baku nonaktif. Aktifkan kembali (Admin) sebelum mencatat perubahan stok.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_movement_type = 'Stock Out' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'Jumlah Stock Out harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
        END IF;
        IF p_quantity > v_item.current_stock THEN
            RAISE EXCEPTION 'Stok tidak mencukupi. Stok saat ini: % %.', v_item.current_stock, v_item.unit
                USING ERRCODE = 'check_violation';
        END IF;
        v_after := v_item.current_stock - p_quantity;
        v_change := p_quantity;
    ELSE
        -- Opname: p_quantity = stok fisik aktual (0 diperbolehkan).
        IF p_quantity < 0 THEN
            RAISE EXCEPTION 'Stok fisik tidak boleh negatif.' USING ERRCODE = 'check_violation';
        END IF;
        IF p_quantity = v_item.current_stock THEN
            RAISE EXCEPTION 'Stok fisik sama dengan stok sistem, tidak ada yang perlu disesuaikan.'
                USING ERRCODE = 'check_violation';
        END IF;
        v_after := p_quantity;
        v_change := abs(p_quantity - v_item.current_stock);
    END IF;

    INSERT INTO public.stock_movements
        (inventory_id, item_name, item_unit, movement_type, quantity, stock_before, stock_after, notes, user_id, user_name)
    VALUES
        (v_item.id, v_item.name, v_item.unit, p_movement_type, v_change, v_item.current_stock, v_after,
         btrim(p_notes), auth.uid(), (SELECT email FROM public.users WHERE id = auth.uid()))
    RETURNING id INTO v_id;

    RETURN json_build_object('movement_id', v_id, 'stock_before', v_item.current_stock, 'stock_after', v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_product_staff_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT public.is_admin()
       AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
        RAISE EXCEPTION 'Kasir hanya dapat mengubah status ketersediaan produk. Perubahan lain hanya dapat dilakukan Admin.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_staff_update ON public.products;
CREATE TRIGGER guard_product_staff_update BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_product_staff_update();

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON public.stock_movements(user_id);

REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_inventory_stock_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_staff_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_stock_movement(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ==============================================================================
-- 14. ORDER ATOMIK & LAPORAN PER PERIODE (AUDIT ITERASI 3)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_is_staff BOOLEAN := public.is_staff();
    v_item JSONB;
    v_qty INTEGER;
    v_product public.products%ROWTYPE;
    v_total NUMERIC := 0;
    v_customer TEXT := NULLIF(btrim(p_customer_name), '');
    v_order public.orders%ROWTYPE;
BEGIN
    -- SECURITY INVOKER: RLS & trigger (sif, gerbang pembayaran, nomor order) tetap berlaku.
    IF NOT v_is_staff AND NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Akun ini tidak diizinkan membuat pesanan.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang belanja masih kosong.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_is_staff AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Nama pemesan wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Validasi item & hitung total dari harga resmi produk.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Jumlah item tidak valid.' USING ERRCODE = 'check_violation';
        END IF;

        SELECT p.* INTO v_product
          FROM public.products p
         WHERE p.id = (v_item ->> 'product_id')::UUID
           AND p.is_active = true
           AND p.status = 'Tersedia';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.'
                USING ERRCODE = 'check_violation';
        END IF;

        v_total := v_total + v_product.price * v_qty;
    END LOOP;

    INSERT INTO public.orders
        (user_id, cashier_name, customer_name, total_amount, payment_method,
         payment_status, order_status, order_type, notes)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING * INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    SELECT v_order.id, p.id, p.name, p.price, (i.value ->> 'quantity')::INTEGER,
           p.price * (i.value ->> 'quantity')::INTEGER, NULLIF(btrim(i.value ->> 'notes'), '')
      FROM jsonb_array_elements(p_items) AS i
      JOIN public.products p ON p.id = (i.value ->> 'product_id')::UUID;

    RETURN json_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'total_amount', v_order.total_amount,
        'order_status', v_order.order_status,
        'payment_status', v_order.payment_status,
        'created_at', v_order.created_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_summary(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Laporan hanya dapat dilihat oleh Admin.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Batas hari mengikuti zona waktu bisnis. Penjualan diakui saat dibayar (paid_at);
    -- data lama tanpa paid_at memakai created_at (index idx_orders_revenue_at).
    v_start := CASE WHEN p_from IS NULL THEN '-infinity'::TIMESTAMPTZ
                    ELSE p_from::TIMESTAMP AT TIME ZONE public.business_timezone() END;
    v_end := CASE WHEN p_to IS NULL THEN 'infinity'::TIMESTAMPTZ
                  ELSE (p_to + 1)::TIMESTAMP AT TIME ZONE public.business_timezone() END;

    WITH sales AS (
        SELECT o.id, o.total_amount
          FROM public.orders o
         WHERE o.payment_status = 'Paid'
           AND o.order_status <> 'Cancelled'
           AND COALESCE(o.paid_at, o.created_at) >= v_start
           AND COALESCE(o.paid_at, o.created_at) < v_end
    ),
    items AS (
        SELECT oi.product_id, oi.product_name, oi.quantity, oi.subtotal
          FROM public.order_items oi
          JOIN sales s ON s.id = oi.order_id
    ),
    top_products AS (
        SELECT (array_agg(product_id))[1] AS product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity_sold,
               SUM(subtotal) AS total_revenue
          FROM items
         GROUP BY COALESCE(product_id::TEXT, product_name)
         ORDER BY SUM(quantity) DESC, SUM(subtotal) DESC
         LIMIT 5
    ),
    expense_categories AS (
        SELECT category, SUM(amount) AS amount
          FROM public.expenses
         WHERE (p_from IS NULL OR expense_date >= p_from)
           AND (p_to IS NULL OR expense_date <= p_to)
         GROUP BY category
    )
    SELECT json_build_object(
        'total_revenue', COALESCE((SELECT SUM(total_amount) FROM sales), 0),
        'paid_orders', (SELECT COUNT(*) FROM sales),
        'items_sold', COALESCE((SELECT SUM(quantity) FROM items), 0),
        'top_products', COALESCE((SELECT json_agg(t ORDER BY t.quantity_sold DESC, t.total_revenue DESC) FROM top_products t), '[]'::JSON),
        'total_expenses', COALESCE((SELECT SUM(amount) FROM expense_categories), 0),
        'expenses_by_category', COALESCE((SELECT json_agg(e) FROM expense_categories e), '[]'::JSON)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_by ON public.cash_shifts(opened_by);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_closed_by ON public.cash_shifts(closed_by);

REVOKE EXECUTE ON FUNCTION public.business_timezone() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.business_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_timezone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_today() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) TO authenticated;

-- ==============================================================================
-- 15. ORDER ADMIN (PRD 15.1) & PEMBATALAN OLEH CUSTOMER (#6)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id UUID, p_reason TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Hanya customer aktif yang dapat membatalkan pesanannya.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'Alasan pembatalan minimal 3 karakter.' USING ERRCODE = 'check_violation';
    END IF;

    -- Kunci baris: kasir yang mengonfirmasi pembayaran bersamaan harus menunggu.
    SELECT * INTO v_order
      FROM public.orders
     WHERE id = p_order_id AND user_id = auth.uid()
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan.' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_order.order_status <> 'Pending' OR v_order.payment_status <> 'Pending' THEN
        RAISE EXCEPTION 'Pesanan sudah dibayar atau sedang diproses. Hubungi kasir untuk pembatalan.'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.orders
       SET order_status = 'Cancelled',
           cancelled_by = auth.uid(),
           cancelled_at = NOW(),
           cancellation_reason = btrim(p_reason),
           updated_at = NOW()
     WHERE id = v_order.id;

    RETURN json_build_object('id', v_order.id, 'order_number', v_order.order_number, 'order_status', 'Cancelled');
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Koreksi metode pembayaran: khusus Admin, tercatat di catatan order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_payment_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method AND auth.uid() IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Hanya Admin yang dapat mengoreksi metode pembayaran.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.notes := concat_ws(
            ' | ',
            NULLIF(OLD.notes, ''),
            format('Koreksi metode pembayaran oleh %s: %s → %s',
                   COALESCE((SELECT email FROM public.users WHERE id = auth.uid()), 'Admin'),
                   OLD.payment_method, NEW.payment_method)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_order_payment_correction ON public.orders;
CREATE TRIGGER guard_order_payment_correction BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_correction();

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.guard_order_payment_correction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_my_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(UUID, TEXT) TO authenticated;

-- ==============================================================================
-- 16. AUDIT ITERASI 4: BATAS BAYAR 15 MENIT, REALTIME, OMZET SAAT DIBAYAR
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Batas bayar pesanan customer
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.customer_payment_timeout()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT INTERVAL '15 minutes' $$;

-- Diisi database (nilai dari klien diabaikan) dan tidak dapat diperpanjang lewat UPDATE.
CREATE OR REPLACE FUNCTION public.set_order_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.order_status = 'Pending' AND NEW.payment_status = 'Pending' THEN
            NEW.payment_due_at := COALESCE(NEW.created_at, NOW()) + public.customer_payment_timeout();
        ELSE
            NEW.payment_due_at := NULL;
        END IF;
    ELSIF OLD.payment_due_at IS NOT NULL THEN
        NEW.payment_due_at := OLD.payment_due_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_payment_due ON public.orders;
CREATE TRIGGER set_order_payment_due BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_payment_due();

-- Pesanan lama yang masih menunggu bayar ikut mendapat batas waktu.
UPDATE public.orders
   SET payment_due_at = created_at + public.customer_payment_timeout()
 WHERE order_status = 'Pending' AND payment_status = 'Pending' AND payment_due_at IS NULL;

-- Kasir tidak dapat menerima pembayaran untuk pesanan yang kedaluwarsa atau dibatalkan.
CREATE OR REPLACE FUNCTION public.guard_expired_order_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'Paid' AND OLD.payment_status IS DISTINCT FROM 'Paid' THEN
        IF OLD.order_status = 'Cancelled' THEN
            RAISE EXCEPTION 'Pesanan % sudah dibatalkan sehingga pembayarannya tidak dapat diterima.', OLD.order_number
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.payment_due_at IS NOT NULL AND OLD.payment_due_at <= NOW() THEN
            RAISE EXCEPTION 'Pesanan % sudah kedaluwarsa (tidak dibayar dalam % menit). Buat pesanan baru lewat POS.',
                OLD.order_number, EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_expired_order_payment ON public.orders;
CREATE TRIGGER guard_expired_order_payment BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_expired_order_payment();

-- Membatalkan pesanan customer yang melewati batas bayar. Aman dipanggil berulang.
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.orders
       SET order_status = 'Cancelled',
           cancelled_at = NOW(),
           cancellation_reason = format('Otomatis dibatalkan: tidak dibayar dalam %s menit.',
                                        EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60),
           updated_at = NOW()
     WHERE order_status = 'Pending'
       AND payment_status = 'Pending'
       AND payment_due_at IS NOT NULL
       AND payment_due_at <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment ON public.orders(payment_due_at)
    WHERE order_status = 'Pending' AND payment_status = 'Pending';

-- Jadwal tiap menit bila ekstensi pg_cron aktif (Dashboard → Database → Extensions).
-- Tanpa pg_cron, aplikasi tetap memanggil expire_unpaid_orders() saat memuat pesanan.
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('expire-unpaid-orders', '* * * * *', 'SELECT public.expire_unpaid_orders()');
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 2. Realtime untuk tabel orders (RLS tetap berlaku pada event realtime)
-- ------------------------------------------------------------------------------
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 3 & 4. Omzet diakui saat dibayar; create_order mengembalikan batas bayar
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_revenue_at ON public.orders ((COALESCE(paid_at, created_at)));

CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_is_staff BOOLEAN := public.is_staff();
    v_item JSONB;
    v_qty INTEGER;
    v_product public.products%ROWTYPE;
    v_total NUMERIC := 0;
    v_customer TEXT := NULLIF(btrim(p_customer_name), '');
    v_order public.orders%ROWTYPE;
BEGIN
    -- SECURITY INVOKER: RLS & trigger (sif, gerbang pembayaran, nomor order) tetap berlaku.
    IF NOT v_is_staff AND NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Akun ini tidak diizinkan membuat pesanan.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang belanja masih kosong.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_is_staff AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Nama pemesan wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Validasi item & hitung total dari harga resmi produk.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Jumlah item tidak valid.' USING ERRCODE = 'check_violation';
        END IF;

        SELECT p.* INTO v_product
          FROM public.products p
         WHERE p.id = (v_item ->> 'product_id')::UUID
           AND p.is_active = true
           AND p.status = 'Tersedia';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.'
                USING ERRCODE = 'check_violation';
        END IF;

        v_total := v_total + v_product.price * v_qty;
    END LOOP;

    INSERT INTO public.orders
        (user_id, cashier_name, customer_name, total_amount, payment_method,
         payment_status, order_status, order_type, notes)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING * INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    SELECT v_order.id, p.id, p.name, p.price, (i.value ->> 'quantity')::INTEGER,
           p.price * (i.value ->> 'quantity')::INTEGER, NULLIF(btrim(i.value ->> 'notes'), '')
      FROM jsonb_array_elements(p_items) AS i
      JOIN public.products p ON p.id = (i.value ->> 'product_id')::UUID;

    RETURN json_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'total_amount', v_order.total_amount,
        'order_status', v_order.order_status,
        'payment_status', v_order.payment_status,
        'created_at', v_order.created_at,
        'payment_due_at', v_order.payment_due_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_summary(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Laporan hanya dapat dilihat oleh Admin.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Batas hari mengikuti zona waktu bisnis. Penjualan diakui saat dibayar (paid_at);
    -- data lama tanpa paid_at memakai created_at (index idx_orders_revenue_at).
    v_start := CASE WHEN p_from IS NULL THEN '-infinity'::TIMESTAMPTZ
                    ELSE p_from::TIMESTAMP AT TIME ZONE public.business_timezone() END;
    v_end := CASE WHEN p_to IS NULL THEN 'infinity'::TIMESTAMPTZ
                  ELSE (p_to + 1)::TIMESTAMP AT TIME ZONE public.business_timezone() END;

    WITH sales AS (
        SELECT o.id, o.total_amount
          FROM public.orders o
         WHERE o.payment_status = 'Paid'
           AND o.order_status <> 'Cancelled'
           AND COALESCE(o.paid_at, o.created_at) >= v_start
           AND COALESCE(o.paid_at, o.created_at) < v_end
    ),
    items AS (
        SELECT oi.product_id, oi.product_name, oi.quantity, oi.subtotal
          FROM public.order_items oi
          JOIN sales s ON s.id = oi.order_id
    ),
    top_products AS (
        SELECT (array_agg(product_id))[1] AS product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity_sold,
               SUM(subtotal) AS total_revenue
          FROM items
         GROUP BY COALESCE(product_id::TEXT, product_name)
         ORDER BY SUM(quantity) DESC, SUM(subtotal) DESC
         LIMIT 5
    ),
    expense_categories AS (
        SELECT category, SUM(amount) AS amount
          FROM public.expenses
         WHERE (p_from IS NULL OR expense_date >= p_from)
           AND (p_to IS NULL OR expense_date <= p_to)
         GROUP BY category
    )
    SELECT json_build_object(
        'total_revenue', COALESCE((SELECT SUM(total_amount) FROM sales), 0),
        'paid_orders', (SELECT COUNT(*) FROM sales),
        'items_sold', COALESCE((SELECT SUM(quantity) FROM items), 0),
        'top_products', COALESCE((SELECT json_agg(t ORDER BY t.quantity_sold DESC, t.total_revenue DESC) FROM top_products t), '[]'::JSON),
        'total_expenses', COALESCE((SELECT SUM(amount) FROM expense_categories), 0),
        'expenses_by_category', COALESCE((SELECT json_agg(e) FROM expense_categories e), '[]'::JSON)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.customer_payment_timeout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_payment_timeout() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_payment_due() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_expired_order_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) TO authenticated;

-- ==============================================================================
-- 17. ATURAN KATEGORI & PRODUK: kategori dengan produk tidak dapat dinonaktifkan
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.guard_category_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NEW.status = 'Nonaktif' AND OLD.status IS DISTINCT FROM 'Nonaktif'
       AND EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = NEW.id) THEN
        SELECT COUNT(*) INTO v_count FROM public.products WHERE category_id = NEW.id;
        RAISE EXCEPTION 'Kategori "%" masih dipakai % produk. Pindahkan produk tersebut ke kategori lain atau hapus produknya terlebih dahulu.',
            NEW.name, v_count
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_category_deactivation ON public.categories;
CREATE TRIGGER guard_category_deactivation BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_deactivation();

CREATE OR REPLACE FUNCTION public.guard_product_category_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_active AND NEW.category_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.is_active IS DISTINCT FROM OLD.is_active)
       AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.status = 'Nonaktif') THEN
        RAISE EXCEPTION 'Kategori yang dipilih sedang nonaktif. Aktifkan kategorinya atau pilih kategori lain.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_category_active ON public.products;
CREATE TRIGGER guard_product_category_active BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_product_category_active();

REVOKE EXECUTE ON FUNCTION public.guard_category_deactivation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_category_active() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 18. ATURAN KARYAWAN & AKUN PENGGUNA: akun customer terpisah, akun karyawan wajib
--     terhubung ke satu data karyawan, karyawan tidak dapat dihapus
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Nama di profil
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, role, status, full_name)
    VALUES (NEW.id, NEW.email, 'Customer', 'Aktif', NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

UPDATE public.users u
   SET full_name = NULLIF(btrim(a.raw_user_meta_data ->> 'name'), '')
  FROM auth.users a
 WHERE a.id = u.id
   AND u.full_name IS NULL
   AND NULLIF(btrim(a.raw_user_meta_data ->> 'name'), '') IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Rapikan data lama sebelum aturan dipasang
-- ------------------------------------------------------------------------------
-- Akun Customer tidak terhubung dengan karyawan.
UPDATE public.users SET employee_id = NULL WHERE role = 'Customer' AND employee_id IS NOT NULL;

-- Satu karyawan satu akun: akun tertua tetap terhubung, sisanya dilepas lalu dibuatkan datanya.
UPDATE public.users u
   SET employee_id = NULL
 WHERE u.employee_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM public.users o
        WHERE o.employee_id = u.employee_id
          AND (o.created_at, o.id) < (u.created_at, u.id)
   );

-- Akun karyawan tanpa data karyawan dibuatkan datanya (nama dapat diubah di menu Karyawan).
DO $do$
DECLARE
    r RECORD;
    v_employee UUID;
BEGIN
    FOR r IN
        SELECT u.id, u.email, u.role, u.full_name
          FROM public.users u
         WHERE u.role IN ('Admin', 'Kasir') AND u.employee_id IS NULL
    LOOP
        INSERT INTO public.employees (name, email, position, status)
        VALUES (COALESCE(r.full_name, split_part(r.email, '@', 1)), r.email, r.role, 'Aktif')
        RETURNING id INTO v_employee;
        UPDATE public.users SET employee_id = v_employee WHERE id = r.id;
    END LOOP;
END
$do$;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique ON public.users(employee_id) WHERE employee_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3 & 4. Aturan akun
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_account_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_employee public.employees%ROWTYPE;
BEGIN
    -- Admin tidak dapat mengubah role / menonaktifkan akunnya sendiri.
    IF TG_OP = 'UPDATE' AND v_uid IS NOT NULL AND OLD.id = v_uid
       AND (NEW.role IS DISTINCT FROM OLD.role OR (OLD.status = 'Aktif' AND NEW.status = 'Nonaktif')) THEN
        RAISE EXCEPTION 'Anda tidak dapat mengubah role atau menonaktifkan akun Anda sendiri. Minta Admin lain melakukannya.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Customer <-> karyawan tidak dapat saling diubah oleh pengguna aplikasi.
    -- (Proses sistem tanpa auth.uid(), mis. Edge Function create-staff-user, mengubah
    --  profil baru dari Customer menjadi Admin/Kasir saat akun karyawan dibuat.)
    IF TG_OP = 'UPDATE' AND v_uid IS NOT NULL
       AND (OLD.role = 'Customer') IS DISTINCT FROM (NEW.role = 'Customer') THEN
        RAISE EXCEPTION 'Akun Customer terpisah dari akun karyawan sehingga tidak dapat diubah menjadi Admin/Kasir (atau sebaliknya). Buat akun karyawan lewat menu Akun Pengguna.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'Customer' THEN
        IF NEW.employee_id IS NOT NULL THEN
            RAISE EXCEPTION 'Akun Customer tidak dapat dihubungkan dengan data karyawan.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.employee_id IS NULL THEN
        RAISE EXCEPTION 'Akun karyawan wajib terhubung dengan data karyawan.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'Aktif'
       AND (TG_OP = 'INSERT'
            OR OLD.status IS DISTINCT FROM 'Aktif'
            OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
            OR OLD.role = 'Customer') THEN
        SELECT * INTO v_employee FROM public.employees WHERE id = NEW.employee_id;
        IF NOT FOUND OR v_employee.status <> 'Aktif' THEN
            RAISE EXCEPTION 'Karyawan % berstatus Nonaktif. Aktifkan data karyawannya terlebih dahulu sebelum mengaktifkan akun ini.',
                COALESCE(v_employee.name, '')
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_account_rules ON public.users;
CREATE TRIGGER guard_user_account_rules BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_account_rules();

-- ------------------------------------------------------------------------------
-- 5. Karyawan tidak dapat dihapus
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_employee_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Data karyawan tidak dapat dihapus agar riwayat tetap valid. Nonaktifkan karyawan sebagai gantinya.'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS prevent_employee_delete ON public.employees;
CREATE TRIGGER prevent_employee_delete BEFORE DELETE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_delete();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_user_account_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_employee_delete() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 19. RECENT ACTIVITY DASHBOARD & BATAS PESANAN CUSTOMER
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Riwayat koreksi metode bayar
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_payment_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    old_method TEXT NOT NULL,
    new_method TEXT NOT NULL,
    corrected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    corrected_by_email TEXT,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_order_id ON public.order_payment_corrections(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_corrected_by ON public.order_payment_corrections(corrected_by);
CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_corrected_at ON public.order_payment_corrections(corrected_at DESC);

ALTER TABLE public.order_payment_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_corrections FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_payment_corrections FROM authenticated;
GRANT SELECT ON public.order_payment_corrections TO authenticated;

DROP POLICY IF EXISTS "Admins can view payment corrections" ON public.order_payment_corrections;
CREATE POLICY "Admins can view payment corrections"
    ON public.order_payment_corrections FOR SELECT
    TO authenticated
    USING ((select public.is_admin()));

CREATE OR REPLACE FUNCTION public.guard_order_payment_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method AND auth.uid() IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Hanya Admin yang dapat mengoreksi metode pembayaran.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        v_email := COALESCE((SELECT email FROM public.users WHERE id = auth.uid()), 'Admin');
        NEW.notes := concat_ws(
            ' | ',
            NULLIF(OLD.notes, ''),
            format('Koreksi metode pembayaran oleh %s: %s → %s', v_email, OLD.payment_method, NEW.payment_method)
        );
        INSERT INTO public.order_payment_corrections
            (order_id, order_number, old_method, new_method, corrected_by, corrected_by_email)
        VALUES (OLD.id, OLD.order_number, OLD.payment_method, NEW.payment_method, auth.uid(), v_email);
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Aktivitas terbaru (khusus Admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_recent_activity(p_limit INTEGER DEFAULT 20, p_category TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_result JSON;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Aktivitas operasional hanya dapat dilihat oleh Admin.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    WITH activity AS (
        (SELECT 'shift_open'::TEXT AS kind, 'kas'::TEXT AS category, s.opened_at AS occurred_at,
                s.opened_by_name AS actor, s.id::TEXT AS ref_id, NULL::TEXT AS ref_label,
                s.opening_cash AS amount, NULL::NUMERIC AS quantity, NULL::TEXT AS unit,
                s.opening_note AS note, NULL::TEXT AS extra
           FROM public.cash_shifts s
          ORDER BY s.opened_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'shift_close', 'kas', s.closed_at, s.closed_by_name, s.id::TEXT, NULL,
                s.difference, NULL, NULL, s.closing_note, NULL
           FROM public.cash_shifts s
          WHERE s.status = 'Closed' AND s.closed_at IS NOT NULL
          ORDER BY s.closed_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT CASE
                    WHEN o.cancelled_by IS NULL
                         AND (o.cancellation_reason LIKE 'Otomatis dibatalkan%' OR o.cancellation_reason LIKE 'Pembayaran online%')
                    THEN 'order_auto_cancel'
                    WHEN o.payment_status = 'Refunded' THEN 'order_refund'
                    ELSE 'order_cancel'
                END,
                'pesanan', o.cancelled_at, u.email, o.id::TEXT, o.order_number,
                o.total_amount, NULL, NULL, o.cancellation_reason, o.payment_method
           FROM public.orders o
           LEFT JOIN public.users u ON u.id = o.cancelled_by
          WHERE o.order_status = 'Cancelled' AND o.cancelled_at IS NOT NULL
          ORDER BY o.cancelled_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'payment_correction', 'pesanan', c.corrected_at, c.corrected_by_email, c.order_id::TEXT,
                c.order_number, NULL, NULL, NULL, NULL, c.old_method || ' → ' || c.new_method
           FROM public.order_payment_corrections c
          ORDER BY c.corrected_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'stock_movement', 'stok', m.created_at, COALESCE(m.user_name, u.email), m.inventory_id::TEXT,
                COALESCE(m.item_name, i.name), NULL, m.quantity, COALESCE(m.item_unit, i.unit), m.notes, m.movement_type
           FROM public.stock_movements m
           LEFT JOIN public.inventory_items i ON i.id = m.inventory_id
           LEFT JOIN public.users u ON u.id = m.user_id
          ORDER BY m.created_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'expense', 'kas', e.created_at, u.email, e.id::TEXT, e.description,
                e.amount, NULL, NULL, NULL, CASE WHEN e.paid_from_cash THEN 'cash' END
           FROM public.expenses e
           LEFT JOIN public.users u ON u.id = e.created_by
          ORDER BY e.created_at DESC LIMIT v_limit)
    )
    SELECT COALESCE(json_agg(a ORDER BY a.occurred_at DESC), '[]'::JSON) INTO v_result
      FROM (
          SELECT * FROM activity
           WHERE p_category IS NULL OR category = p_category
           ORDER BY occurred_at DESC
           LIMIT v_limit
      ) a;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Batas pesanan customer di create_order
-- ------------------------------------------------------------------------------
-- Customer hanya dapat membuat pesanan lewat create_order, karena semua validasi
-- (harga resmi, ketersediaan, batas pesanan) ada di sana.
DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can add items to own pending orders" ON public.order_items;

CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_staff BOOLEAN := public.is_staff();
    v_item JSONB;
    v_qty INTEGER;
    v_product public.products%ROWTYPE;
    v_total NUMERIC := 0;
    v_customer TEXT := NULLIF(btrim(p_customer_name), '');
    v_order public.orders%ROWTYPE;
    v_blocking TEXT;
BEGIN
    -- SECURITY DEFINER: satu-satunya pintu pembuatan order (customer tidak dapat INSERT langsung);
    -- trigger (sif, gerbang pembayaran, nomor order, batas bayar) tetap berlaku.
    IF NOT v_is_staff AND NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Akun ini tidak diizinkan membuat pesanan.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang belanja masih kosong.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_is_staff AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Nama pemesan wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Validasi item & hitung total dari harga resmi produk.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Jumlah item tidak valid.' USING ERRCODE = 'check_violation';
        END IF;

        SELECT p.* INTO v_product
          FROM public.products p
         WHERE p.id = (v_item ->> 'product_id')::UUID
           AND p.is_active = true
           AND p.status = 'Tersedia';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.'
                USING ERRCODE = 'check_violation';
        END IF;

        v_total := v_total + v_product.price * v_qty;
    END LOOP;

    -- Batas pesanan customer (POS kasir tidak dibatasi). Pasangan: lib/customer-order-logic.ts.
    IF NOT v_is_staff THEN
        -- Kunci per customer agar dua checkout bersamaan tidak lolos berdua.
        PERFORM pg_advisory_xact_lock(hashtext('create_order:' || auth.uid()::TEXT));

        SELECT o.order_number INTO v_blocking
          FROM public.orders o
         WHERE o.user_id = auth.uid()
           AND o.order_status = 'Pending'
           AND o.payment_status = 'Pending'
           AND (o.payment_due_at IS NULL OR o.payment_due_at > NOW())
         LIMIT 1;
        IF v_blocking IS NOT NULL THEN
            RAISE EXCEPTION 'Anda masih punya pesanan % yang belum dibayar. Bayar di kasir atau batalkan dulu sebelum membuat pesanan baru.', v_blocking
                USING ERRCODE = 'check_violation';
        END IF;

        IF (SELECT COUNT(DISTINCT i.value ->> 'product_id') FROM jsonb_array_elements(p_items) AS i) > 10 THEN
            RAISE EXCEPTION 'Maksimal 10 menu berbeda per pesanan.' USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_items) AS i
             GROUP BY i.value ->> 'product_id'
            HAVING SUM((i.value ->> 'quantity')::INTEGER) > 99
        ) THEN
            RAISE EXCEPTION 'Jumlah per menu maksimal 99 per pesanan.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    INSERT INTO public.orders
        (user_id, cashier_name, customer_name, total_amount, payment_method,
         payment_status, order_status, order_type, notes)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING * INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    SELECT v_order.id, p.id, p.name, p.price, (i.value ->> 'quantity')::INTEGER,
           p.price * (i.value ->> 'quantity')::INTEGER, NULLIF(btrim(i.value ->> 'notes'), '')
      FROM jsonb_array_elements(p_items) AS i
      JOIN public.products p ON p.id = (i.value ->> 'product_id')::UUID;

    RETURN json_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'total_amount', v_order.total_amount,
        'order_status', v_order.order_status,
        'payment_status', v_order.payment_status,
        'created_at', v_order.created_at,
        'payment_due_at', v_order.payment_due_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_recent_activity(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_activity(INTEGER, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_order_payment_correction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 20. PEMBAYARAN QRIS ONLINE (MIDTRANS SNAP)
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Kolom kanal & data gateway
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'Kasir',
    ADD COLUMN IF NOT EXISTS gateway_status TEXT,
    ADD COLUMN IF NOT EXISTS gateway_payment_type TEXT,
    ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS gateway_redirect_url TEXT,
    ADD COLUMN IF NOT EXISTS gateway_updated_at TIMESTAMPTZ;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_channel_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_channel_check CHECK (payment_channel IN ('Kasir', 'Online'));

CREATE OR REPLACE FUNCTION public.online_payment_timeout()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT INTERVAL '3 minutes' $$;

-- Batas bayar per kanal; kanal & data gateway hanya diubah proses sistem.
CREATE OR REPLACE FUNCTION public.set_order_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.order_status = 'Pending' AND NEW.payment_status = 'Pending' THEN
            NEW.payment_due_at := COALESCE(NEW.created_at, NOW())
                + CASE WHEN NEW.payment_channel = 'Online' THEN public.online_payment_timeout()
                       ELSE public.customer_payment_timeout() END;
        ELSE
            NEW.payment_due_at := NULL;
        END IF;
        IF auth.uid() IS NOT NULL THEN
            NEW.gateway_status := NULL;
            NEW.gateway_payment_type := NULL;
            NEW.gateway_transaction_id := NULL;
            NEW.gateway_redirect_url := NULL;
            NEW.gateway_updated_at := NULL;
        END IF;
    ELSE
        IF OLD.payment_due_at IS NOT NULL THEN
            NEW.payment_due_at := OLD.payment_due_at;
        END IF;
        NEW.payment_channel := OLD.payment_channel;
        IF auth.uid() IS NOT NULL THEN
            NEW.gateway_status := OLD.gateway_status;
            NEW.gateway_payment_type := OLD.gateway_payment_type;
            NEW.gateway_transaction_id := OLD.gateway_transaction_id;
            NEW.gateway_redirect_url := OLD.gateway_redirect_url;
            NEW.gateway_updated_at := OLD.gateway_updated_at;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Pelunasan pesanan online hanya lewat Midtrans
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_expired_order_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'Paid' AND OLD.payment_status IS DISTINCT FROM 'Paid' THEN
        IF NEW.payment_channel = 'Online' THEN
            IF auth.uid() IS NOT NULL THEN
                RAISE EXCEPTION 'Pesanan online dibayar lewat Midtrans; status lunas diperbarui otomatis.'
                    USING ERRCODE = 'check_violation';
            END IF;
            -- Proses sistem (webhook terverifikasi): dana sudah diterima Midtrans.
            RETURN NEW;
        END IF;
        IF OLD.order_status = 'Cancelled' THEN
            RAISE EXCEPTION 'Pesanan % sudah dibatalkan sehingga pembayarannya tidak dapat diterima.', OLD.order_number
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.payment_due_at IS NOT NULL AND OLD.payment_due_at <= NOW() THEN
            RAISE EXCEPTION 'Pesanan % sudah kedaluwarsa (tidak dibayar dalam % menit). Buat pesanan baru lewat POS.',
                OLD.order_number, EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Pembayaran online tidak masuk laci kas (tidak perlu sif terbuka)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_order_payment_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift UUID;
BEGIN
    -- Uang masuk ke sif saat pembayaran diterima (bukan saat order dibuat).
    IF NEW.payment_status = 'Paid'
       AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid') THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL AND NEW.payment_channel IS DISTINCT FROM 'Online' THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum menerima pembayaran.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.paid_shift_id := v_shift;
        NEW.paid_at := NOW();
    END IF;

    -- Refund mengurangi kas pada sif tempat refund dilakukan (pesanan online: refund lewat Midtrans).
    IF TG_OP = 'UPDATE' AND NEW.payment_status = 'Refunded'
       AND OLD.payment_status IS DISTINCT FROM 'Refunded' THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL AND NEW.payment_channel IS DISTINCT FROM 'Online' THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum memproses refund.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.refunded_shift_id := v_shift;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Pembatalan otomatis: kasir 15 menit; online menunggu webhook "expire",
--    dengan cadangan 10 menit setelah batas bila webhook tidak datang.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.orders
       SET order_status = 'Cancelled',
           payment_status = CASE WHEN payment_channel = 'Online' THEN 'Failed' ELSE payment_status END,
           cancelled_at = NOW(),
           cancellation_reason = CASE
               WHEN payment_channel = 'Online' THEN 'Otomatis dibatalkan: pembayaran online tidak selesai.'
               ELSE format('Otomatis dibatalkan: tidak dibayar dalam %s menit.',
                           EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60)
           END,
           updated_at = NOW()
     WHERE order_status = 'Pending'
       AND payment_status = 'Pending'
       AND payment_due_at IS NOT NULL
       AND payment_due_at + CASE WHEN payment_channel = 'Online' THEN INTERVAL '10 minutes' ELSE INTERVAL '0 minutes' END <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Customer tidak membatalkan pesanan online (QR kedaluwarsa sendiri)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id UUID, p_reason TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Hanya customer aktif yang dapat membatalkan pesanannya.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'Alasan pembatalan minimal 3 karakter.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_order
      FROM public.orders
     WHERE id = p_order_id AND user_id = auth.uid()
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan.' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_order.order_status <> 'Pending' OR v_order.payment_status <> 'Pending' THEN
        RAISE EXCEPTION 'Pesanan sudah dibayar atau sedang diproses. Hubungi kasir untuk pembatalan.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_order.payment_channel = 'Online' THEN
        RAISE EXCEPTION 'Pesanan online dibatalkan otomatis bila tidak dibayar dalam % menit.',
            EXTRACT(EPOCH FROM public.online_payment_timeout())::INTEGER / 60
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.orders
       SET order_status = 'Cancelled',
           cancelled_by = auth.uid(),
           cancelled_at = NOW(),
           cancellation_reason = btrim(p_reason),
           updated_at = NOW()
     WHERE id = v_order.id;

    RETURN json_build_object('id', v_order.id, 'order_number', v_order.order_number, 'order_status', 'Cancelled');
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Notifikasi Midtrans (dipanggil Edge Function midtrans-webhook, role service_role)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_midtrans_notification(
    p_order_id UUID,
    p_transaction_status TEXT,
    p_fraud_status TEXT,
    p_gross_amount NUMERIC,
    p_payment_type TEXT,
    p_transaction_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_outcome TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_order.payment_channel <> 'Online' THEN
        RETURN 'not_online';
    END IF;

    UPDATE public.orders
       SET gateway_status = p_transaction_status,
           gateway_payment_type = COALESCE(p_payment_type, gateway_payment_type),
           gateway_transaction_id = COALESCE(p_transaction_id, gateway_transaction_id),
           gateway_updated_at = NOW()
     WHERE id = v_order.id;

    v_outcome := CASE
        WHEN p_transaction_status = 'settlement' THEN 'paid'
        WHEN p_transaction_status = 'capture' AND COALESCE(p_fraud_status, 'accept') = 'accept' THEN 'paid'
        WHEN p_transaction_status IN ('deny', 'cancel', 'expire', 'failure', 'capture') THEN 'failed'
        WHEN p_transaction_status = 'pending' THEN 'pending'
        ELSE 'ignore'
    END;

    IF v_outcome = 'paid' THEN
        IF ROUND(p_gross_amount) <> ROUND(v_order.total_amount) THEN
            UPDATE public.orders
               SET notes = concat_ws(' | ', NULLIF(notes, ''),
                       format('Nominal Midtrans %s tidak sama dengan total %s — periksa manual.', p_gross_amount, v_order.total_amount))
             WHERE id = v_order.id;
            RETURN 'amount_mismatch';
        END IF;
        IF v_order.payment_status = 'Paid' THEN
            RETURN 'already_paid';
        END IF;
        IF v_order.order_status = 'Cancelled' THEN
            UPDATE public.orders
               SET notes = concat_ws(' | ', NULLIF(notes, ''),
                       'Dana online diterima setelah pesanan dibatalkan — lakukan refund manual lewat Midtrans.')
             WHERE id = v_order.id;
            RETURN 'paid_after_cancel';
        END IF;
        UPDATE public.orders
           SET payment_status = 'Paid',
               order_status = CASE WHEN order_status = 'Pending' THEN 'Processing' ELSE order_status END,
               updated_at = NOW()
         WHERE id = v_order.id;
        RETURN 'paid';
    END IF;

    IF v_outcome = 'failed' AND v_order.order_status = 'Pending' AND v_order.payment_status = 'Pending' THEN
        UPDATE public.orders
           SET order_status = 'Cancelled',
               payment_status = 'Failed',
               cancelled_at = NOW(),
               cancellation_reason = format('Pembayaran online tidak selesai (%s).', p_transaction_status),
               updated_at = NOW()
         WHERE id = v_order.id;
        RETURN 'cancelled';
    END IF;

    RETURN v_outcome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_midtrans_notification(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.apply_midtrans_notification(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 7. create_order dengan kanal pembayaran
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL,
    p_payment_channel TEXT DEFAULT 'Kasir'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_staff BOOLEAN := public.is_staff();
    v_item JSONB;
    v_qty INTEGER;
    v_product public.products%ROWTYPE;
    v_total NUMERIC := 0;
    v_customer TEXT := NULLIF(btrim(p_customer_name), '');
    v_order public.orders%ROWTYPE;
    v_blocking TEXT;
    v_channel TEXT := COALESCE(NULLIF(btrim(p_payment_channel), ''), 'Kasir');
BEGIN
    -- SECURITY DEFINER: satu-satunya pintu pembuatan order (customer tidak dapat INSERT langsung);
    -- trigger (sif, gerbang pembayaran, nomor order, batas bayar) tetap berlaku.
    IF NOT v_is_staff AND NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Akun ini tidak diizinkan membuat pesanan.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang belanja masih kosong.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_is_staff AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Nama pemesan wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Kanal pembayaran: 'Kasir' (bayar di kasir) atau 'Online' (QRIS lewat Midtrans, khusus customer).
    IF v_channel NOT IN ('Kasir', 'Online') THEN
        RAISE EXCEPTION 'Kanal pembayaran tidak valid.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_channel = 'Online' AND v_is_staff THEN
        RAISE EXCEPTION 'POS tidak memakai pembayaran online.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_channel = 'Online' AND p_payment_method <> 'QRIS' THEN
        RAISE EXCEPTION 'Pembayaran online hanya dengan QRIS.' USING ERRCODE = 'check_violation';
    END IF;

    -- Validasi item & hitung total dari harga resmi produk.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Jumlah item tidak valid.' USING ERRCODE = 'check_violation';
        END IF;

        SELECT p.* INTO v_product
          FROM public.products p
         WHERE p.id = (v_item ->> 'product_id')::UUID
           AND p.is_active = true
           AND p.status = 'Tersedia';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.'
                USING ERRCODE = 'check_violation';
        END IF;

        v_total := v_total + v_product.price * v_qty;
    END LOOP;

    -- Batas pesanan customer (POS kasir tidak dibatasi). Pasangan: lib/customer-order-logic.ts.
    IF NOT v_is_staff THEN
        -- Kunci per customer agar dua checkout bersamaan tidak lolos berdua.
        PERFORM pg_advisory_xact_lock(hashtext('create_order:' || auth.uid()::TEXT));

        SELECT o.order_number INTO v_blocking
          FROM public.orders o
         WHERE o.user_id = auth.uid()
           AND o.order_status = 'Pending'
           AND o.payment_status = 'Pending'
           AND (o.payment_due_at IS NULL OR o.payment_due_at > NOW())
         LIMIT 1;
        IF v_blocking IS NOT NULL THEN
            RAISE EXCEPTION 'Anda masih punya pesanan % yang belum dibayar. Bayar di kasir atau batalkan dulu sebelum membuat pesanan baru.', v_blocking
                USING ERRCODE = 'check_violation';
        END IF;

        IF (SELECT COUNT(DISTINCT i.value ->> 'product_id') FROM jsonb_array_elements(p_items) AS i) > 10 THEN
            RAISE EXCEPTION 'Maksimal 10 menu berbeda per pesanan.' USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_items) AS i
             GROUP BY i.value ->> 'product_id'
            HAVING SUM((i.value ->> 'quantity')::INTEGER) > 99
        ) THEN
            RAISE EXCEPTION 'Jumlah per menu maksimal 99 per pesanan.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    INSERT INTO public.orders
        (user_id, cashier_name, customer_name, total_amount, payment_method,
         payment_status, order_status, order_type, notes, payment_channel)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), ''),
        v_channel
    )
    RETURNING * INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    SELECT v_order.id, p.id, p.name, p.price, (i.value ->> 'quantity')::INTEGER,
           p.price * (i.value ->> 'quantity')::INTEGER, NULLIF(btrim(i.value ->> 'notes'), '')
      FROM jsonb_array_elements(p_items) AS i
      JOIN public.products p ON p.id = (i.value ->> 'product_id')::UUID;

    RETURN json_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'total_amount', v_order.total_amount,
        'order_status', v_order.order_status,
        'payment_status', v_order.payment_status,
        'created_at', v_order.created_at,
        'payment_due_at', v_order.payment_due_at,
        'payment_channel', v_order.payment_channel
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.online_payment_timeout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_payment_timeout() TO authenticated;

NOTIFY pgrst, 'reload schema';
