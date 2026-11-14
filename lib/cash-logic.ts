/**
 * FANTASI COFFEE - KAS HARIAN (CASH LOGIC)
 * - Pengeluaran harian dicatat Kasir/Admin dan (default) dibayar dari kas laci,
 *   yaitu dari uang penjualan hari itu.
 * - Rekap kas: penjualan tunai yang sudah lunas − pengeluaran dari kas
 *   = uang yang seharusnya ada di laci.
 * Semua "hari" memakai zona waktu bisnis (lib/timezone.ts) agar sama dengan database.
 */

import { getRevenueTimestamp, isRecognizedSale } from './order-logic';
import { parseRupiahInput } from './inventory-logic';
import { ExpenseCategory, validateExpenseInput } from './expense-logic';
import { getBusinessDateString, toBusinessDateString } from './timezone';


export interface CashRecapOrder {
  payment_method: string;
  payment_status: string;
  order_status: string;
  total_amount: number;
  created_at: string;
  /** Waktu pembayaran diterima; penjualan diakui pada hari ini (PRD 21). */
  paid_at?: string | null;
}

export interface CashRecapExpense {
  amount: number;
  expense_date: string;
  paid_from_cash: boolean;
}

export interface DailyCashRecap {
  cashSales: number;
  cashOrderCount: number;
  qrisSales: number;
  qrisOrderCount: number;
  debitSales: number;
  debitOrderCount: number;
  totalSales: number;
  cashExpenses: number;
  otherExpenses: number;
  /** Penjualan tunai − pengeluaran dari kas. */
  expectedCash: number;
  awaitingPaymentCount: number;
}

export function calculateDailyCashRecap(
  orders: CashRecapOrder[],
  expenses: CashRecapExpense[],
  businessDate: string
): DailyCashRecap {
  // Penjualan diakui pada hari uangnya diterima (sama dengan sif & laporan);
  // order yang menunggu pembayaran dihitung menurut hari order dibuat.
  const todaysOrders = (orders || []).filter((o) => toBusinessDateString(o.created_at) === businessDate);
  const paid = (orders || []).filter(
    (o) => isRecognizedSale(o) && toBusinessDateString(getRevenueTimestamp(o)) === businessDate
  );
  const cash = paid.filter((o) => o.payment_method === 'Tunai');
  const qris = paid.filter((o) => o.payment_method === 'QRIS');
  const debit = paid.filter((o) => o.payment_method === 'Debit');
  const sum = (list: { total_amount: number }[]) => list.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const todaysExpenses = (expenses || []).filter((e) => (e.expense_date || '').slice(0, 10) === businessDate);
  const cashExpenses = todaysExpenses
    .filter((e) => e.paid_from_cash)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const otherExpenses = todaysExpenses
    .filter((e) => !e.paid_from_cash)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const cashSales = sum(cash);
  const qrisSales = sum(qris);
  const debitSales = sum(debit);

  return {
    cashSales,
    cashOrderCount: cash.length,
    qrisSales,
    qrisOrderCount: qris.length,
    debitSales,
    debitOrderCount: debit.length,
    totalSales: cashSales + qrisSales + debitSales,
    cashExpenses,
    otherExpenses,
    expectedCash: cashSales - cashExpenses,
    awaitingPaymentCount: todaysOrders.filter(
      (o) => o.order_status !== 'Cancelled' && o.payment_status === 'Pending'
    ).length,
  };
}

/** Membandingkan uang fisik di laci dengan hitungan sistem. */
export function calculateCashDifference(
  expectedCash: number,
  countedText: string
): { counted: number; difference: number; status: 'Pas' | 'Lebih' | 'Kurang' } | null {
  if (!(countedText || '').trim()) return null;
  const counted = parseRupiahInput(countedText);
  const difference = counted - expectedCash;
  return {
    counted,
    difference,
    status: difference === 0 ? 'Pas' : difference > 0 ? 'Lebih' : 'Kurang',
  };
}

export interface CashExpenseInput {
  description: string;
  category: ExpenseCategory;
  amountText: string;
}

/** Validasi pengeluaran harian dari kas laci (tanggal selalu hari ini, zona waktu bisnis). */
export function validateCashExpense(
  input: CashExpenseInput,
  userId: string,
  now: Date = new Date()
): {
  isValid: boolean;
  errors: Record<string, string>;
  payload?: {
    description: string;
    category: ExpenseCategory;
    amount: number;
    expense_date: string;
    created_by: string;
    paid_from_cash: true;
  };
} {
  const amount = parseRupiahInput(input.amountText);
  const expense_date = getBusinessDateString(now);
  const validation = validateExpenseInput({
    description: input.description,
    category: input.category,
    amount,
    expense_date,
  });

  if (!validation.isValid) {
    return { isValid: false, errors: validation.errors };
  }

  return {
    isValid: true,
    errors: {},
    payload: {
      description: input.description.trim(),
      category: input.category,
      amount,
      expense_date,
      created_by: userId,
      paid_from_cash: true,
    },
  };
}
