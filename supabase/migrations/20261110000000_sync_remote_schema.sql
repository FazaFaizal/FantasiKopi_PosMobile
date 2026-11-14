-- ==============================================================================
-- MIGRATION: PENYELARASAN SKEMA REMOTE (CATCH-UP, IDEMPOTENT)
-- Database remote dibangun bertahap lewat SQL Editor sehingga sebagian migration
-- lama tidak pernah terpasang. File ini menambahkan bagian yang hilang tanpa
-- mengubah apa pun yang sudah benar, dan aman dijalankan di database baru maupun lama.
-- Bagian yang dipastikan ada:
--   1. RLS aktif di employees & users (sebelumnya terbuka untuk anon key)
--   2. Trigger pembuatan profil saat registrasi (handle_new_user)
--   3. Kolom status order & pembatalan (Iterasi 3) + constraint payment_status
--   4. Policy yang hilang: hapus user (Admin), lihat order sendiri (Customer),
--      ubah status ketersediaan produk (Staf)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Row Level Security pada data karyawan & akun
--    (policy-nya sudah ada; tanpa RLS policy tersebut tidak berlaku)
-- ------------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees"
    ON public.employees FOR ALL
    TO authenticated
    USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. Profil otomatis saat registrasi Customer
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. Status order, tipe order & pembatalan (Iterasi 3)
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'Processing'
    CHECK (order_status IN ('Pending', 'Processing', 'Ready', 'Completed', 'Cancelled'));

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'Dine In'
    CHECK (order_type IN ('Dine In', 'Take Away'));

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('Pending', 'Paid', 'Lunas', 'Failed', 'Refunded', 'Batal'));

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- ------------------------------------------------------------------------------
-- 4. Policy yang hilang pada orders, order_items & products
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

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

DROP POLICY IF EXISTS "Staff can update product status" ON public.products;
CREATE POLICY "Staff can update product status"
    ON public.products FOR UPDATE
    TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

NOTIFY pgrst, 'reload schema';
