-- ==============================================================================
-- MIGRATION: ORDER ADMIN (PRD 15.1) & PEMBATALAN OLEH CUSTOMER (#6)
-- 1. cancel_my_order: customer membatalkan pesanannya sendiri selama Pending dan
--    belum dibayar (baris dikunci agar tidak bentrok dengan kasir yang sedang
--    mengonfirmasi pembayaran).
-- 2. guard_order_payment_correction: hanya Admin yang boleh mengubah metode
--    pembayaran; setiap koreksi otomatis tercatat di catatan order.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Customer membatalkan pesanan sendiri
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

NOTIFY pgrst, 'reload schema';
