-- Migration: Kasir dapat mengubah status ketersediaan produk (Tersedia / Tidak Tersedia)
-- Mengizinkan role 'Kasir' dan 'Admin' (is_staff()) untuk melakukan UPDATE pada produk.

DROP POLICY IF EXISTS "Staff can update product status" ON public.products;
CREATE POLICY "Staff can update product status"
    ON public.products FOR UPDATE
    TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

