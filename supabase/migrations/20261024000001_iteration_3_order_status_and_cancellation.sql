-- ==============================================================================
-- MIGRATION: ITERASI 3 - ORDER STATUS LIFECYCLE & CANCELLATION/REFUND
-- Menambahkan kolom status order, tipe pesanan, dan atribut audit pembatalan
-- Sesuai spesifikasi PRD Section 15, 17, 17.1, 19
-- ==============================================================================

-- 1. Tambahkan kolom order_status, order_type, dan atribut pembatalan ke tabel orders
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

-- 2. Perbarui constraint payment_status agar mendukung 'Refunded' dan 'Paid'
ALTER TABLE public.orders 
DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders 
ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IN ('Pending', 'Paid', 'Lunas', 'Failed', 'Refunded', 'Batal'));

-- 3. Pastikan RLS Policy Staff dapat mengupdate status dan pembatalan
DROP POLICY IF EXISTS "Staff can manage orders" ON public.orders;
CREATE POLICY "Staff can manage orders"
    ON public.orders FOR ALL
    TO authenticated
    USING (public.is_staff());

-- 4. Notifikasi reload schema ke PostgREST
NOTIFY pgrst, 'reload schema';

