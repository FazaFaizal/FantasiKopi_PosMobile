/**
 * Logika Laporan Penjualan & Keuangan Kedai Kopi (Report Logic) - Iterasi 3.8 & 3.9
 * Omzet (order lunas & tidak dibatalkan), produk terlaris, dan pengeluaran dihitung
 * RPC get_sales_summary per periode (zona waktu bisnis), sehingga laporan tidak
 * terpotong batas 1000 baris PostgREST. Modul ini memetakan hasilnya untuk layar.
 * Sesuai PRD Section 22: Net Result = Total Sales - Total Expense
 */

import { addBusinessDays, getBusinessDateString } from "./timezone";
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  getExpenseCategoryMeta,
  ExpensePeriodFilter,
} from "./expense-logic";

export interface TopProductSummary {
  productId: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface SalesReportSummary {
  totalRevenue: number;
  /** Jumlah order yang diakui sebagai penjualan (lunas & tidak dibatalkan). */
  totalPaidOrders: number;
  totalItemsSold: number;
  averageOrderValue: number;
  topProducts: TopProductSummary[];
}

export interface CategoryExpenseBreakdown {
  category: ExpenseCategory;
  label: string;
  totalAmount: number;
  percentage: number;
}

export interface FinancialReportSummary {
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  categoryBreakdown: CategoryExpenseBreakdown[];
}

/** Rentang tanggal bisnis untuk filter periode laporan (null = semua data). */
export function getReportDateRange(
  period: ExpensePeriodFilter,
  now: Date = new Date()
): { from: string | null; to: string | null } {
  const today = getBusinessDateString(now);
  switch (period) {
    case "Hari Ini":
      return { from: today, to: today };
    case "7 Hari Terakhir":
      return { from: addBusinessDays(today, -7), to: today };
    case "Bulan Ini":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return { from: null, to: null };
  }
}

/** Bentuk hasil RPC get_sales_summary. */
export interface SalesSummaryRpc {
  total_revenue: number | string;
  paid_orders: number | string;
  items_sold: number | string;
  top_products: {
    product_id: string | null;
    product_name: string;
    quantity_sold: number | string;
    total_revenue: number | string;
  }[] | null;
  total_expenses: number | string;
  expenses_by_category: { category: string; amount: number | string }[] | null;
}

/** Ubah hasil RPC menjadi ringkasan penjualan & keuangan yang dipakai layar laporan. */
export function mapSalesSummary(rpc: SalesSummaryRpc | null | undefined): {
  salesReport: SalesReportSummary;
  financialReport: FinancialReportSummary;
} {
  const n = (v: unknown) => Number(v) || 0;
  const totalRevenue = n(rpc?.total_revenue);
  const totalPaidOrders = n(rpc?.paid_orders);
  const totalExpenses = n(rpc?.total_expenses);

  const salesReport: SalesReportSummary = {
    totalRevenue,
    totalPaidOrders,
    totalItemsSold: n(rpc?.items_sold),
    averageOrderValue: totalPaidOrders > 0 ? Math.round(totalRevenue / totalPaidOrders) : 0,
    topProducts: (rpc?.top_products || []).map((p) => ({
      productId: p.product_id || p.product_name,
      productName: p.product_name,
      quantitySold: n(p.quantity_sold),
      totalRevenue: n(p.total_revenue),
    })),
  };

  const byCategory: Record<string, number> = {};
  for (const row of rpc?.expenses_by_category || []) {
    const cat = (EXPENSE_CATEGORIES as string[]).includes(row.category) ? row.category : "Other";
    byCategory[cat] = (byCategory[cat] || 0) + n(row.amount);
  }

  const netProfit = totalRevenue - totalExpenses;
  const financialReport: FinancialReportSummary = {
    totalSales: totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0,
    categoryBreakdown: EXPENSE_CATEGORIES.map((cat) => {
      const amount = byCategory[cat] || 0;
      return {
        category: cat,
        label: getExpenseCategoryMeta(cat).label,
        totalAmount: amount,
        percentage: totalExpenses > 0 ? Number(((amount / totalExpenses) * 100).toFixed(2)) : 0,
      };
    }),
  };

  return { salesReport, financialReport };
}
