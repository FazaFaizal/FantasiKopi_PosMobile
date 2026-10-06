-- ==============================================================================
-- MIGRATION: Iterasi 2 - Product & Inventory Management
-- Fantasi Coffee Mobile POS
-- ==============================================================================

-- 1. Tabel Kategori Produk (categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index kategori
CREATE INDEX IF NOT EXISTS idx_categories_status ON public.categories(status);

-- 2. Tabel Produk (products)
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

-- Index produk
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

-- 3. Tabel Bahan Baku / Inventory (inventory_items)
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

-- Index inventory
CREATE INDEX IF NOT EXISTS idx_inventory_is_deleted ON public.inventory_items(is_deleted);

-- 4. Tabel Riwayat Perubahan Stok (stock_movements)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('Stock In', 'Stock Out', 'Stock Adjustment')),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    stock_before NUMERIC NOT NULL CHECK (stock_before >= 0),
    stock_after NUMERIC NOT NULL CHECK (stock_after >= 0),
    notes TEXT,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index stock movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_id ON public.stock_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

-- 5. Helper Functions: Cek Admin dan Cek Staf (Admin/Kasir)
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

-- 6. Trigger Otomatis Pembaruan Stok Bahan Baku saat Movement Dicatat
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.inventory_items
    SET current_stock = NEW.stock_after,
        updated_at = NOW()
    WHERE id = NEW.inventory_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_stock_movement_created ON public.stock_movements;
CREATE TRIGGER on_stock_movement_created
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_stock_movement();

-- 7. Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Policy Categories:
-- Semua pengguna terautentikasi dapat melihat kategori
CREATE POLICY "Anyone can view categories"
    ON public.categories FOR SELECT
    TO authenticated
    USING (true);

-- Hanya Admin yang dapat mengelola kategori
CREATE POLICY "Admins can manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Policy Products:
-- Semua pengguna terautentikasi dapat melihat produk aktif
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_admin());

-- Hanya Admin yang dapat mengelola produk
CREATE POLICY "Admins can manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Policy Inventory Items:
-- Admin dan Kasir dapat melihat bahan baku (yang belum dihapus, kecuali admin melihat semua)
CREATE POLICY "Staff can view inventory"
    ON public.inventory_items FOR SELECT
    TO authenticated
    USING (public.is_staff() AND (is_deleted = false OR public.is_admin()));

-- Admin dan Kasir dapat menambah dan mengubah bahan baku
CREATE POLICY "Staff can insert inventory"
    ON public.inventory_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update inventory"
    ON public.inventory_items FOR UPDATE
    TO authenticated
    USING (public.is_staff());

-- Hanya Admin yang dapat menghapus bahan baku (soft delete / hard delete)
CREATE POLICY "Admins can delete inventory"
    ON public.inventory_items FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Policy Stock Movements:
-- Admin dan Kasir dapat melihat riwayat stok
CREATE POLICY "Staff can view stock movements"
    ON public.stock_movements FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- Admin dan Kasir dapat mencatat pergerakan stok
CREATE POLICY "Staff can insert stock movements"
    ON public.stock_movements FOR INSERT
    TO authenticated
    WITH CHECK (public.is_staff());

-- Riwayat stok TIDAK dapat diupdate atau didelete oleh siapapun demi integritas data
-- (Tidak ada policy UPDATE atau DELETE)

-- 8. Berikan Hak Akses ke Role Supabase
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Refresh cache PostgREST
NOTIFY pgrst, 'reload schema';

