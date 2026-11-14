-- ==============================================================================
-- MIGRATION: STANDARDISASI STATUS & METODE PEMBAYARAN (#7, PRD Section 16)
-- - Status pembayaran hanya: Pending, Paid, Failed, Refunded.
--     'Lunas' → 'Paid' (sinonim).
--     'Batal' → 'Pending' (order belum dibayar yang dibatalkan: tidak ada uang
--      yang berpindah; pembatalan tercatat di order_status = 'Cancelled').
-- - Metode pembayaran: Tunai, QRIS, Debit (Debit = non-tunai, tidak masuk laci).
-- - Fungsi/trigger tidak lagi mengenal 'Lunas'.
-- PENTING: data diubah SEBELUM trigger diganti, agar perubahan Lunas → Paid
-- tidak dianggap pembayaran baru oleh trigger sif.
-- ==============================================================================

-- 1. Migrasi data lama (trigger lama memperlakukan Lunas = Paid → tidak ada efek samping)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

UPDATE public.orders SET payment_status = 'Paid' WHERE payment_status = 'Lunas';
UPDATE public.orders SET payment_status = 'Pending' WHERE payment_status = 'Batal';

-- 2. Constraint & default baru
ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded'));
ALTER TABLE public.orders ALTER COLUMN payment_status SET DEFAULT 'Pending';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('Tunai', 'QRIS', 'Debit'));

-- 3. Gerbang pembayaran: hanya 'Paid' yang dianggap lunas
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

-- 4. Pencatatan pembayaran/refund ke sif: hanya 'Paid'
CREATE OR REPLACE FUNCTION public.track_order_payment_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift UUID;
BEGIN
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

-- 5. Ringkasan sif: pisahkan Debit (non-tunai)
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

-- Hak eksekusi dipertahankan eksplisit (CREATE OR REPLACE tidak mengubah ACL)
REVOKE EXECUTE ON FUNCTION public.enforce_payment_before_processing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_order_payment_shift() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_shift_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shift_summary(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
