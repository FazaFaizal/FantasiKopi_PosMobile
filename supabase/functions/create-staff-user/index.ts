// Edge Function: create-staff-user
// Membuat akun internal (Admin / Kasir) atas permintaan Admin yang sedang login.
//
// Kenapa tidak memakai auth.signUp di aplikasi? Karena signUp di klien mengganti
// sesi Admin dengan sesi akun baru (konfirmasi email nonaktif), sehingga update
// role ditolak RLS dan akun diam-diam tetap ber-role Customer.
//
// Aturan validasi sama dengan lib/staff-account-logic.ts — ubah keduanya bersamaan.
import { withSupabase } from 'npm:@supabase/server@1';

const STAFF_ROLES = ['Admin', 'Kasir'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return json({ error: 'Metode tidak diizinkan.' }, 405);
    }

    // 1. Hanya Admin aktif (dicek dengan fungsi DB yang sama dengan RLS).
    const { data: isAdmin, error: adminErr } = await ctx.supabase.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      return json({ error: 'Hanya Admin aktif yang dapat membuat akun internal.' }, 403);
    }

    // 2. Validasi input.
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const role = body?.role as StaffRole;
    const employeeId: string | null = body?.employeeId ? String(body.employeeId) : null;

    if (!EMAIL_PATTERN.test(email)) return json({ error: 'Format email tidak valid.' }, 400);
    if (password.length < PASSWORD_MIN_LENGTH) {
      return json({ error: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.` }, 400);
    }
    if (!STAFF_ROLES.includes(role)) {
      return json({ error: 'Role akun internal harus Admin atau Kasir.' }, 400);
    }

    if (employeeId) {
      const { data: employee } = await ctx.supabaseAdmin
        .from('employees')
        .select('id, status')
        .eq('id', employeeId)
        .maybeSingle();
      if (!employee) return json({ error: 'Data karyawan tidak ditemukan.' }, 400);
      if (employee.status !== 'Aktif') {
        return json({ error: 'Karyawan nonaktif tidak dapat diberi akun.' }, 400);
      }
    }

    // 3. Buat akun auth yang langsung terkonfirmasi (sesi Admin tidak tersentuh).
    const { data: created, error: createErr } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? 'Gagal membuat akun.';
      const isDuplicate = /already|registered|exists/i.test(msg);
      return json({ error: isDuplicate ? 'Email sudah terdaftar.' : msg }, isDuplicate ? 409 : 400);
    }

    // 4. Trigger handle_new_user membuat profil ber-role Customer; ubah ke role staf.
    const { error: updateErr } = await ctx.supabaseAdmin
      .from('users')
      .update({ role, employee_id: employeeId, status: 'Aktif' })
      .eq('id', created.user.id);

    if (updateErr) {
      // Rollback agar tidak tersisa akun "liar". Hapus profil dulu (trigger on_profile_deleted
      // ikut menghapus akun login); deleteUser sebagai cadangan jika trigger belum terpasang.
      await ctx.supabaseAdmin.from('users').delete().eq('id', created.user.id);
      await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      return json({ error: `Gagal menetapkan role: ${updateErr.message}` }, 500);
    }

    return json({ user: { id: created.user.id, email, role, employee_id: employeeId } }, 201);
  }),
};
