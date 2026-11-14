-- ==============================================================================
-- MIGRATION: HARDENING HAK EKSEKUSI FUNGSI (Supabase Security Advisor)
-- Secara default Postgres memberi EXECUTE ke PUBLIC, sehingga semua fungsi di
-- schema public bisa dipanggil lewat /rest/v1/rpc/... termasuk oleh anon.
-- 1. Fungsi trigger: tidak perlu dipanggil siapa pun secara langsung.
--    (Postgres tidak memeriksa EXECUTE saat trigger dipicu, jadi trigger tetap jalan.)
-- 2. Helper RLS (is_admin, is_staff, is_active_customer): hanya authenticated,
--    karena semua policy berlaku TO authenticated dan dievaluasi sebagai role itu.
-- 3. search_path tetap untuk handle_employee_status_change (SECURITY DEFINER).
-- ==============================================================================

-- 1. Fungsi trigger
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_before_processing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_employee_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

-- 2. Helper RLS
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_customer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_customer() TO authenticated;

-- 3. search_path tetap
ALTER FUNCTION public.handle_employee_status_change() SET search_path = public;

-- 4. Event trigger bawaan Supabase (ensure_rls) — hanya jika ada di project ini
DO $$
BEGIN
    IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
