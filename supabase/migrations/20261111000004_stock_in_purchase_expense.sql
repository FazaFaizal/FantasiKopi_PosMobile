-- ==============================================================================
-- MIGRATION: STOCK IN SEKALIGUS PENCATATAN BIAYA PEMBELIAN (#4, PRD 12.1 & 20 revisi)
-- - expenses.stock_movement_id menghubungkan biaya dengan mutasi Stock In
--   (UNIQUE: satu Stock In paling banyak satu expense → mencegah tercatat ganda).
-- - record_stock_in(): mutasi stok + expense opsional dalam SATU transaksi.
--   Kasir boleh memakainya (expense hanya tercipta lewat Stock In miliknya);
--   ubah/hapus expense tetap khusus Admin (RLS "Admins can manage expenses").
-- - Expense bertanggal hari ini WIB: expense = uang keluar pada hari itu.
-- ==============================================================================

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS stock_movement_id UUID UNIQUE REFERENCES public.stock_movements(id) ON DELETE SET NULL;

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
    WHERE id = p_inventory_id AND is_deleted = false
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bahan baku tidak ditemukan atau sudah dihapus.' USING ERRCODE = 'no_data_found';
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

REVOKE EXECUTE ON FUNCTION public.record_stock_in(UUID, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_in(UUID, NUMERIC, TEXT, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';
