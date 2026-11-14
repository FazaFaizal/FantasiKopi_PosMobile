-- ==============================================================================
-- MIGRATION: AUDIT ITERASI 3 — LAPORAN, ORDER ATOMIK & ZONA WAKTU WITA
-- 1. get_sales_summary: laporan dihitung di database per periode (tidak terpotong
--    batas 1000 baris PostgREST).
-- 2. Satu sumber zona waktu bisnis: WITA (Asia/Makassar). Semua batas "hari"
--    (nomor order, expense Stock In, sif, policy expense) memakai business_today().
-- 3+4. create_order: order & item disimpan dalam SATU transaksi; harga, subtotal,
--    dan total dihitung dari data produk (SECURITY INVOKER: RLS & trigger tetap berlaku).
-- 5. Policy customer/expense memakai (select ...); index FK yang belum ada.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 2. Zona waktu bisnis (pasangan lib/timezone.ts — ubah keduanya bersamaan)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_timezone()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 'Asia/Makassar'::text;
$$;

CREATE OR REPLACE FUNCTION public.business_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (NOW() AT TIME ZONE public.business_timezone())::DATE;
$$;

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_date DATE := public.business_today();
    v_seq INTEGER;
BEGIN
    INSERT INTO public.order_number_counters AS c (order_date, last_seq)
    VALUES (v_date, 1)
    ON CONFLICT (order_date) DO UPDATE SET last_seq = c.last_seq + 1
    RETURNING c.last_seq INTO v_seq;

    NEW.order_number := 'ORD-' || to_char(v_date, 'YYYYMMDD') || '-' ||
        CASE WHEN v_seq < 10000 THEN lpad(v_seq::TEXT, 4, '0') ELSE v_seq::TEXT END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_stock_in(
    p_inventory_id UUID,
    p_quantity NUMERIC,
    p_notes TEXT DEFAULT NULL,
    p_purchase_amount NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.inventory_items%ROWTYPE;
    v_after NUMERIC;
    v_user_name TEXT;
    v_movement_id UUID;
    v_expense_id UUID;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir aktif yang dapat mencatat Stock In.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Jumlah Stock In harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
    END IF;

    IF p_purchase_amount IS NOT NULL AND p_purchase_amount <= 0 THEN
        RAISE EXCEPTION 'Total harga pembelian harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE id = p_inventory_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan atau nonaktif.' USING ERRCODE = 'no_data_found';
    END IF;

    v_after := v_item.current_stock + p_quantity;
    SELECT email INTO v_user_name FROM public.users WHERE id = auth.uid();

    INSERT INTO public.stock_movements
        (inventory_id, item_name, item_unit, movement_type, quantity, stock_before, stock_after, notes, user_id, user_name)
    VALUES
        (v_item.id, v_item.name, v_item.unit, 'Stock In', p_quantity, v_item.current_stock, v_after,
         NULLIF(btrim(p_notes), ''), auth.uid(), v_user_name)
    RETURNING id INTO v_movement_id;

    IF p_purchase_amount IS NOT NULL THEN
        INSERT INTO public.expenses (description, category, amount, expense_date, created_by, stock_movement_id)
        VALUES (
            'Pembelian ' || v_item.name || ' ' || trim_scale(p_quantity)::TEXT || ' ' || v_item.unit,
            'Raw Material',
            p_purchase_amount,
            public.business_today(),
            auth.uid(),
            v_movement_id
        )
        RETURNING id INTO v_expense_id;
    END IF;

    RETURN json_build_object(
        'movement_id', v_movement_id,
        'expense_id', v_expense_id,
        'stock_after', v_after
    );
END;
$$;

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
        ELSIF NEW.expense_date = public.business_today() THEN
            NEW.shift_id := v_shift;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Policy (dievaluasi sekali per query)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Customers can create own orders" ON public.orders;
CREATE POLICY "Customers can create own orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_active_customer())
        AND user_id = (select auth.uid())
        AND order_status = 'Pending'
        AND payment_status = 'Pending'
        AND cancelled_by IS NULL
        AND cancelled_at IS NULL
    );

DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;
CREATE POLICY "Customers can view own order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id AND orders.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Customers can add items to own pending orders" ON public.order_items;
CREATE POLICY "Customers can add items to own pending orders"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_active_customer())
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.user_id = (select auth.uid())
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

DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
CREATE POLICY "Admins can manage expenses"
    ON public.expenses FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Staff can view expenses today" ON public.expenses;
CREATE POLICY "Staff can view expenses today"
    ON public.expenses FOR SELECT
    TO authenticated
    USING (
        (select public.is_staff())
        AND expense_date = (select public.business_today())
    );

DROP POLICY IF EXISTS "Staff can record cash expenses today" ON public.expenses;
CREATE POLICY "Staff can record cash expenses today"
    ON public.expenses FOR INSERT
    TO authenticated
    WITH CHECK (
        (select public.is_staff())
        AND expense_date = (select public.business_today())
        AND created_by = (select auth.uid())
        AND paid_from_cash = true
        AND stock_movement_id IS NULL
    );

-- ------------------------------------------------------------------------------
-- 3+4. Order atomik
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
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
BEGIN
    -- SECURITY INVOKER: RLS & trigger (sif, gerbang pembayaran, nomor order) tetap berlaku.
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
        'created_at', v_order.created_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 1. Laporan penjualan & keuangan per periode
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_summary(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Laporan hanya dapat dilihat oleh Admin.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Batas hari mengikuti zona waktu bisnis; rentang timestamptz agar index created_at terpakai.
    v_start := CASE WHEN p_from IS NULL THEN '-infinity'::TIMESTAMPTZ
                    ELSE p_from::TIMESTAMP AT TIME ZONE public.business_timezone() END;
    v_end := CASE WHEN p_to IS NULL THEN 'infinity'::TIMESTAMPTZ
                  ELSE (p_to + 1)::TIMESTAMP AT TIME ZONE public.business_timezone() END;

    WITH sales AS (
        SELECT o.id, o.total_amount
          FROM public.orders o
         WHERE o.payment_status = 'Paid'
           AND o.order_status <> 'Cancelled'
           AND o.created_at >= v_start
           AND o.created_at < v_end
    ),
    items AS (
        SELECT oi.product_id, oi.product_name, oi.quantity, oi.subtotal
          FROM public.order_items oi
          JOIN sales s ON s.id = oi.order_id
    ),
    top_products AS (
        SELECT (array_agg(product_id))[1] AS product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity_sold,
               SUM(subtotal) AS total_revenue
          FROM items
         GROUP BY COALESCE(product_id::TEXT, product_name)
         ORDER BY SUM(quantity) DESC, SUM(subtotal) DESC
         LIMIT 5
    ),
    expense_categories AS (
        SELECT category, SUM(amount) AS amount
          FROM public.expenses
         WHERE (p_from IS NULL OR expense_date >= p_from)
           AND (p_to IS NULL OR expense_date <= p_to)
         GROUP BY category
    )
    SELECT json_build_object(
        'total_revenue', COALESCE((SELECT SUM(total_amount) FROM sales), 0),
        'paid_orders', (SELECT COUNT(*) FROM sales),
        'items_sold', COALESCE((SELECT SUM(quantity) FROM items), 0),
        'top_products', COALESCE((SELECT json_agg(t ORDER BY t.quantity_sold DESC, t.total_revenue DESC) FROM top_products t), '[]'::JSON),
        'total_expenses', COALESCE((SELECT SUM(amount) FROM expense_categories), 0),
        'expenses_by_category', COALESCE((SELECT json_agg(e) FROM expense_categories e), '[]'::JSON)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Index FK
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_by ON public.cash_shifts(opened_by);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_closed_by ON public.cash_shifts(closed_by);

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.business_timezone() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.business_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_timezone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_today() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
