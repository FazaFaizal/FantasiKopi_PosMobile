-- ==============================================================================
-- MIGRATION: ATURAN KARYAWAN & AKUN PENGGUNA (keputusan 2026-11-14)
-- 1. Nama customer saat registrasi disimpan di profil (users.full_name).
-- 2. Akun Customer terpisah total dari data karyawan: tidak dapat dihubungkan ke
--    karyawan dan tidak dapat diubah menjadi Admin/Kasir (atau sebaliknya).
-- 3. Setiap akun karyawan (Admin/Kasir) wajib terhubung ke tepat satu data karyawan;
--    akun Aktif hanya untuk karyawan Aktif.
-- 4. Admin tidak dapat mengubah role atau menonaktifkan akunnya sendiri.
-- 5. Data karyawan tidak dapat dihapus, hanya dinonaktifkan (PRD 7).
-- Akun karyawan lama yang belum terhubung dibuatkan data karyawannya otomatis.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Nama di profil
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, role, status, full_name)
    VALUES (NEW.id, NEW.email, 'Customer', 'Aktif', NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

UPDATE public.users u
   SET full_name = NULLIF(btrim(a.raw_user_meta_data ->> 'name'), '')
  FROM auth.users a
 WHERE a.id = u.id
   AND u.full_name IS NULL
   AND NULLIF(btrim(a.raw_user_meta_data ->> 'name'), '') IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Rapikan data lama sebelum aturan dipasang
-- ------------------------------------------------------------------------------
-- Akun Customer tidak terhubung dengan karyawan.
UPDATE public.users SET employee_id = NULL WHERE role = 'Customer' AND employee_id IS NOT NULL;

-- Satu karyawan satu akun: akun tertua tetap terhubung, sisanya dilepas lalu dibuatkan datanya.
UPDATE public.users u
   SET employee_id = NULL
 WHERE u.employee_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM public.users o
        WHERE o.employee_id = u.employee_id
          AND (o.created_at, o.id) < (u.created_at, u.id)
   );

-- Akun karyawan tanpa data karyawan dibuatkan datanya (nama dapat diubah di menu Karyawan).
DO $do$
DECLARE
    r RECORD;
    v_employee UUID;
BEGIN
    FOR r IN
        SELECT u.id, u.email, u.role, u.full_name
          FROM public.users u
         WHERE u.role IN ('Admin', 'Kasir') AND u.employee_id IS NULL
    LOOP
        INSERT INTO public.employees (name, email, position, status)
        VALUES (COALESCE(r.full_name, split_part(r.email, '@', 1)), r.email, r.role, 'Aktif')
        RETURNING id INTO v_employee;
        UPDATE public.users SET employee_id = v_employee WHERE id = r.id;
    END LOOP;
END
$do$;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique ON public.users(employee_id) WHERE employee_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3 & 4. Aturan akun
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_account_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_employee public.employees%ROWTYPE;
BEGIN
    -- Admin tidak dapat mengubah role / menonaktifkan akunnya sendiri.
    IF TG_OP = 'UPDATE' AND v_uid IS NOT NULL AND OLD.id = v_uid
       AND (NEW.role IS DISTINCT FROM OLD.role OR (OLD.status = 'Aktif' AND NEW.status = 'Nonaktif')) THEN
        RAISE EXCEPTION 'Anda tidak dapat mengubah role atau menonaktifkan akun Anda sendiri. Minta Admin lain melakukannya.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Customer <-> karyawan tidak dapat saling diubah oleh pengguna aplikasi.
    -- (Proses sistem tanpa auth.uid(), mis. Edge Function create-staff-user, mengubah
    --  profil baru dari Customer menjadi Admin/Kasir saat akun karyawan dibuat.)
    IF TG_OP = 'UPDATE' AND v_uid IS NOT NULL
       AND (OLD.role = 'Customer') IS DISTINCT FROM (NEW.role = 'Customer') THEN
        RAISE EXCEPTION 'Akun Customer terpisah dari akun karyawan sehingga tidak dapat diubah menjadi Admin/Kasir (atau sebaliknya). Buat akun karyawan lewat menu Akun Pengguna.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'Customer' THEN
        IF NEW.employee_id IS NOT NULL THEN
            RAISE EXCEPTION 'Akun Customer tidak dapat dihubungkan dengan data karyawan.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.employee_id IS NULL THEN
        RAISE EXCEPTION 'Akun karyawan wajib terhubung dengan data karyawan.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'Aktif'
       AND (TG_OP = 'INSERT'
            OR OLD.status IS DISTINCT FROM 'Aktif'
            OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
            OR OLD.role = 'Customer') THEN
        SELECT * INTO v_employee FROM public.employees WHERE id = NEW.employee_id;
        IF NOT FOUND OR v_employee.status <> 'Aktif' THEN
            RAISE EXCEPTION 'Karyawan % berstatus Nonaktif. Aktifkan data karyawannya terlebih dahulu sebelum mengaktifkan akun ini.',
                COALESCE(v_employee.name, '')
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_account_rules ON public.users;
CREATE TRIGGER guard_user_account_rules BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_account_rules();

-- ------------------------------------------------------------------------------
-- 5. Karyawan tidak dapat dihapus
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_employee_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Data karyawan tidak dapat dihapus agar riwayat tetap valid. Nonaktifkan karyawan sebagai gantinya.'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS prevent_employee_delete ON public.employees;
CREATE TRIGGER prevent_employee_delete BEFORE DELETE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_delete();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_user_account_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_employee_delete() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
