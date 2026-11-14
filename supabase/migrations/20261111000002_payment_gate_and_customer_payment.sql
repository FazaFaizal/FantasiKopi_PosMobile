-- ==============================================================================
-- MIGRATION: GERBANG PEMBAYARAN & PEMBAYARAN CUSTOMER (PRD Section 16, 17, 25 revisi)
-- 1. Order tidak boleh maju ke Processing / Ready / Completed sebelum pembayaran
--    lunas (Paid, atau Lunas sebagai nilai lama dari POS).
-- 2. Customer tidak bisa menandai pembayarannya sendiri sebagai Paid; pembayaran
--    selalu dikonfirmasi oleh kasir.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Gerbang pembayaran (berlaku untuk semua role, termasuk kasir & admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_before_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.order_status IN ('Processing', 'Ready', 'Completed')
       AND NEW.payment_status NOT IN ('Paid', 'Lunas') THEN
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
-- 2. Customer hanya boleh membuat order dengan pembayaran Pending
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
CREATE POLICY "Customers can create own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_active_customer()
        AND user_id = auth.uid()
        AND order_status = 'Pending'
        AND payment_status = 'Pending'
        AND cancelled_by IS NULL
        AND cancelled_at IS NULL
    );

NOTIFY pgrst, 'reload schema';
