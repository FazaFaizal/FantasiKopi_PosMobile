-- ==============================================================================
-- FANTASI COFFEE MOBILE POS - MASTER SEED DATA
-- Deskripsi: Data awal untuk inisialisasi lingkungan pengujian / staging.
--            Menyediakan akun Super Admin, kategori menu awal, produk kedai kopi,
--            dan persediaan bahan baku.
-- ==============================================================================

-- 1. Inisialisasi Ekstensi Kriptografi
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Akun Super Administrator
--    Email: admin@faza.com
--    Password: password123
DO $$
DECLARE
    new_user_id UUID := '00000000-0000-0000-0000-000000000001';
    admin_email TEXT := 'admin@faza.com';
    admin_password TEXT := 'password123';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
        -- Insert ke auth.users
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            new_user_id,
            'authenticated',
            'authenticated',
            admin_email,
            crypt(admin_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"name":"Super Administrator"}',
            now(),
            now()
        );

        -- Insert ke auth.identities
        INSERT INTO auth.identities (
            provider_id, user_id, identity_data, provider, created_at, updated_at
        ) VALUES (
            new_user_id::text,
            new_user_id,
            format('{"sub":"%s","email":"%s"}', new_user_id::text, admin_email)::jsonb,
            'email',
            now(),
            now()
        );

        -- Update atau insert role Admin pada public.users
        INSERT INTO public.users (id, email, role, status)
        VALUES (new_user_id, admin_email, 'Admin', 'Aktif')
        ON CONFLICT (id) DO UPDATE SET role = 'Admin', status = 'Aktif';
    ELSE
        -- Jika auth user sudah ada, pastikan role di public.users adalah Admin
        UPDATE public.users SET role = 'Admin', status = 'Aktif' WHERE email = admin_email;
    END IF;
END $$;

-- 3. Kategori Produk Awal
INSERT INTO public.categories (id, name, description, status) VALUES
    ('11111111-1111-1111-1111-111111111101', 'Espresso & Coffee', 'Kopi klasik berbasis espresso dan susu segar pilihan', 'Aktif'),
    ('11111111-1111-1111-1111-111111111102', 'Manual Brew', 'Seduhan kopi filter single origin Nusantara', 'Aktif'),
    ('11111111-1111-1111-1111-111111111103', 'Non-Coffee', 'Minuman matcha, artisan chocolate, dan teh buah', 'Aktif'),
    ('11111111-1111-1111-1111-111111111104', 'Pastry & Snacks', 'Kudapan roti dan camilan pendamping kopi', 'Aktif')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 4. Produk Menu Kedai Kopi
INSERT INTO public.products (id, name, description, category_id, price, status, is_active) VALUES
    ('22222222-2222-2222-2222-222222222201', 'Kopi Susu Gula Aren', 'Espresso house blend, susu segar, dan gula aren organik', '11111111-1111-1111-1111-111111111101', 24000, 'Tersedia', true),
    ('22222222-2222-2222-2222-222222222202', 'Caffe Latte', 'Double espresso dengan microfoam steamed milk lembut', '11111111-1111-1111-1111-111111111101', 26000, 'Tersedia', true),
    ('22222222-2222-2222-2222-222222222203', 'Americano', 'Espresso shot dicampur air mineral panas/dingin segar', '11111111-1111-1111-1111-111111111101', 20000, 'Tersedia', true),
    ('22222222-2222-2222-2222-222222222204', 'V60 Aceh Gayo', 'Kopi filter dengan karakter rasa buah segar dan floral', '11111111-1111-1111-1111-111111111102', 28000, 'Tersedia', true),
    ('22222222-2222-2222-2222-222222222205', 'Matcha Latte', 'Matcha Uji Jepang berpadu dengan fresh milk manis seimbang', '11111111-1111-1111-1111-111111111103', 27000, 'Tidak Tersedia', true),
    ('22222222-2222-2222-2222-222222222206', 'Signature Chocolate', 'Dark chocolate couverture lokal dan susu creamy', '11111111-1111-1111-1111-111111111103', 25000, 'Tersedia', true),
    ('22222222-2222-2222-2222-222222222207', 'Butter Croissant', 'Pastry lapis mentega renyah dipanggang fresh setiap pagi', '11111111-1111-1111-1111-111111111104', 22000, 'Tersedia', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, status = EXCLUDED.status;

-- 5. Inventaris Bahan Baku Fisik Kedai
INSERT INTO public.inventory_items (id, name, unit, current_stock, min_stock, notes) VALUES
    ('33333333-3333-3333-3333-333333333301', 'Biji Kopi Arabika Gayo', 'gram', 2500, 1000, 'Roasting medium-dark untuk espresso & pour over'),
    ('33333333-3333-3333-3333-333333333302', 'Biji Kopi Robusta Dampit', 'gram', 3000, 1000, 'Blend kopi susu kedai'),
    ('33333333-3333-3333-3333-333333333303', 'Fresh Milk Pasteurisasi', 'ml', 8000, 3000, 'Susu cair segar kemasan 1 liter'),
    ('33333333-3333-3333-3333-333333333304', 'Gula Aren Cair Organik', 'ml', 650, 1000, 'Peringatan: Stok menipis mendekati batas aman'),
    ('33333333-3333-3333-3333-333333333305', 'Bubuk Matcha Premium', 'gram', 0, 200, 'Habis total - perlu restock segera'),
    ('33333333-3333-3333-3333-333333333306', 'Paper Cup & Tutup 8oz', 'pcs', 180, 50, 'Gelas takeaway panas')
ON CONFLICT (id) DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock = EXCLUDED.min_stock;
