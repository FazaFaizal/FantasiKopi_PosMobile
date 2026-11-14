/**
 * FANTASI COFFEE - ADMIN DASHBOARD AGGREGATION LOGIC
 * Mengelola agregasi metrik penjualan hari ini, inventaris bahan baku,
 * performa produk terlaris, dan laba bersih secara real-time.
 * Sesuai PRD Iterasi 4 (Section 27).
 */

import { OrderStatus, PaymentMethod, PaymentStatus, isPaymentSettled, isRecognizedSale } from './order-logic';
import { getBusinessDateString, toBusinessDateString } from './timezone';

export interface DashboardOrderItem {
  product_name: string;
  quantity: number;
  subtotal: number;
}

export interface DashboardOrder {
  id: string;
  order_number: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  customer_name?: string | null;
  payment_method?: PaymentMethod;
  created_at: string;
  items?: DashboardOrderItem[];
}

export interface DashboardExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
}

export interface DashboardInventoryItem {
  id: string;
  name: string;
  current_stock: number;
  min_stock: number;
  is_deleted?: boolean;
  /** Bahan nonaktif tidak dihitung dalam status stok. */
  is_active?: boolean;
}

export interface TodayDashboardMetrics {
  todayOrderCount: number;
  /** Order hari ini yang diakui sebagai penjualan (lunas & tidak dibatalkan). */
  todayPaidOrderCount: number;
  /** Order hari ini yang masih berjalan (Pending / Processing / Ready). */
  todayInProgressCount: number;
  /** Order hari ini yang belum dibatalkan dan pembayarannya belum lunas. */
  todayAwaitingPaymentCount: number;
  todaySales: number;
  todayExpenses: number;
  todayNetResult: number;
  topProductToday: {
    name: string;
    quantity: number;
    sales: number;
  } | null;
  safeStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

/**
 * Hari dihitung menurut zona waktu bisnis (lib/timezone.ts), bukan zona waktu perangkat,
 * agar sama dengan laporan, kas harian, dan database.
 */
function isSameDay(isoString: string, targetDate: Date): boolean {
  return toBusinessDateString(isoString) === getBusinessDateString(targetDate);
}

/**
 * Menghitung metrik agregasi harian untuk Admin Dashboard:
 * 1. Jumlah order hari ini (semua status)
 * 2. Total omzet penjualan hari ini (order lunas & tidak dibatalkan, PRD Section 21 & 22 revisi)
 *    beserta jumlah order yang masih berjalan dan yang menunggu pembayaran
 * 3. Produk terlaris hari ini berdasarkan item order yang diakui sebagai penjualan
 * 4. Pengeluaran hari ini & Net Result (Sales - Expense)
 * 5. Status stok bahan baku aktif (Safe, Low Stock, Out of Stock)
 */
export function calculateTodayDashboardMetrics(
  orders: DashboardOrder[],
  expenses: DashboardExpense[],
  inventory: DashboardInventoryItem[],
  todayDate: Date = new Date()
): TodayDashboardMetrics {
  const todayYMD = getBusinessDateString(todayDate);

  // 1. Filter Order Hari Ini
  const todayOrders = orders.filter((o) => isSameDay(o.created_at, todayDate));
  const todayOrderCount = todayOrders.length;

  // 2. Filter Order yang diakui sebagai penjualan hari ini (lunas & tidak dibatalkan)
  const todayPaidOrders = todayOrders.filter(isRecognizedSale);
  const todayPaidOrderCount = todayPaidOrders.length;
  const todaySales = todayPaidOrders.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  );
  const todayInProgressCount = todayOrders.filter(
    (o) => o.order_status === 'Pending' || o.order_status === 'Processing' || o.order_status === 'Ready'
  ).length;
  const todayAwaitingPaymentCount = todayOrders.filter(
    (o) => o.order_status !== 'Cancelled' && !isPaymentSettled(o.payment_status)
  ).length;

  // 3. Hitung Produk Terlaris Hari Ini dari order yang diakui sebagai penjualan
  const productAggMap = new Map<string, { quantity: number; sales: number }>();
  for (const order of todayPaidOrders) {
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        const existing = productAggMap.get(item.product_name) || {
          quantity: 0,
          sales: 0,
        };
        productAggMap.set(item.product_name, {
          quantity: existing.quantity + Number(item.quantity || 0),
          sales: existing.sales + Number(item.subtotal || 0),
        });
      }
    }
  }

  let topProductToday: { name: string; quantity: number; sales: number } | null = null;
  let maxQty = 0;
  for (const [name, stats] of productAggMap.entries()) {
    if (stats.quantity > maxQty) {
      maxQty = stats.quantity;
      topProductToday = {
        name,
        quantity: stats.quantity,
        sales: stats.sales,
      };
    }
  }

  // 4. Hitung Pengeluaran Hari Ini & Net Result
  const todayExpenses = expenses
    .filter((e) => {
      // expense_date bisa format YYYY-MM-DD atau ISO
      if (e.expense_date.startsWith(todayYMD)) return true;
      return isSameDay(e.expense_date, todayDate);
    })
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const todayNetResult = todaySales - todayExpenses;

  // 5. Agregasi Stok Bahan Baku (abaikan bahan nonaktif / data soft delete lama)
  const activeInventory = inventory.filter((item) => !item.is_deleted && item.is_active !== false);
  let safeStockCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of activeInventory) {
    const stock = Number(item.current_stock || 0);
    const minStock = Number(item.min_stock || 0);

    if (stock <= 0) {
      outOfStockCount++;
    } else if (stock <= minStock) {
      lowStockCount++;
    } else {
      safeStockCount++;
    }
  }

  return {
    todayOrderCount,
    todayPaidOrderCount,
    todayInProgressCount,
    todayAwaitingPaymentCount,
    todaySales,
    todayExpenses,
    todayNetResult,
    topProductToday,
    safeStockCount,
    lowStockCount,
    outOfStockCount,
  };
}

/**
 * Mengambil N pesanan terbaru untuk widget 'Recent Orders' di dashboard.
 */
export function getRecentOrders(
  orders: DashboardOrder[],
  limit: number = 5
): DashboardOrder[] {
  return [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

