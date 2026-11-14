/**
 * Logika Laporan Penjualan & Keuangan Kedai Kopi (Report Logic) - Iterasi 3.8 & 3.9
 * Menghitung Omzet Penjualan (order lunas & tidak dibatalkan), Produk Terlaris, dan Laba Bersih
 * Sesuai PRD Section 22: Net Result = Total Sales - Total Expense
 */

import { isRecognizedSale } from "./order-logic";
import { addBusinessDays, getBusinessDateString } from "./timezone";
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  getExpenseCategoryMeta,
  ExpensePeriodFilter,
} from "./expense-logic";

export interface OrderReportItem {
  id?: string;
  order_id: string;
  product_id?: string | null;
  product_name: string;
  unit_price?: number;
  quantity: number;
  subtotal?: number;
}

export interface OrderReportHeader {
  id: string;
  total_amount: number;
  order_status?: string;
  payment_status: string;
  created_at: string;
}

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

/**
 * Filter pesanan berdasarkan rentang periode (Hari Ini, 7 Hari Terakhir, Bulan Ini, Semua)
 */
export function filterOrdersByPeriod<T extends { created_at: string }>(
  orders: T[],
  period: ExpensePeriodFilter = "Semua",
  currentDate: Date = new Date()
): T[] {
  if (period === "Semua" || !orders) return orders || [];

  const now = new Date(currentDate);
  const todayStr = now.toISOString().split("T")[0];

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const currentYearMonth = todayStr.substring(0, 7); // YYYY-MM

  return orders.filter((ord) => {
    const orderDate = ord.created_at.split("T")[0];
    if (period === "Hari Ini") {
      return orderDate === todayStr;
    }
    if (period === "7 Hari Terakhir") {
      return orderDate >= sevenDaysAgoStr && orderDate <= todayStr;
    }
    if (period === "Bulan Ini") {
      return orderDate.startsWith(currentYearMonth);
    }
    return true;
  });
}

/**
 * Menghitung Laporan Penjualan (Sales Report)
 * Sesuai PRD Section 21 (revisi): omzet diakui dari pesanan yang sudah LUNAS dan
 * tidak dibatalkan, sehingga order yang lupa ditandai Completed tetap tercatat.
 */
export function calculateSalesReport(
  orders: OrderReportHeader[],
  orderItems: OrderReportItem[] = []
): SalesReportSummary {
  // 1. Filter pesanan yang diakui sebagai penjualan
  const paidOrders = (orders || []).filter(isRecognizedSale);

  const paidOrderIds = new Set(paidOrders.map((o) => o.id));

  // 2. Total Omzet
  const totalRevenue = paidOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0
  );

  const totalPaidOrders = paidOrders.length;
  const averageOrderValue =
    totalPaidOrders > 0 ? Math.round(totalRevenue / totalPaidOrders) : 0;

  // 3. Filter order_items yang berasal dari order yang diakui
  const completedItems = (orderItems || []).filter((item) =>
    paidOrderIds.has(item.order_id)
  );

  const totalItemsSold = completedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  // 4. Agregasi Top 5 Produk Terlaris
  const productAggMap = new Map<
    string,
    { productId: string; productName: string; quantitySold: number; totalRevenue: number }
  >();

  completedItems.forEach((item) => {
    const key = item.product_id || item.product_name;
    const existing = productAggMap.get(key) || {
      productId: item.product_id || key,
      productName: item.product_name,
      quantitySold: 0,
      totalRevenue: 0,
    };

    const itemQty = Number(item.quantity) || 0;
    const itemSubtotal =
      item.subtotal !== undefined
        ? Number(item.subtotal)
        : itemQty * (Number(item.unit_price) || 0);

    existing.quantitySold += itemQty;
    existing.totalRevenue += itemSubtotal;
    productAggMap.set(key, existing);
  });

  const sortedProducts = Array.from(productAggMap.values()).sort(
    (a, b) => b.quantitySold - a.quantitySold || b.totalRevenue - a.totalRevenue
  );

  const topProducts = sortedProducts.slice(0, 5);

  return {
    totalRevenue,
    totalPaidOrders,
    totalItemsSold,
    averageOrderValue,
    topProducts,
  };
}

/**
 * Menghitung Laporan Keuangan (Financial Report)
 * Sesuai PRD Section 22:
 * Net Result = Total Sales - Total Expense
 */
export function calculateFinancialReport(
  orders: OrderReportHeader[],
  expenses: { category: string; amount: number }[]
): FinancialReportSummary {
  // 1. Ambil total penjualan dari order lunas & tidak dibatalkan
  const salesSummary = calculateSalesReport(orders, []);
  const totalSales = salesSummary.totalRevenue;

  // 2. Hitung total pengeluaran
  const totalExpenses = (expenses || []).reduce(
    (sum, exp) => sum + (Number(exp.amount) || 0),
    0
  );

  // 3. Laba Bersih & Margin Laba
  const netProfit = totalSales - totalExpenses;
  const profitMargin =
    totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

  // 4. Breakdown pengeluaran per kategori
  const catAmountMap: Record<ExpenseCategory, number> = {
    "Raw Material": 0,
    Operational: 0,
    Equipment: 0,
    Other: 0,
  };

  (expenses || []).forEach((exp) => {
    const cat = exp.category as ExpenseCategory;
    if (catAmountMap[cat] !== undefined) {
      catAmountMap[cat] += Number(exp.amount) || 0;
    } else {
      catAmountMap["Other"] += Number(exp.amount) || 0;
    }
  });

  const categoryBreakdown: CategoryExpenseBreakdown[] = EXPENSE_CATEGORIES.map(
    (cat) => {
      const amount = catAmountMap[cat] || 0;
      const percentage =
        totalExpenses > 0 ? Number(((amount / totalExpenses) * 100).toFixed(2)) : 0;
      const meta = getExpenseCategoryMeta(cat);
      return {
        category: cat,
        label: meta.label,
        totalAmount: amount,
        percentage,
      };
    }
  );

  return {
    totalSales,
    totalExpenses,
    netProfit,
    profitMargin,
    categoryBreakdown,
  };
}


// ----------------------------------------------------------------------------
// Laporan dari database (audit iterasi 3)
// Agregasi dilakukan RPC get_sales_summary per periode (zona waktu bisnis), sehingga
// laporan tidak terpotong batas 1000 baris PostgREST.
// ----------------------------------------------------------------------------

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
