-- ==============================================================================
-- MIGRATION: KAS HARIAN — PENGELUARAN KASIR & REKAP KAS (PRD Section 20 revisi)
-- - expenses.paid_from_cash: pengeluaran dibayar dari kas laci (uang penjualan
--   hari itu). Default TRUE; Admin dapat mematikannya untuk transfer/sumber lain.
-- - Staf (Admin/Kasir) dapat MELIHAT pengeluaran hari ini (WIB) untuk rekap kas.
-- - Staf dapat MENCATAT pengeluaran kas hari ini atas namanya sendiri.
--   Ubah/hapus expense tetap hanya Admin ("Admins can manage expenses").
-- ==============================================================================

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS paid_from_cash BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Staff can view expenses today" ON public.expenses;
CREATE POLICY "Staff can view expenses today"
    ON public.expenses FOR SELECT
    TO authenticated
    USING (
        public.is_staff()
        AND expense_date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
    );

DROP POLICY IF EXISTS "Staff can record cash expenses today" ON public.expenses;
CREATE POLICY "Staff can record cash expenses today"
    ON public.expenses FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_staff()
        AND expense_date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE
        AND created_by = auth.uid()
        AND paid_from_cash = true
        AND stock_movement_id IS NULL
    );

NOTIFY pgrst, 'reload schema';
