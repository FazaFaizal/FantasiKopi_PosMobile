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
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Tunai', 'QRIS')),
    payment_status TEXT NOT NULL DEFAULT 'Lunas' CHECK (payment_status IN ('Lunas', 'Batal')),
    notes TEXT,
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
        UPDATE public.inventory_items
        SET current_stock = NEW.stock_after,
            updated_at = NOW()
        WHERE id = NEW.inventory_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_stock_movement_created ON public.stock_movements;
CREATE TRIGGER on_stock_movement_created
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_stock_movement();

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

-- 6.1. Policies: users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" 
    ON public.users FOR SELECT 
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" 
    ON public.users FOR SELECT 
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users" 
    ON public.users FOR UPDATE 
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users" 
    ON public.users FOR DELETE 
    TO authenticated
    USING (public.is_admin());

-- 6.2. Policies: employees
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees" 
    ON public.employees FOR ALL 
    TO authenticated
    USING (public.is_admin());

-- 6.3. Policies: categories
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Anyone can view categories"
    ON public.categories FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 6.4. Policies: products
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 6.5. Policies: inventory_items
DROP POLICY IF EXISTS "Staff can view inventory" ON public.inventory_items;
CREATE POLICY "Staff can view inventory"
    ON public.inventory_items FOR SELECT
    TO authenticated
    USING (public.is_staff() AND (is_deleted = false OR public.is_admin()));

DROP POLICY IF EXISTS "Staff can insert inventory" ON public.inventory_items;
CREATE POLICY "Staff can insert inventory"
    ON public.inventory_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory_items;
CREATE POLICY "Staff can update inventory"
    ON public.inventory_items FOR UPDATE
    TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory_items;
CREATE POLICY "Admins can delete inventory"
    ON public.inventory_items FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- 6.6. Policies: stock_movements
DROP POLICY IF EXISTS "Staff can view stock movements" ON public.stock_movements;
CREATE POLICY "Staff can view stock movements"
    ON public.stock_movements FOR SELECT
    TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;
CREATE POLICY "Staff can insert stock movements"
    ON public.stock_movements FOR INSERT
    TO authenticated
    WITH CHECK (public.is_staff());

-- 6.7. Policies: orders
DROP POLICY IF EXISTS "Staff can manage orders" ON public.orders;
CREATE POLICY "Staff can manage orders"
    ON public.orders FOR ALL
    TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 6.8. Policies: order_items
DROP POLICY IF EXISTS "Staff can manage order items" ON public.order_items;
CREATE POLICY "Staff can manage order items"
    ON public.order_items FOR ALL
    TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;
CREATE POLICY "Customers can view own order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 7. HAK AKSES ROLE & POSTGREST CACHE
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Refresh cache PostgREST Supabase
NOTIFY pgrst, 'reload schema';
