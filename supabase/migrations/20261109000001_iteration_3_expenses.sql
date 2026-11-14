-- ==============================================================================
-- MIGRATION: ITERASI 3.7 - PENGELOLAAN PENGELUARAN (EXPENSES) & FINANCIAL REPORTS
-- Membuat tabel expenses dan RLS policy khusus Admin
-- Sesuai spesifikasi PRD Section 21 & Section 22
-- ==============================================================================

-- 1. Buat tabel public.expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Raw Material', 'Operational', 'Equipment', 'Other')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index untuk akselerasi query laporan periode dan kategori
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- 3. Aktifkan Row Level Security (RLS)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 4. Kebijakan RLS: Hanya Admin yang dapat mengelola expenses
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
CREATE POLICY "Admins can manage expenses"
    ON public.expenses FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 5. Trigger update timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_expenses_updated_at ON public.expenses;
CREATE TRIGGER set_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';

