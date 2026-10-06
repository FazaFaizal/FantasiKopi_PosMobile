-- ==============================================================================
-- MIGRATION: Iterasi 1 - Autentikasi Pengguna & Manajemen Karyawan
-- Fantasi Coffee Mobile POS
-- ==============================================================================

-- 1. Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create Table: employees
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    position TEXT,
    start_date DATE,
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Table: users (relasi ke auth.users dan employees)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Customer' CHECK (role IN ('Admin', 'Kasir', 'Customer')),
    status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing relasi foreign key & status
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON public.users(role, status);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

-- 4. Helper Function: is_admin (SECURITY DEFINER untuk cegah rekursi RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'Admin' AND status = 'Aktif'
  );
$$;

-- 5. Trigger Registrasi Otomatis (Saat ada akun auth baru mendaftar)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, role, status)
    VALUES (NEW.id, NEW.email, 'Customer', 'Aktif')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Trigger Sinkronisasi Status: Karyawan Nonaktif -> Akun User Nonaktif
CREATE OR REPLACE FUNCTION public.handle_employee_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'Nonaktif' AND OLD.status = 'Aktif' THEN
        UPDATE public.users SET status = 'Nonaktif' WHERE employee_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_status_updated ON public.employees;
CREATE TRIGGER on_employee_status_updated
    AFTER UPDATE ON public.employees
    FOR EACH ROW 
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.handle_employee_status_change();

-- 7. Row Level Security (RLS)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" 
    ON public.users FOR SELECT 
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" 
    ON public.users FOR SELECT 
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users" 
    ON public.users FOR UPDATE 
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete users" ON public.users;
CREATE POLICY "Admins can delete users" 
    ON public.users FOR DELETE 
    TO authenticated
    USING (public.is_admin());

-- Policy employees
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees" 
    ON public.employees FOR ALL 
    TO authenticated
    USING (public.is_admin());
