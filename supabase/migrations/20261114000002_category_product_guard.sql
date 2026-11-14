-- ==============================================================================
-- MIGRATION: ATURAN KATEGORI & PRODUK
-- 1. Kategori tidak dapat dinonaktifkan selama masih ada produk yang terhubung.
-- 2. Produk aktif tidak dapat ditambahkan, dipindahkan, atau diaktifkan kembali
--    ke kategori yang berstatus Nonaktif.
-- Tujuan: produk yang tampil di POS & menu customer selalu berada di kategori aktif.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_category_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NEW.status = 'Nonaktif' AND OLD.status IS DISTINCT FROM 'Nonaktif'
       AND EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = NEW.id) THEN
        SELECT COUNT(*) INTO v_count FROM public.products WHERE category_id = NEW.id;
        RAISE EXCEPTION 'Kategori "%" masih dipakai % produk. Pindahkan produk tersebut ke kategori lain atau hapus produknya terlebih dahulu.',
            NEW.name, v_count
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_category_deactivation ON public.categories;
CREATE TRIGGER guard_category_deactivation BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.guard_category_deactivation();

CREATE OR REPLACE FUNCTION public.guard_product_category_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_active AND NEW.category_id IS NOT NULL
       AND (TG_OP = 'INSERT'
            OR NEW.category_id IS DISTINCT FROM OLD.category_id
            OR NEW.is_active IS DISTINCT FROM OLD.is_active)
       AND EXISTS (SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.status = 'Nonaktif') THEN
        RAISE EXCEPTION 'Kategori yang dipilih sedang nonaktif. Aktifkan kategorinya atau pilih kategori lain.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_category_active ON public.products;
CREATE TRIGGER guard_product_category_active BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.guard_product_category_active();

REVOKE EXECUTE ON FUNCTION public.guard_category_deactivation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_category_active() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
