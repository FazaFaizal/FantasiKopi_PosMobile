-- ==============================================================================
-- MIGRATION: RECENT ACTIVITY DASHBOARD & BATAS PESANAN CUSTOMER (2026-11-14)
-- 1. Koreksi metode bayar dicatat sebagai baris riwayat (order_payment_corrections).
-- 2. get_recent_activity: aktivitas operasional penting untuk dashboard Admin (PRD 27):
--    buka/tutup sif, pembatalan/refund, batal otomatis, koreksi metode bayar,
--    mutasi stok, dan pengeluaran.
-- 3. create_order (khusus customer): maksimal 1 pesanan belum dibayar sekaligus,
--    maksimal 99 per menu, maksimal 10 menu berbeda per pesanan. POS kasir tidak dibatasi.
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Riwayat koreksi metode bayar
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_payment_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    old_method TEXT NOT NULL,
    new_method TEXT NOT NULL,
    corrected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    corrected_by_email TEXT,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_order_id ON public.order_payment_corrections(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_corrected_by ON public.order_payment_corrections(corrected_by);
CREATE INDEX IF NOT EXISTS idx_order_payment_corrections_corrected_at ON public.order_payment_corrections(corrected_at DESC);

ALTER TABLE public.order_payment_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_corrections FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_payment_corrections FROM authenticated;
GRANT SELECT ON public.order_payment_corrections TO authenticated;

DROP POLICY IF EXISTS "Admins can view payment corrections" ON public.order_payment_corrections;
CREATE POLICY "Admins can view payment corrections"
    ON public.order_payment_corrections FOR SELECT
    TO authenticated
    USING ((select public.is_admin()));

CREATE OR REPLACE FUNCTION public.guard_order_payment_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method AND auth.uid() IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Hanya Admin yang dapat mengoreksi metode pembayaran.' USING ERRCODE = 'insufficient_privilege';
        END IF;
        v_email := COALESCE((SELECT email FROM public.users WHERE id = auth.uid()), 'Admin');
        NEW.notes := concat_ws(
            ' | ',
            NULLIF(OLD.notes, ''),
            format('Koreksi metode pembayaran oleh %s: %s → %s', v_email, OLD.payment_method, NEW.payment_method)
        );
        INSERT INTO public.order_payment_corrections
            (order_id, order_number, old_method, new_method, corrected_by, corrected_by_email)
        VALUES (OLD.id, OLD.order_number, OLD.payment_method, NEW.payment_method, auth.uid(), v_email);
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Aktivitas terbaru (khusus Admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_recent_activity(p_limit INTEGER DEFAULT 20, p_category TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
    v_result JSON;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Aktivitas operasional hanya dapat dilihat oleh Admin.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    WITH activity AS (
        (SELECT 'shift_open'::TEXT AS kind, 'kas'::TEXT AS category, s.opened_at AS occurred_at,
                s.opened_by_name AS actor, s.id::TEXT AS ref_id, NULL::TEXT AS ref_label,
                s.opening_cash AS amount, NULL::NUMERIC AS quantity, NULL::TEXT AS unit,
                s.opening_note AS note, NULL::TEXT AS extra
           FROM public.cash_shifts s
          ORDER BY s.opened_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'shift_close', 'kas', s.closed_at, s.closed_by_name, s.id::TEXT, NULL,
                s.difference, NULL, NULL, s.closing_note, NULL
           FROM public.cash_shifts s
          WHERE s.status = 'Closed' AND s.closed_at IS NOT NULL
          ORDER BY s.closed_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT CASE
                    WHEN o.cancelled_by IS NULL
                         AND (o.cancellation_reason LIKE 'Otomatis dibatalkan%' OR o.cancellation_reason LIKE 'Pembayaran online%')
                    THEN 'order_auto_cancel'
                    WHEN o.payment_status = 'Refunded' THEN 'order_refund'
                    ELSE 'order_cancel'
                END,
                'pesanan', o.cancelled_at, u.email, o.id::TEXT, o.order_number,
                o.total_amount, NULL, NULL, o.cancellation_reason, o.payment_method
           FROM public.orders o
           LEFT JOIN public.users u ON u.id = o.cancelled_by
          WHERE o.order_status = 'Cancelled' AND o.cancelled_at IS NOT NULL
          ORDER BY o.cancelled_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'payment_correction', 'pesanan', c.corrected_at, c.corrected_by_email, c.order_id::TEXT,
                c.order_number, NULL, NULL, NULL, NULL, c.old_method || ' → ' || c.new_method
           FROM public.order_payment_corrections c
          ORDER BY c.corrected_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'stock_movement', 'stok', m.created_at, COALESCE(m.user_name, u.email), m.inventory_id::TEXT,
                COALESCE(m.item_name, i.name), NULL, m.quantity, COALESCE(m.item_unit, i.unit), m.notes, m.movement_type
           FROM public.stock_movements m
           LEFT JOIN public.inventory_items i ON i.id = m.inventory_id
           LEFT JOIN public.users u ON u.id = m.user_id
          ORDER BY m.created_at DESC LIMIT v_limit)
        UNION ALL
        (SELECT 'expense', 'kas', e.created_at, u.email, e.id::TEXT, e.description,
                e.amount, NULL, NULL, NULL, CASE WHEN e.paid_from_cash THEN 'cash' END
           FROM public.expenses e
           LEFT JOIN public.users u ON u.id = e.created_by
          ORDER BY e.created_at DESC LIMIT v_limit)
    )
    SELECT COALESCE(json_agg(a ORDER BY a.occurred_at DESC), '[]'::JSON) INTO v_result
      FROM (
          SELECT * FROM activity
           WHERE p_category IS NULL OR category = p_category
           ORDER BY occurred_at DESC
           LIMIT v_limit
      ) a;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Batas pesanan customer di create_order
-- ------------------------------------------------------------------------------
-- Customer hanya dapat membuat pesanan lewat create_order, karena semua validasi
-- (harga resmi, ketersediaan, batas pesanan) ada di sana.
DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can add items to own pending orders" ON public.order_items;

CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_staff BOOLEAN := public.is_staff();
    v_item JSONB;
    v_qty INTEGER;
    v_product public.products%ROWTYPE;
    v_total NUMERIC := 0;
    v_customer TEXT := NULLIF(btrim(p_customer_name), '');
    v_order public.orders%ROWTYPE;
    v_blocking TEXT;
BEGIN
    -- SECURITY DEFINER: satu-satunya pintu pembuatan order (customer tidak dapat INSERT langsung);
    -- trigger (sif, gerbang pembayaran, nomor order, batas bayar) tetap berlaku.
    IF NOT v_is_staff AND NOT public.is_active_customer() THEN
        RAISE EXCEPTION 'Akun ini tidak diizinkan membuat pesanan.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang belanja masih kosong.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_is_staff AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Nama pemesan wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Validasi item & hitung total dari harga resmi produk.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Jumlah item tidak valid.' USING ERRCODE = 'check_violation';
        END IF;

        SELECT p.* INTO v_product
          FROM public.products p
         WHERE p.id = (v_item ->> 'product_id')::UUID
           AND p.is_active = true
           AND p.status = 'Tersedia';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ada menu di keranjang yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.'
                USING ERRCODE = 'check_violation';
        END IF;

        v_total := v_total + v_product.price * v_qty;
    END LOOP;

    -- Batas pesanan customer (POS kasir tidak dibatasi). Pasangan: lib/customer-order-logic.ts.
    IF NOT v_is_staff THEN
        -- Kunci per customer agar dua checkout bersamaan tidak lolos berdua.
        PERFORM pg_advisory_xact_lock(hashtext('create_order:' || auth.uid()::TEXT));

        SELECT o.order_number INTO v_blocking
          FROM public.orders o
         WHERE o.user_id = auth.uid()
           AND o.order_status = 'Pending'
           AND o.payment_status = 'Pending'
           AND (o.payment_due_at IS NULL OR o.payment_due_at > NOW())
         LIMIT 1;
        IF v_blocking IS NOT NULL THEN
            RAISE EXCEPTION 'Anda masih punya pesanan % yang belum dibayar. Bayar di kasir atau batalkan dulu sebelum membuat pesanan baru.', v_blocking
                USING ERRCODE = 'check_violation';
        END IF;

        IF (SELECT COUNT(DISTINCT i.value ->> 'product_id') FROM jsonb_array_elements(p_items) AS i) > 10 THEN
            RAISE EXCEPTION 'Maksimal 10 menu berbeda per pesanan.' USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_items) AS i
             GROUP BY i.value ->> 'product_id'
            HAVING SUM((i.value ->> 'quantity')::INTEGER) > 99
        ) THEN
            RAISE EXCEPTION 'Jumlah per menu maksimal 99 per pesanan.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    INSERT INTO public.orders
        (user_id, cashier_name, customer_name, total_amount, payment_method,
         payment_status, order_status, order_type, notes)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING * INTO v_order;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
    SELECT v_order.id, p.id, p.name, p.price, (i.value ->> 'quantity')::INTEGER,
           p.price * (i.value ->> 'quantity')::INTEGER, NULLIF(btrim(i.value ->> 'notes'), '')
      FROM jsonb_array_elements(p_items) AS i
      JOIN public.products p ON p.id = (i.value ->> 'product_id')::UUID;

    RETURN json_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'total_amount', v_order.total_amount,
        'order_status', v_order.order_status,
        'payment_status', v_order.payment_status,
        'created_at', v_order.created_at,
        'payment_due_at', v_order.payment_due_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_recent_activity(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_activity(INTEGER, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_order_payment_correction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
