-- ==============================================================================
-- MIGRATION: Snapshot Pattern & Transaksi Penjualan POS
-- Fantasi Coffee Mobile POS
-- ==============================================================================

-- 1. Snapshot Pattern pada Mutasi Stok (stock_movements)
-- Izinkan inventory_id bernilai NULL jika bahan baku terhapus permanen
ALTER TABLE public.stock_movements 
    ALTER COLUMN inventory_id DROP NOT NULL;

-- Tambahkan kolom snapshot pada riwayat mutasi stok
ALTER TABLE public.stock_movements 
    ADD COLUMN IF NOT EXISTS item_name TEXT,
    ADD COLUMN IF NOT EXISTS item_unit TEXT,
    ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Isi data snapshot historis dari tabel master inventory
UPDATE public.stock_movements sm
SET item_name = ii.name,
    item_unit = ii.unit
FROM public.inventory_items ii
WHERE sm.inventory_id = ii.id AND (sm.item_name IS NULL OR sm.item_unit IS NULL);

-- Ubah foreign key constraint ke ON DELETE SET NULL
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'stock_movements'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%inventory_id%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_id_fkey
    FOREIGN KEY (inventory_id)
    REFERENCES public.inventory_items(id)
    ON DELETE SET NULL;

-- 2. Modul Penjualan POS: Tabel orders & order_items
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

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,         -- Snapshot nama produk saat transaksi
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0), -- Snapshot harga saat transaksi
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing performa query orders & items
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 3. Row Level Security (RLS) untuk Orders & Order Items
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Staf (Admin & Kasir) dapat melihat dan mengelola seluruh order
DROP POLICY IF EXISTS "Staff can manage orders" ON public.orders;
CREATE POLICY "Staff can manage orders"
    ON public.orders FOR ALL
    TO authenticated
    USING (public.is_staff());

-- Customer dapat melihat riwayat order milik sendiri
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Staf dapat mengelola order items
DROP POLICY IF EXISTS "Staff can manage order items" ON public.order_items;
CREATE POLICY "Staff can manage order items"
    ON public.order_items FOR ALL
    TO authenticated
    USING (public.is_staff());

-- Customer dapat melihat detail item order milik sendiri
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

-- 4. Reload PostgREST Cache
NOTIFY pgrst, 'reload schema';
