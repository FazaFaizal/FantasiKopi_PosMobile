-- ==============================================================================
-- MIGRATION: PERBAIKAN CHECKOUT CUSTOMER, NOMOR ORDER ATOMIK & HARDENING AKSES
-- 1. Definisi handle_updated_at() (dipakai trigger expenses, sebelumnya belum ada)
-- 2. Nomor order ORD-YYYYMMDD-XXXX dibuat di database secara atomik (trigger)
-- 3. RLS INSERT untuk customer pada orders & order_items (sebelumnya tidak ada,
--    sehingga checkout customer selalu ditolak RLS)
-- 4. Cabut hak akses tabel dari role anon (semua policy hanya untuk authenticated)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Fungsi updated_at generik
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 2. Nomor order atomik per hari (zona waktu WIB / Asia/Jakarta)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_number_counters (
    order_date DATE PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0)
);

-- Tanpa policy = tidak bisa diakses klien; hanya trigger SECURITY DEFINER.
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_number_counters FROM anon, authenticated;

-- Lanjutkan penomoran dari order yang sudah ada agar tidak bentrok UNIQUE.
INSERT INTO public.order_number_counters AS c (order_date, last_seq)
SELECT
    to_date(substring(order_number FROM 5 FOR 8), 'YYYYMMDD'),
    MAX(substring(order_number FROM 14)::INTEGER)
FROM public.orders
WHERE order_number ~ '^ORD-[0-9]{8}-[0-9]+$'
GROUP BY 1
ON CONFLICT (order_date) DO UPDATE SET last_seq = GREATEST(c.last_seq, EXCLUDED.last_seq);

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_date DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
    v_seq INTEGER;
BEGIN
    -- Upsert mengunci baris counter → aman dari transaksi bersamaan.
    INSERT INTO public.order_number_counters AS c (order_date, last_seq)
    VALUES (v_date, 1)
    ON CONFLICT (order_date) DO UPDATE SET last_seq = c.last_seq + 1
    RETURNING c.last_seq INTO v_seq;

    -- Selalu ditimpa: nomor dari klien diabaikan.
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

-- ------------------------------------------------------------------------------
-- 3. RLS: Customer membuat pesanan sendiri
-- ------------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
CREATE POLICY "Customers can create own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active_customer()
        AND user_id = auth.uid()
        AND order_status = 'Pending'
        AND payment_status IN ('Pending', 'Paid')
        AND cancelled_by IS NULL
        AND cancelled_at IS NULL
    );

DROP POLICY IF EXISTS "Customers can add items to own pending orders" ON public.order_items;
CREATE POLICY "Customers can add items to own pending orders"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active_customer()
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.user_id = auth.uid()
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
-- 4. Hardening hak akses: anon tidak butuh akses tabel apa pun
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

NOTIFY pgrst, 'reload schema';
