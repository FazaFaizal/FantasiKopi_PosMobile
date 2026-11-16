/**
 * FANTASI COFFEE - ZONA WAKTU BISNIS (SATU SUMBER)
 * Semua batas "hari" (laporan, dashboard, kas, sif, nomor order, expense) memakai
 * zona waktu kedai, bukan zona waktu perangkat atau server.
 * Pasangan di database: public.business_timezone() / public.business_today().
 * Jika zona waktu kedai berubah, ubah KEDUANYA.
 *
 * Indonesia tidak memakai daylight saving time, sehingga offset tetap.
 */

/** Asia/Makassar (WITA, UTC+8). */
const BUSINESS_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Tanggal bisnis (YYYY-MM-DD) dari sebuah waktu. */
export function getBusinessDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + BUSINESS_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Tanggal bisnis dari timestamp ISO (mis. kolom created_at). */
export function toBusinessDateString(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : getBusinessDateString(d);
}

/** Awal hari bisnis (00:00) dalam ISO UTC. */
export function getBusinessDayStartISO(businessDate: string): string {
  return new Date(new Date(`${businessDate}T00:00:00.000Z`).getTime() - BUSINESS_UTC_OFFSET_MS).toISOString();
}

/** Rentang [awal hari `from`, awal hari setelah `to`) dalam ISO UTC, untuk filter created_at. */
export function getBusinessDayRangeISO(from: string, to: string): { startISO: string; endISO: string } {
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startISO: getBusinessDayStartISO(from),
    endISO: getBusinessDayStartISO(end.toISOString().slice(0, 10)),
  };
}

/** Geser tanggal bisnis sebanyak `days` hari. */
export function addBusinessDays(businessDate: string, days: number): string {
  const d = new Date(`${businessDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
