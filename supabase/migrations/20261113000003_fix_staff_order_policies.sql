-- ==============================================================================
-- MIGRATION: AUDIT ITERASI 3 (KRITIS) — POLICY STAF UNTUK ORDER
-- Di server, "Staff can manage orders" dan "Staff can manage order items"
-- ternyata USING (true): setiap pengguna yang login (termasuk customer) bisa
-- membaca, mengubah, dan menghapus semua order. Dibatasi kembali ke staf aktif
-- untuk USING dan WITH CHECK; (select ...) agar dievaluasi sekali per query.
-- ==============================================================================

DROP POLICY IF EXISTS "Staff can manage orders" ON public.orders;
CREATE POLICY "Staff can manage orders"
    ON public.orders FOR ALL
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

DROP POLICY IF EXISTS "Staff can manage order items" ON public.order_items;
CREATE POLICY "Staff can manage order items"
    ON public.order_items FOR ALL
    TO authenticated
    USING ((select public.is_staff()))
    WITH CHECK ((select public.is_staff()));

NOTIFY pgrst, 'reload schema';
