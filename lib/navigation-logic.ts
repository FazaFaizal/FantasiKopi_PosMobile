import {
  type UserRole,
  type AccountStatus,
  checkRoleRouteAccess,
  getDefaultRouteForRole,
} from './auth-logic';

/**
 * Logika Navigasi Murni & Pencocokan Rute (Expo Router)
 * Mendukung ekstraksi rute, normalisasi rute group, dan deteksi rute aktif
 */

/**
 * Menghapus rute group (misal `/(admin)`, `/(kasir)`), parameter query, dan trailing slash.
 * Contoh: `/(admin)/dashboard` -> `/dashboard`
 */
export function normalizeRoute(path: string): string {
  if (!path) return '';

  // 1. Buang query parameters (?sort=asc)
  const cleanPath = path.split('?')[0];

  // 2. Buang route group dalam kurung seperti /(admin) atau /(kasir)
  const stripped = cleanPath.replace(/\/\([^)]+\)/g, '');

  // 3. Normalisasi trailing slash berulang dan trailing slash tunggal
  const trimmed = stripped.replace(/\/+$/, '');

  return trimmed || '/';
}

/**
 * Memeriksa apakah rute target sedang aktif terhadap rute yang sedang dibuka.
 * Menangani perbedaan nama grup URL (`usePathname()` menghasilkan `/pos` sedangkan item route `/(kasir)/pos`).
 */
export function isRouteActive(activeRoute?: string, targetRoute?: string): boolean {
  if (!activeRoute || !targetRoute) return false;

  const normActive = normalizeRoute(activeRoute);
  const normTarget = normalizeRoute(targetRoute);

  // Pencocokan langsung (misal: /dashboard === /dashboard)
  if (normActive === normTarget) {
    return true;
  }

  // Pencocokan sub-halaman hierarkis (misal: /product/detail/1 berada di bawah /product)
  if (normTarget !== '/' && normActive.startsWith(`${normTarget}/`)) {
    return true;
  }

  return false;
}

/**
 * Mengekstrak nama tab sederhana dari rute Expo Router
 * Contoh: `/(admin)/dashboard` -> `dashboard`
 */
export function resolveTabRouteName(route: string): string {
  const norm = normalizeRoute(route);
  const segments = norm.split('/').filter(Boolean);
  return segments[segments.length - 1] || 'index';
}

export interface NavigationGuardDecision {
  action: 'redirect' | 'allow';
  targetHref?: string;
}

export interface NavigationGuardContext {
  isReady: boolean;
  session: any;
  user?: {
    role: UserRole;
    status: AccountStatus;
  } | null;
  segments: string[];
}

/**
 * Mengevaluasi aturan perlindungan rute berbasis segmen Expo Router dan otorisasi RBAC.
 * Mengembalikan keputusan `allow` atau `redirect` beserta URL tujuan tanpa memicu render flash / loop.
 */
export function evaluateNavigationGuard({
  isReady,
  session,
  user,
  segments,
}: NavigationGuardContext): NavigationGuardDecision {
  // Jika app masih dalam tahap inisialisasi awal (font / session check)
  if (!isReady) {
    return { action: 'allow' };
  }

  const isAtRoot = segments.length === 0 || segments[0] === 'index';
  const currentGroup = segments[0];
  const currentScreen = segments[1];
  const isAuthGroup = currentGroup === '(auth)';
  const isEntryScreen = isAuthGroup && (currentScreen === 'login' || currentScreen === 'register');
  const isInactiveScreen = isAuthGroup && currentScreen === 'inactive';
  const isUnauthorizedScreen = isAuthGroup && currentScreen === 'unauthorized';

  // 1. Kasus Belum Login
  if (!session || !user) {
    // Jika belum login dan berada di luar login / register -> lempar ke login
    if (!isAuthGroup || isUnauthorizedScreen || isInactiveScreen) {
      return { action: 'redirect', targetHref: '/(auth)/login' };
    }
    return { action: 'allow' };
  }

  // 2. Kasus User Nonaktif
  if (user.status === 'Nonaktif') {
    // Pastikan user Nonaktif diarahkan ke layar inactive kecuali jika sudah di layar inactive
    if (!isInactiveScreen) {
      return { action: 'redirect', targetHref: '/(auth)/inactive' };
    }
    return { action: 'allow' };
  }

  // 3. Kasus User Aktif yang berada di rute entry auth, layar inactive, atau root
  if (isEntryScreen || isAtRoot || isInactiveScreen) {
    return {
      action: 'redirect',
      targetHref: getDefaultRouteForRole(user.role, user.status),
    };
  }

  // 4. Layar Unauthorized diizinkan tampil untuk user aktif (mencegah loop / flashing ke dashboard)
  if (isUnauthorizedScreen) {
    return { action: 'allow' };
  }

  // 5. Pembatasan Hak Akses Antar Role Group (RBAC)
  if (!checkRoleRouteAccess(user.role, currentGroup)) {
    return { action: 'redirect', targetHref: '/(auth)/unauthorized' };
  }

  return { action: 'allow' };
}


