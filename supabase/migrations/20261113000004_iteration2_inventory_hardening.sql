-- ==============================================================================
-- MIGRATION: AUDIT ITERASI 2 — PENGERASAN BAHAN BAKU & PRODUK
-- 1. Angka stok hanya berubah lewat riwayat mutasi (tidak bisa ditimpa langsung).
-- 2. Stock Out & Opname dihitung di database (record_stock_movement) dengan baris
--    terkunci; aplikasi tidak lagi menulis langsung ke stock_movements.
-- 3. Non-Admin hanya boleh mengubah kolom status produk.
-- 4. Bahan baku punya status Aktif/Nonaktif (is_active, hanya Admin yang mengubah);
--    sisa soft delete (is_deleted) dijadikan Nonaktif — tidak ada data yang dihapus.
-- 5. Policy memakai (select ...) agar dievaluasi sekali per query; index FK user_id.
-- Konteks tanpa JWT (SQL Editor, service role) tidak dibatasi oleh guard di bawah.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 4. Status Aktif/Nonaktif bahan baku (pengganti soft delete; is_deleted tidak dipakai lagi)
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
UPDATE public.inventory_items SET is_active = false WHERE is_deleted;

-- ------------------------------------------------------------------------------
-- 1. Angka stok hanya berubah lewat mutasi
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.inventory_id IS NOT NULL THEN
        -- Tanda bahwa perubahan stok berasal dari riwayat mutasi (berlaku di transaksi ini saja).
        PERFORM set_config('app.stock_movement', 'on', true);
        UPDATE public.inventory_items
           SET current_stock = NEW.stock_after,
               updated_at = NOW()
         WHERE id = NEW.inventory_id;
        PERFORM set_config('app.stock_movement', 'off', true);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_inventory_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.current_stock IS DISTINCT FROM OLD.current_stock
       AND COALESCE(current_setting('app.stock_movement', true), 'off') <> 'on'
       AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Stok tidak dapat diubah langsung. Catat lewat Stock In, Stock Out, atau Stock Opname agar tercatat di riwayat.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active
       AND auth.uid() IS NOT NULL
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya Admin yang dapat mengaktifkan atau menonaktifkan bahan baku.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_inventory_stock_change ON public.inventory_items;
CREATE TRIGGER guard_inventory_stock_change BEFORE UPDATE ON public.inventory_items
    FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_stock_change();

-- ------------------------------------------------------------------------------
-- 2. Stock Out & Opname dihitung di database
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_movement(
    p_inventory_id UUID,
    p_movement_type TEXT,
    p_quantity NUMERIC,
    p_notes TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.inventory_items%ROWTYPE;
    v_after NUMERIC;
    v_change NUMERIC;
    v_id UUID;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'Hanya Admin dan Kasir aktif yang dapat mencatat perubahan stok.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_movement_type NOT IN ('Stock Out', 'Stock Adjustment') THEN
        RAISE EXCEPTION 'Jenis perubahan stok tidak valid. Stock In dicatat lewat record_stock_in.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NULLIF(btrim(p_notes), '') IS NULL THEN
        RAISE EXCEPTION 'Keterangan wajib diisi untuk Stock Out dan Stock Opname.' USING ERRCODE = 'check_violation';
    END IF;

    IF p_quantity IS NULL THEN
        RAISE EXCEPTION 'Jumlah wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;

    -- Kunci baris bahan agar perubahan bersamaan tidak saling menimpa.
    SELECT * INTO v_item FROM public.inventory_items WHERE id = p_inventory_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan.' USING ERRCODE = 'no_data_found';
    END IF;

    IF NOT v_item.is_active THEN
        RAISE EXCEPTION 'Bahan baku nonaktif. Aktifkan kembali (Admin) sebelum mencatat perubahan stok.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_movement_type = 'Stock Out' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'Jumlah Stock Out harus lebih besar dari 0.' USING ERRCODE = 'check_violation';
        END IF;
        IF p_quantity > v_item.current_stock THEN
            RAISE EXCEPTION 'Stok tidak mencukupi. Stok saat ini: % %.', v_item.current_stock, v_item.unit
                USING ERRCODE = 'check_violation';
        END IF;
        v_after := v_item.current_stock - p_quantity;
        v_change := p_quantity;
    ELSE
        -- Opname: p_quantity = stok fisik aktual (0 diperbolehkan).
        IF p_quantity < 0 THEN
            RAISE EXCEPTION 'Stok fisik tidak boleh negatif.' USING ERRCODE = 'check_violation';
        END IF;
        IF p_quantity = v_item.current_stock THEN
            RAISE EXCEPTION 'Stok fisik sama dengan stok sistem, tidak ada yang perlu disesuaikan.'
                USING ERRCODE = 'check_violation';
        END IF;
        v_after := p_quantity;
        v_change := abs(p_quantity - v_item.current_stock);
    END IF;

    INSERT INTO public.stock_movements
        (inventory_id, item_name, item_unit, movement_type, quantity, stock_before, stock_after, notes, user_id, user_name)
    VALUES
        (v_item.id, v_item.name, v_item.unit, p_movement_type, v_change, v_item.current_stock, v_after,
         btrim(p_notes), auth.uid(), (SELECT email FROM public.users WHERE id = auth.uid()))
    RETURNING id INTO v_id;

    RETURN json_build_object('movement_id', v_id, 'stock_before', v_item.current_stock, 'stock_after', v_after);
END;
$$;

-- Stock In juga menolak bahan nonaktif.
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

    -- Kunci baris bahan agar Stock In bersamaan tidak saling menimpa stok.
    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE id = p_inventory_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan atau nonaktif.' USING ERRCODE = 'no_data_found';
    END IF;

    v_after := v_item.current_stock + p_quantity;
    SELECT email INTO v_user_name FROM public.users WHERE id = auth.uid();

    -- Trigger apply_stock_movement memperbarui inventory_items.current_stock.
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
            (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE,
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

-- Riwayat mutasi hanya ditulis lewat record_stock_in / record_stock_movement.
DROP POLICY IF EXISTS "Staff can insert stock movements" ON public.stock_movements;

-- ------------------------------------------------------------------------------
-- 3. Non-Admin hanya boleh mengubah status produk
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_product_staff_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT public.is_admin()
       AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
        RAISE EXCEPTION 'Kasir hanya dapat mengubah status ketersediaan produk. Perubahan lain hanya dapat dilakukan Admin.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_staff_update ON public.products;
CREATE TRIGGER guard_product_staff_update BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_product_staff_update();

-- ------------------------------------------------------------------------------
-- 5. Policy (dievaluasi sekali per query) & index
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Anyone can view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (is_active = true OR (select public.is_admin()));

DROP POLICY IF EXISTS "Staff can update product status" ON public.products;
CREATE POLICY "Staff can update product status"
    ON public.products FOR UPDATE
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products"
    ON public.products FOR ALL
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Staff can view inventory" ON public.inventory_items;
CREATE POLICY "Staff can view inventory"
    ON public.inventory_items FOR SELECT
    TO authenticated
    USING ((select public.is_staff()) AND (is_active OR (select public.is_admin())));

DROP POLICY IF EXISTS "Staff can insert inventory" ON public.inventory_items;
CREATE POLICY "Staff can insert inventory"
    ON public.inventory_items FOR INSERT
    TO authenticated
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory_items;
CREATE POLICY "Staff can update inventory"
    ON public.inventory_items FOR UPDATE
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory_items;
CREATE POLICY "Admins can delete inventory"
    ON public.inventory_items FOR DELETE
    TO authenticated
    USING ((select public.is_admin()));

DROP POLICY IF EXISTS "Staff can view stock movements" ON public.stock_movements;
CREATE POLICY "Staff can view stock movements"
    ON public.stock_movements FOR SELECT
    TO authenticated
    USING ((select public.is_staff()));

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON public.stock_movements(user_id);

-- ------------------------------------------------------------------------------
-- Hak eksekusi
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_inventory_stock_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_staff_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_stock_movement(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
