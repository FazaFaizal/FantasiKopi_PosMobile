-- ==============================================================================
-- MIGRATION: PEMBAYARAN QRIS ONLINE (MIDTRANS SNAP) — keputusan 2026-11-14
-- 1. orders.payment_channel: 'Kasir' (bayar di kasir, batas 15 menit) atau 'Online'
--    (QRIS online lewat Midtrans, batas 3 menit) + kolom data gateway.
-- 2. Pesanan online hanya dapat dilunasi oleh proses sistem (webhook Midtrans yang
--    tanda tangannya terverifikasi) lewat apply_midtrans_notification; kasir tidak dapat
--    melunasinya manual dan customer tidak dapat membatalkannya.
-- 3. Pembayaran online tidak masuk laci kas sehingga tidak memerlukan sif terbuka.
-- 4. create_order menerima p_payment_channel.
-- ==============================================================================
-- ------------------------------------------------------------------------------
-- 1. Kolom kanal & data gateway
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'Kasir',
    ADD COLUMN IF NOT EXISTS gateway_status TEXT,
    ADD COLUMN IF NOT EXISTS gateway_payment_type TEXT,
    ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS gateway_redirect_url TEXT,
    ADD COLUMN IF NOT EXISTS gateway_updated_at TIMESTAMPTZ;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_channel_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_channel_check CHECK (payment_channel IN ('Kasir', 'Online'));

CREATE OR REPLACE FUNCTION public.online_payment_timeout()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT INTERVAL '3 minutes' $$;

-- Batas bayar per kanal; kanal & data gateway hanya diubah proses sistem.
CREATE OR REPLACE FUNCTION public.set_order_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.order_status = 'Pending' AND NEW.payment_status = 'Pending' THEN
            NEW.payment_due_at := COALESCE(NEW.created_at, NOW())
                + CASE WHEN NEW.payment_channel = 'Online' THEN public.online_payment_timeout()
                       ELSE public.customer_payment_timeout() END;
        ELSE
            NEW.payment_due_at := NULL;
        END IF;
        IF auth.uid() IS NOT NULL THEN
            NEW.gateway_status := NULL;
            NEW.gateway_payment_type := NULL;
            NEW.gateway_transaction_id := NULL;
            NEW.gateway_redirect_url := NULL;
            NEW.gateway_updated_at := NULL;
        END IF;
    ELSE
        IF OLD.payment_due_at IS NOT NULL THEN
            NEW.payment_due_at := OLD.payment_due_at;
        END IF;
        NEW.payment_channel := OLD.payment_channel;
        IF auth.uid() IS NOT NULL THEN
            NEW.gateway_status := OLD.gateway_status;
            NEW.gateway_payment_type := OLD.gateway_payment_type;
            NEW.gateway_transaction_id := OLD.gateway_transaction_id;
            NEW.gateway_redirect_url := OLD.gateway_redirect_url;
            NEW.gateway_updated_at := OLD.gateway_updated_at;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Pelunasan pesanan online hanya lewat Midtrans
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_expired_order_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'Paid' AND OLD.payment_status IS DISTINCT FROM 'Paid' THEN
        IF NEW.payment_channel = 'Online' THEN
            IF auth.uid() IS NOT NULL THEN
                RAISE EXCEPTION 'Pesanan online dibayar lewat Midtrans; status lunas diperbarui otomatis.'
                    USING ERRCODE = 'check_violation';
            END IF;
            -- Proses sistem (webhook terverifikasi): dana sudah diterima Midtrans.
            RETURN NEW;
        END IF;
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

-- ------------------------------------------------------------------------------
-- 3. Pembayaran online tidak masuk laci kas (tidak perlu sif terbuka)
-- ------------------------------------------------------------------------------
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
    IF NEW.payment_status = 'Paid'
       AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM 'Paid') THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL AND NEW.payment_channel IS DISTINCT FROM 'Online' THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum menerima pembayaran.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.paid_shift_id := v_shift;
        NEW.paid_at := NOW();
    END IF;

    -- Refund mengurangi kas pada sif tempat refund dilakukan (pesanan online: refund lewat Midtrans).
    IF TG_OP = 'UPDATE' AND NEW.payment_status = 'Refunded'
       AND OLD.payment_status IS DISTINCT FROM 'Refunded' THEN
        v_shift := public.current_open_shift_id();
        IF v_shift IS NULL AND NEW.payment_channel IS DISTINCT FROM 'Online' THEN
            RAISE EXCEPTION 'Sif kasir belum dibuka. Buka sif terlebih dahulu sebelum memproses refund.'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.refunded_shift_id := v_shift;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Pembatalan otomatis: kasir 15 menit; online menunggu webhook "expire",
--    dengan cadangan 10 menit setelah batas bila webhook tidak datang.
-- ------------------------------------------------------------------------------
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
           payment_status = CASE WHEN payment_channel = 'Online' THEN 'Failed' ELSE payment_status END,
           cancelled_at = NOW(),
           cancellation_reason = CASE
               WHEN payment_channel = 'Online' THEN 'Otomatis dibatalkan: pembayaran online tidak selesai.'
               ELSE format('Otomatis dibatalkan: tidak dibayar dalam %s menit.',
                           EXTRACT(EPOCH FROM public.customer_payment_timeout())::INTEGER / 60)
           END,
           updated_at = NOW()
     WHERE order_status = 'Pending'
       AND payment_status = 'Pending'
       AND payment_due_at IS NOT NULL
       AND payment_due_at + CASE WHEN payment_channel = 'Online' THEN INTERVAL '10 minutes' ELSE INTERVAL '0 minutes' END <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Customer tidak membatalkan pesanan online (QR kedaluwarsa sendiri)
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

    IF v_order.payment_channel = 'Online' THEN
        RAISE EXCEPTION 'Pesanan online dibatalkan otomatis bila tidak dibayar dalam % menit.',
            EXTRACT(EPOCH FROM public.online_payment_timeout())::INTEGER / 60
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
-- 6. Notifikasi Midtrans (dipanggil Edge Function midtrans-webhook, role service_role)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_midtrans_notification(
    p_order_id UUID,
    p_transaction_status TEXT,
    p_fraud_status TEXT,
    p_gross_amount NUMERIC,
    p_payment_type TEXT,
    p_transaction_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_outcome TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;
    IF v_order.payment_channel <> 'Online' THEN
        RETURN 'not_online';
    END IF;

    UPDATE public.orders
       SET gateway_status = p_transaction_status,
           gateway_payment_type = COALESCE(p_payment_type, gateway_payment_type),
           gateway_transaction_id = COALESCE(p_transaction_id, gateway_transaction_id),
           gateway_updated_at = NOW()
     WHERE id = v_order.id;

    v_outcome := CASE
        WHEN p_transaction_status = 'settlement' THEN 'paid'
        WHEN p_transaction_status = 'capture' AND COALESCE(p_fraud_status, 'accept') = 'accept' THEN 'paid'
        WHEN p_transaction_status IN ('deny', 'cancel', 'expire', 'failure', 'capture') THEN 'failed'
        WHEN p_transaction_status = 'pending' THEN 'pending'
        ELSE 'ignore'
    END;

    IF v_outcome = 'paid' THEN
        IF ROUND(p_gross_amount) <> ROUND(v_order.total_amount) THEN
            UPDATE public.orders
               SET notes = concat_ws(' | ', NULLIF(notes, ''),
                       format('Nominal Midtrans %s tidak sama dengan total %s — periksa manual.', p_gross_amount, v_order.total_amount))
             WHERE id = v_order.id;
            RETURN 'amount_mismatch';
        END IF;
        IF v_order.payment_status = 'Paid' THEN
            RETURN 'already_paid';
        END IF;
        IF v_order.order_status = 'Cancelled' THEN
            UPDATE public.orders
               SET notes = concat_ws(' | ', NULLIF(notes, ''),
                       'Dana online diterima setelah pesanan dibatalkan — lakukan refund manual lewat Midtrans.')
             WHERE id = v_order.id;
            RETURN 'paid_after_cancel';
        END IF;
        UPDATE public.orders
           SET payment_status = 'Paid',
               order_status = CASE WHEN order_status = 'Pending' THEN 'Processing' ELSE order_status END,
               updated_at = NOW()
         WHERE id = v_order.id;
        RETURN 'paid';
    END IF;

    IF v_outcome = 'failed' AND v_order.order_status = 'Pending' AND v_order.payment_status = 'Pending' THEN
        UPDATE public.orders
           SET order_status = 'Cancelled',
               payment_status = 'Failed',
               cancelled_at = NOW(),
               cancellation_reason = format('Pembayaran online tidak selesai (%s).', p_transaction_status),
               updated_at = NOW()
         WHERE id = v_order.id;
        RETURN 'cancelled';
    END IF;

    RETURN v_outcome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_midtrans_notification(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.apply_midtrans_notification(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
    END IF;
END
$do$;

-- ------------------------------------------------------------------------------
-- 7. create_order dengan kanal pembayaran
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer_name TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL,
    p_payment_channel TEXT DEFAULT 'Kasir'
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
    v_channel TEXT := COALESCE(NULLIF(btrim(p_payment_channel), ''), 'Kasir');
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

    -- Kanal pembayaran: 'Kasir' (bayar di kasir) atau 'Online' (QRIS lewat Midtrans, khusus customer).
    IF v_channel NOT IN ('Kasir', 'Online') THEN
        RAISE EXCEPTION 'Kanal pembayaran tidak valid.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_channel = 'Online' AND v_is_staff THEN
        RAISE EXCEPTION 'POS tidak memakai pembayaran online.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_channel = 'Online' AND p_payment_method <> 'QRIS' THEN
        RAISE EXCEPTION 'Pembayaran online hanya dengan QRIS.' USING ERRCODE = 'check_violation';
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
         payment_status, order_status, order_type, notes, payment_channel)
    VALUES (
        auth.uid(),
        CASE WHEN v_is_staff THEN (SELECT email FROM public.users WHERE id = auth.uid()) END,
        COALESCE(v_customer, 'Pelanggan Umum'),
        v_total,
        p_payment_method,
        CASE WHEN v_is_staff THEN 'Paid' ELSE 'Pending' END,
        CASE WHEN v_is_staff THEN 'Processing' ELSE 'Pending' END,
        p_order_type,
        NULLIF(btrim(p_notes), ''),
        v_channel
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
        'payment_due_at', v_order.payment_due_at,
        'payment_channel', v_order.payment_channel
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.online_payment_timeout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_payment_timeout() TO authenticated;

NOTIFY pgrst, 'reload schema';
