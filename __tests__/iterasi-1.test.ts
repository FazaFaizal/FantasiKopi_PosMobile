// UAT Iterasi 1: Authentication, Employee & User (docs/uat-per-iterasi.md bagian 4).
// I1-02: penolakan password salah dilakukan Supabase Auth; di sini hanya pengecekan isian sebelum dikirim.
import {
  canDeleteUserAccount,
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validatePassword,
  type AccountStatus,
  type UserRole,
} from '../lib/auth-logic';
import { getEmployeeStatusChangeMessage, validateEmployeeInput } from '../lib/employee-logic';
import { evaluateNavigationGuard } from '../lib/navigation-logic';
import {
  describeAccountRelation,
  getLinkableEmployees,
  validateStaffAccountPayload,
  validateUserAccountUpdate,
  type StaffRole,
} from '../lib/staff-account-logic';

const NOW = new Date('2026-11-16T02:00:00.000Z'); // 10:00 WITA
const SESSION = { access_token: 'token-uji' };

const guard = (role: UserRole, status: AccountStatus, segments: string[]) =>
  evaluateNavigationGuard({ isReady: true, session: SESSION, user: { role, status }, segments });

const EMPLOYEES = [
  { id: 'emp-rina', name: 'Rina', status: 'Aktif' as const },
  { id: 'emp-dodi', name: 'Dodi', status: 'Aktif' as const },
  { id: 'emp-sari', name: 'Sari', status: 'Nonaktif' as const },
];
const USERS = [
  { id: 'adm-1', employee_id: 'emp-admin' },
  { id: 'ksr-1', employee_id: 'emp-rina' },
  { id: 'cus-1', employee_id: null },
];

describe('I1-01 Login Admin', () => {
  test('Admin aktif di halaman login diarahkan ke Dashboard Admin', () => {
    expect(guard('Admin', 'Aktif', ['(auth)', 'login'])).toEqual({
      action: 'redirect',
      targetHref: '/(admin)/dashboard',
    });
  });
});

describe('I1-02 Login dengan password salah', () => {
  test('email kosong atau salah format ditolak sebelum dikirim ke server', () => {
    expect(validateEmail('')).toEqual({ isValid: false, error: 'Email wajib diisi' });
    expect(validateEmail('admin@faza')).toEqual({ isValid: false, error: 'Format email tidak valid' });
    expect(validateEmail('admin.faza.com')).toEqual({ isValid: false, error: 'Format email tidak valid' });
  });

  test('email yang benar diteruskan ke server', () => {
    expect(validateEmail(' admin@faza.com ')).toEqual({ isValid: true });
  });
});

describe('I1-03 Tambah karyawan', () => {
  test('nama, telepon, dan tanggal mulai yang benar diterima', () => {
    const result = validateEmployeeInput(
      { name: 'Rina', phone: '0812-3456-7890', email: 'rina@faza.com', startDate: '2026-11-01' },
      NOW
    );
    expect(result).toEqual({ isValid: true, errors: {} });
  });

  test('nama wajib diisi', () => {
    expect(validateEmployeeInput({ name: '   ' }, NOW).errors.name).toBe('Nama lengkap karyawan wajib diisi');
  });

  test.each(['123', '0812abc9999', '1234567890123456'])('telepon "%s" ditolak', (phone) => {
    expect(validateEmployeeInput({ name: 'Rina', phone }, NOW).errors.phone).toBe(
      'Nomor telepon tidak valid (8–15 digit)'
    );
  });

  test('tanggal mulai di masa depan (WITA) ditolak', () => {
    expect(validateEmployeeInput({ name: 'Rina', startDate: '2026-11-17' }, NOW).errors.startDate).toBe(
      'Tanggal mulai bekerja tidak boleh di masa depan'
    );
  });

  test('tanggal yang tidak ada di kalender ditolak', () => {
    expect(validateEmployeeInput({ name: 'Rina', startDate: '2026-02-30' }, NOW).errors.startDate).toBe(
      'Gunakan format tanggal YYYY-MM-DD, mis. 2026-01-15'
    );
  });
});

describe('I1-04 Buat akun Kasir dari karyawan', () => {
  const valid = { email: ' Kasir1@Faza.com ', password: 'rahasia123', role: 'Kasir' as StaffRole, employeeId: 'emp-dodi' };

  test('data lengkap diterima dan email dirapikan', () => {
    const result = validateStaffAccountPayload(valid);
    expect(result.isValid).toBe(true);
    expect(result.value).toEqual({
      email: 'kasir1@faza.com',
      password: 'rahasia123',
      role: 'Kasir',
      employeeId: 'emp-dodi',
    });
  });

  test('password kurang dari 8 karakter ditolak', () => {
    expect(validateStaffAccountPayload({ ...valid, password: 'pendek' }).errors.password).toBe(
      'Password minimal 8 karakter'
    );
  });

  test('role selain Admin/Kasir ditolak', () => {
    const result = validateStaffAccountPayload({ ...valid, role: 'Customer' as unknown as StaffRole });
    expect(result.errors.role).toBe('Role akun internal harus Admin atau Kasir');
  });

  test('akun karyawan wajib memilih data karyawan', () => {
    expect(validateStaffAccountPayload({ ...valid, employeeId: null }).errors.employee).toBe(
      'Pilih data karyawan untuk akun ini'
    );
  });

  test('daftar akun menampilkan karyawan yang terhubung', () => {
    expect(describeAccountRelation({ role: 'Kasir' }, { name: 'Dodi', position: 'Kasir' })).toBe(
      'Karyawan: Dodi (Kasir)'
    );
    expect(describeAccountRelation({ role: 'Kasir' }, null)).toBe('Belum terhubung dengan data karyawan');
  });
});

describe('I1-05 Satu karyawan satu akun', () => {
  test('karyawan yang sudah punya akun atau nonaktif tidak muncul sebagai pilihan', () => {
    expect(getLinkableEmployees(EMPLOYEES, USERS).map((e) => e.id)).toEqual(['emp-dodi']);
  });

  test('saat mengedit akun, karyawannya sendiri tetap bisa dipilih', () => {
    expect(getLinkableEmployees(EMPLOYEES, USERS, 'ksr-1').map((e) => e.id)).toEqual(['emp-rina', 'emp-dodi']);
  });

  test('menautkan akun lain ke karyawan yang sudah punya akun ditolak', () => {
    const result = validateUserAccountUpdate({
      target: { id: 'ksr-2', role: 'Kasir', status: 'Aktif', employee_id: 'emp-dodi' },
      next: { role: 'Kasir', status: 'Aktif', employeeId: 'emp-rina' },
      currentUserId: 'adm-1',
      employees: EMPLOYEES,
      users: USERS,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Karyawan Rina sudah memiliki akun lain. Satu karyawan hanya boleh memiliki satu akun.');
  });
});

describe('I1-06 Registrasi Customer', () => {
  test(`password minimal ${PASSWORD_MIN_LENGTH} karakter`, () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePassword('1234567')).toEqual({ isValid: false, error: 'Password minimal 8 karakter' });
    expect(validatePassword('')).toEqual({ isValid: false, error: 'Password wajib diisi' });
    expect(validatePassword('12345678')).toEqual({ isValid: true });
  });
});

describe('I1-07 Login Customer', () => {
  test('Customer diarahkan ke katalog menu', () => {
    expect(guard('Customer', 'Aktif', ['(auth)', 'login']).targetHref).toBe('/(customer)/product');
  });
});

describe('I1-08 Login Kasir', () => {
  test('Kasir diarahkan ke Terminal Kasir POS', () => {
    expect(guard('Kasir', 'Aktif', ['(auth)', 'login']).targetHref).toBe('/(kasir)/pos');
  });
});

describe('I1-09 Logout', () => {
  test('tanpa sesi, halaman mana pun di luar login diarahkan ke login', () => {
    for (const segments of [['(admin)', 'dashboard'], ['(kasir)', 'pos'], ['(customer)', 'product']]) {
      expect(evaluateNavigationGuard({ isReady: true, session: null, user: null, segments })).toEqual({
        action: 'redirect',
        targetHref: '/(auth)/login',
      });
    }
  });

  test('tanpa sesi, halaman login dan daftar tetap bisa dibuka', () => {
    for (const screen of ['login', 'register']) {
      expect(
        evaluateNavigationGuard({ isReady: true, session: null, user: null, segments: ['(auth)', screen] })
      ).toEqual({ action: 'allow' });
    }
  });
});

describe('I1-10 Sesi tersimpan', () => {
  test('aplikasi dibuka ulang dengan sesi tersimpan langsung masuk ke halaman role', () => {
    expect(guard('Kasir', 'Aktif', [])).toEqual({ action: 'redirect', targetHref: '/(kasir)/pos' });
  });

  test('tidak ada pengalihan sebelum pengecekan sesi selesai', () => {
    expect(evaluateNavigationGuard({ isReady: false, session: null, user: null, segments: ['(admin)'] })).toEqual({
      action: 'allow',
    });
  });
});

describe('I1-11 Akses halaman Admin ditolak', () => {
  test('Kasir yang membuka halaman Admin diarahkan ke Akses Dibatasi', () => {
    expect(guard('Kasir', 'Aktif', ['(admin)', 'dashboard'])).toEqual({
      action: 'redirect',
      targetHref: '/(auth)/unauthorized',
    });
  });

  test('halaman Akses Dibatasi tidak mengalihkan lagi', () => {
    expect(guard('Kasir', 'Aktif', ['(auth)', 'unauthorized'])).toEqual({ action: 'allow' });
  });

  test('Kasir tetap bisa membuka halaman Kasir', () => {
    expect(guard('Kasir', 'Aktif', ['(kasir)', 'pos'])).toEqual({ action: 'allow' });
  });
});

describe('I1-12 Akses halaman staf ditolak', () => {
  test.each([['(kasir)', 'pos'], ['(admin)', 'dashboard']])('Customer membuka %s ditolak', (...segments) => {
    expect(guard('Customer', 'Aktif', segments).targetHref).toBe('/(auth)/unauthorized');
  });
});

describe('I1-13 Nonaktifkan karyawan', () => {
  test('konfirmasi memberi tahu bahwa akun login ikut dinonaktifkan', () => {
    expect(getEmployeeStatusChangeMessage('Rina', 'Nonaktif', 1)).toBe(
      'Nonaktifkan "Rina"? Akun login karyawan ini akan ikut dinonaktifkan sehingga tidak dapat masuk ke aplikasi.'
    );
  });
});

describe('I1-14 Login akun nonaktif', () => {
  test.each([['(kasir)', 'pos'], ['(auth)', 'login'], []])('akun nonaktif di %s diarahkan ke Akun Dinonaktifkan', (...segments) => {
    expect(guard('Kasir', 'Nonaktif', segments).targetHref).toBe('/(auth)/inactive');
  });

  test('halaman Akun Dinonaktifkan tidak mengalihkan lagi', () => {
    expect(guard('Kasir', 'Nonaktif', ['(auth)', 'inactive'])).toEqual({ action: 'allow' });
  });
});

describe('I1-15 Aktifkan kembali karyawan', () => {
  test('konfirmasi memberi tahu bahwa akun tetap nonaktif', () => {
    expect(getEmployeeStatusChangeMessage('Rina', 'Aktif', 1)).toContain('Akun loginnya tetap nonaktif');
  });

  const reactivate = (employeeStatus: 'Aktif' | 'Nonaktif') =>
    validateUserAccountUpdate({
      target: { id: 'ksr-1', role: 'Kasir', status: 'Nonaktif', employee_id: 'emp-rina' },
      next: { role: 'Kasir', status: 'Aktif', employeeId: 'emp-rina' },
      currentUserId: 'adm-1',
      employees: [{ id: 'emp-rina', name: 'Rina', status: employeeStatus }],
      users: USERS,
    });

  test('akun tidak bisa diaktifkan selama karyawannya nonaktif', () => {
    expect(reactivate('Nonaktif')).toEqual({
      allowed: false,
      reason: 'Karyawan Rina berstatus Nonaktif. Aktifkan data karyawannya terlebih dahulu sebelum mengaktifkan akun ini.',
    });
  });

  test('akun bisa diaktifkan manual setelah karyawannya aktif', () => {
    expect(reactivate('Aktif')).toEqual({ allowed: true });
  });
});

describe('I1-16 Ubah role Admin ↔ Kasir', () => {
  const update = (from: 'Admin' | 'Kasir' | 'Customer', to: 'Admin' | 'Kasir' | 'Customer', employeeId: string | null) =>
    validateUserAccountUpdate({
      target: { id: 'acc-x', role: from, status: 'Aktif', employee_id: employeeId },
      next: { role: to, status: 'Aktif', employeeId },
      currentUserId: 'adm-1',
      employees: EMPLOYEES,
      users: [{ id: 'acc-x', employee_id: employeeId }],
    });

  test('Kasir ke Admin dan kembali ke Kasir diizinkan', () => {
    expect(update('Kasir', 'Admin', 'emp-dodi')).toEqual({ allowed: true });
    expect(update('Admin', 'Kasir', 'emp-dodi')).toEqual({ allowed: true });
  });

  test('akun Customer tidak bisa diubah menjadi Admin/Kasir, dan sebaliknya', () => {
    expect(update('Customer', 'Kasir', null).allowed).toBe(false);
    expect(update('Kasir', 'Customer', 'emp-dodi').allowed).toBe(false);
  });
});

describe('I1-17 Admin tidak bisa mengubah diri sendiri', () => {
  const self = (next: { role: 'Admin' | 'Kasir'; status: 'Aktif' | 'Nonaktif' }) =>
    validateUserAccountUpdate({
      target: { id: 'adm-1', role: 'Admin', status: 'Aktif', employee_id: 'emp-dodi' },
      next: { ...next, employeeId: 'emp-dodi' },
      currentUserId: 'adm-1',
      employees: EMPLOYEES,
      users: [{ id: 'adm-1', employee_id: 'emp-dodi' }],
    });
  const reason = 'Anda tidak dapat mengubah role atau menonaktifkan akun Anda sendiri. Minta Admin lain melakukannya.';

  test('mengubah role sendiri ditolak', () => {
    expect(self({ role: 'Kasir', status: 'Aktif' })).toEqual({ allowed: false, reason });
  });

  test('menonaktifkan akun sendiri ditolak', () => {
    expect(self({ role: 'Admin', status: 'Nonaktif' })).toEqual({ allowed: false, reason });
  });

  test('menghapus akun sendiri ditolak', () => {
    expect(canDeleteUserAccount({ id: 'adm-1' }, { id: 'adm-1' })).toEqual({
      allowed: false,
      reason: 'Anda tidak dapat menghapus akun Anda sendiri.',
    });
    expect(canDeleteUserAccount({ id: 'ksr-1' }, { id: 'adm-1' })).toEqual({ allowed: true });
  });
});

describe('I1-18 Nonaktifkan Customer', () => {
  test('Admin dapat menonaktifkan akun Customer', () => {
    const result = validateUserAccountUpdate({
      target: { id: 'cus-2', role: 'Customer', status: 'Aktif', employee_id: null },
      next: { role: 'Customer', status: 'Nonaktif', employeeId: null },
      currentUserId: 'adm-1',
      employees: EMPLOYEES,
      users: USERS,
    });
    expect(result).toEqual({ allowed: true });
  });

  test('Customer nonaktif diarahkan ke halaman Akun Dinonaktifkan', () => {
    expect(guard('Customer', 'Nonaktif', ['(customer)', 'product']).targetHref).toBe('/(auth)/inactive');
  });
});
