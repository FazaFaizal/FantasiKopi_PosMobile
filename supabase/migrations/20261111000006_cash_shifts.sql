-- ==============================================================================
-- MIGRATION: SIF KASIR — BUKA / TUTUP SIF (PRD Section 20.2)
-- Satu laci, sif bergantian; uang di laci terakumulasi lintas sif.
-- - cash_shifts: satu sif "Open" dalam satu waktu (unique partial index).
-- - Pembayaran (Paid/Lunas) & refund dicatat ke sif aktif; tanpa sif → ditolak.
-- - Pengeluaran dari kas hari ini dicatat ke sif aktif; Kasir tanpa sif → ditolak.
-- - open_cash_shift / close_cash_shift / get_shift_summary (SECURITY DEFINER).
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
    IF NEW.payment_status IN ('Paid', 'Lunas')
       AND (TG_OP = 'INSERT' OR OLD.payment_status NOT IN ('Paid', 'Lunas')) THEN
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
        ELSIF NEW.expense_date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE THEN
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
           COUNT(*)
      INTO v_cash_in, v_qris_in, v_paid_count
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

NOTIFY pgrst, 'reload schema';
