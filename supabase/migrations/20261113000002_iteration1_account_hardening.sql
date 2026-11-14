-- ==============================================================================
-- MIGRATION: AUDIT ITERASI 1 — PENGERASAN AKUN
-- 1. Hapus profil (Admin di aplikasi) → akun login ikut terhapus.
--    Hapus akun login (mis. dari Dashboard Supabase) → profil TETAP ada dan
--    ditandai Nonaktif, sehingga riwayat yang terhubung tidak hilang.
-- 2. Admin aktif terakhir tidak dapat dihapus, diturunkan role-nya, atau dinonaktifkan.
-- 3. Policy users memakai (select auth.uid()) / (select is_admin()) agar dievaluasi
--    sekali per query; index untuk FK users.employee_id.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Profil tidak lagi ikut terhapus saat akun login dihapus
-- ------------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.users
       SET status = 'Nonaktif', updated_at = NOW()
     WHERE id = OLD.id AND status <> 'Nonaktif';
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Hapus profil → hapus akun login (sesi & refresh token ikut terhapus)
CREATE OR REPLACE FUNCTION public.handle_profile_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM auth.users WHERE id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.users;
CREATE TRIGGER on_profile_deleted AFTER DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_profile_deleted();

-- ------------------------------------------------------------------------------
-- 2. Pengaman Admin aktif terakhir
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.role = 'Admin' AND OLD.status = 'Aktif'
       AND (TG_OP = 'DELETE' OR NEW.role <> 'Admin' OR NEW.status <> 'Aktif') THEN
        -- Serialisasi: dua Admin yang saling menurunkan secara bersamaan tidak boleh lolos berdua.
        PERFORM pg_advisory_xact_lock(hashtext('public.protect_last_admin'));
        IF NOT EXISTS (
            SELECT 1 FROM public.users
             WHERE id <> OLD.id AND role = 'Admin' AND status = 'Aktif'
        ) THEN
            RAISE EXCEPTION 'Tidak dapat menghapus, menurunkan role, atau menonaktifkan Admin aktif terakhir. Tambahkan Admin lain terlebih dahulu.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_admin ON public.users;
CREATE TRIGGER protect_last_admin BEFORE UPDATE OR DELETE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- ------------------------------------------------------------------------------
-- 3. Policy users (dievaluasi sekali per query) & index FK
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users"
    ON public.users FOR SELECT
    TO authenticated
    USING ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users"
    ON public.users FOR UPDATE
    TO authenticated
    USING ((select public.is_admin()))
    WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users"
    ON public.users FOR DELETE
    TO authenticated
    USING ((select public.is_admin()));

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);

-- ------------------------------------------------------------------------------
-- 4. Fungsi trigger tidak boleh dipanggil lewat RPC
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_deleted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
