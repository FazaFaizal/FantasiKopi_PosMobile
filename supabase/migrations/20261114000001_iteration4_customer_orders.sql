-- ==============================================================================
-- MIGRATION: AUDIT ITERASI 4 — PESANAN CUSTOMER & DASHBOARD
-- 1. Batas bayar 15 menit untuk pesanan customer (payment_due_at). Lewat batas,
--    pesanan dibatalkan otomatis (expire_unpaid_orders: pg_cron tiap menit bila
--    aktif, juga dipanggil aplikasi saat daftar pesanan dimuat) dan kasir tidak
--    dapat lagi menerima pembayarannya.
-- 2. Tabel orders didaftarkan ke Supabase Realtime (notifikasi pesanan baru).
-- 3. Omzet diakui saat pembayaran diterima: get_sales_summary memakai
--    COALESCE(paid_at, created_at), sama dengan sif & kas harian.
-- 4. create_order mengembalikan payment_due_at untuk hitung mundur customer.
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Batas bayar pesanan customer
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.customer_payment_timeout()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT INTERVAL '15 minutes' $$;

-- Diisi database (nilai dari klien diabaikan) dan tidak dapat diperpanjang lewat UPDATE.
CREATE OR REPLACE FUNCTION public.set_order_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.order_status = 'Pending' AND NEW.payment_status = 'Pending' THEN
            NEW.payment_due_at := COALESCE(NEW.created_at, NOW()) + public.customer_payment_timeout();
        ELSE
            NEW.payment_due_at := NULL;
        END IF;
    ELSIF OLD.payment_due_at IS NOT NULL THEN
        NEW.payment_due_at := OLD.payment_due_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_payment_due ON public.orders;
CREATE TRIGGER set_order_payment_due BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_payment_due();

-- Pesanan lama yang masih menunggu bayar ikut mendapat batas waktu.
UPDATE public.orders
   SET payment_due_at = created_at + public.customer_payment_timeout()
 WHERE order_status = 'Pending' AND payment_status = 'Pending' AND payment_due_at IS NULL;

-- Kasir tidak dapat menerima pembayaran untuk pesanan yang kedaluwarsa atau dibatalkan.
CREATE OR REPLACE FUNCTION public.guard_expired_order_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'Paid' AND OLD.payment_status IS DISTINCT FROM 'Paid' THEN
        IF OLD.order_status = 'Cancelled' THEN
            RAISE EXCEPTION 'Pesanan % sudah dibatalkan sehingga pembayarannya tidak dapat diterima.', OLD.order_number
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.payment_due_at IS NOT NULL AND OLD.payment_due_at <= NOW() THEN
            RAISE EXCEPTION 'Pesanan % sudah kedaluwarsa (tidak dibayar dalam % menit). Buat pesanan baru lewat POS.',
                OLD.order_number, EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_expired_order_payment ON public.orders;
CREATE TRIGGER guard_expired_order_payment BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_expired_order_payment();

-- Membatalkan pesanan customer yang melewati batas bayar. Aman dipanggil berulang.
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.orders
       SET order_status = 'Cancelled',
           cancelled_at = NOW(),
           cancellation_reason = format('Otomatis dibatalkan: tidak dibayar dalam %s menit.',
                                        EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60),
           updated_at = NOW()
     WHERE order_status = 'Pending'
       AND payment_status = 'Pending'
       AND payment_due_at IS NOT NULL
       AND payment_due_at <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment ON public.orders(payment_due_at)
    WHERE order_status = 'Pending' AND payment_status = 'Pending';

-- Jadwal tiap menit bila ekstensi pg_cron aktif (Dashboard → Database → Extensions).
-- Tanpa pg_cron, aplikasi tetap memanggil expire_unpaid_orders() saat memuat pesanan.
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('expire-unpaid-orders', '* * * * *', 'SELECT public.expire_unpaid_orders()');
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 2. Realtime untuk tabel orders (RLS tetap berlaku pada event realtime)
-- ------------------------------------------------------------------------------
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 3 & 4. Omzet diakui saat dibayar; create_order mengembalikan batas bayar
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_revenue_at ON public.orders ((COALESCE(paid_at, created_at)));

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
        'created_at', v_order.created_at,
        'payment_due_at', v_order.payment_due_at
    );
END;
$$;

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

    -- Batas hari mengikuti zona waktu bisnis. Penjualan diakui saat dibayar (paid_at);
    -- data lama tanpa paid_at memakai created_at (index idx_orders_revenue_at).
    v_start := CASE WHEN p_from IS NULL THEN '-infinity'::TIMESTAMPTZ
                    ELSE p_from::TIMESTAMP AT TIME ZONE public.business_timezone() END;
    v_end := CASE WHEN p_to IS NULL THEN 'infinity'::TIMESTAMPTZ
                  ELSE (p_to + 1)::TIMESTAMP AT TIME ZONE public.business_timezone() END;

    WITH sales AS (
        SELECT o.id, o.total_amount
          FROM public.orders o
         WHERE o.payment_status = 'Paid'
           AND o.order_status <> 'Cancelled'
           AND COALESCE(o.paid_at, o.created_at) >= v_start
           AND COALESCE(o.paid_at, o.created_at) < v_end
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
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.customer_payment_timeout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_payment_timeout() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_payment_due() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_expired_order_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
