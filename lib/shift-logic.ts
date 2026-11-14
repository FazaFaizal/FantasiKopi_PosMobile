/**
 * FANTASI COFFEE - SIF KASIR (SHIFT LOGIC)
 * Satu laci, sif bergantian. Uang di laci terakumulasi lintas sif:
 *   modal awal sif berikutnya = uang dihitung − uang disetor pada sif sebelumnya.
 * Kas seharusnya = modal awal + tunai diterima − refund tunai − pengeluaran dari kas.
 * Perhitungan resmi dilakukan fungsi DB (get_shift_summary / close_cash_shift);
 * fungsi di sini dipakai untuk validasi form dan tampilan.
 */

import { parseRupiahInput } from './inventory-logic';

export interface ClosedShiftCash {
  counted_cash: number;
  cash_withdrawn: number;
}

/** Sisa uang di laci dari sif terakhir yang ditutup (null jika belum pernah ada sif). */
export function getSuggestedOpeningCash(lastClosed: ClosedShiftCash | null): number | null {
  if (!lastClosed) return null;
  return Number(lastClosed.counted_cash || 0) - Number(lastClosed.cash_withdrawn || 0);
}

export function validateOpenShift(input: {
  openingText: string;
  noteText: string;
  suggested: number | null;
}): {
  isValid: boolean;
  errors: Partial<Record<'opening' | 'note', string>>;
  params?: { p_opening_cash: number; p_note: string | null };
} {
  const errors: Partial<Record<'opening' | 'note', string>> = {};
  const note = (input.noteText || '').trim();

  if (!(input.openingText || '').trim()) {
    errors.opening = 'Modal awal wajib diisi (isi 0 jika laci kosong)';
  }
  const opening = parseRupiahInput(input.openingText);

  if (!errors.opening && input.suggested !== null && opening !== input.suggested && !note) {
    errors.note = 'Modal awal berbeda dari sisa kas sif sebelumnya. Isi catatan penyebabnya.';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    params: isValid ? { p_opening_cash: opening, p_note: note || null } : undefined,
  };
}

export function calculateShiftExpectedCash(input: {
  openingCash: number;
  cashIn: number;
  cashRefunds: number;
  cashExpenses: number;
}): number {
  return input.openingCash + input.cashIn - input.cashRefunds - input.cashExpenses;
}

export function validateCloseShift(input: {
  countedText: string;
  withdrawnText: string;
  noteText: string;
  expectedCash: number;
}): {
  isValid: boolean;
  difference: number | null;
  errors: Partial<Record<'counted' | 'withdrawn' | 'note', string>>;
  params?: { p_counted: number; p_withdrawn: number; p_note: string | null };
} {
  const errors: Partial<Record<'counted' | 'withdrawn' | 'note', string>> = {};
  const note = (input.noteText || '').trim();

  if (!(input.countedText || '').trim()) {
    errors.counted = 'Uang fisik di laci wajib dihitung dan diisi';
    return { isValid: false, difference: null, errors };
  }

  const counted = parseRupiahInput(input.countedText);
  const withdrawn = parseRupiahInput(input.withdrawnText);
  const difference = counted - input.expectedCash;

  if (withdrawn > counted) {
    errors.withdrawn = 'Uang yang disetor tidak boleh melebihi uang di laci';
  }
  if (difference !== 0 && !note) {
    errors.note = 'Ada selisih kas. Isi catatan penyebab selisih.';
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    difference,
    errors,
    params: isValid ? { p_counted: counted, p_withdrawn: withdrawn, p_note: note || null } : undefined,
  };
}

export function canCloseShift(
  shift: { opened_by: string | null },
  user: { id: string; role: string } | null | undefined
): boolean {
  if (!user) return false;
  return user.role === 'Admin' || shift.opened_by === user.id;
}

/** POS hanya dapat dipakai saat ada sif aktif. */
export function isPosLocked(openShift: { id: string; status: string } | null | undefined): boolean {
  return !openShift || openShift.status !== 'Open';
}
