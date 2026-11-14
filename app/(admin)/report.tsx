import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { LoadingState, ErrorState } from "../../components/States";
import { formatRupiah } from "../../lib/formatters";
import { useResponsive } from "../../hooks/useResponsive";
import { ExpensePeriodFilter } from "../../lib/expense-logic";
import {
  SalesSummaryRpc,
  getReportDateRange,
  mapSalesSummary,
} from "../../lib/report-logic";

export default function ReportScreen() {
  const { openSidebar } = useAdminSidebar();
  const { isTablet } = useResponsive();

  const [activeTab, setActiveTab] = useState<"sales" | "financial">("sales");
  const [periodFilter, setPeriodFilter] = useState<ExpensePeriodFilter>("Bulan Ini");

  // Ringkasan dihitung database per periode (tidak terpotong batas 1000 baris).
  const [summary, setSummary] = useState<SalesSummaryRpc | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Fetch report summary for the selected period (zona waktu bisnis)
  const fetchReportData = useCallback(async () => {
    try {
      setErrorMessage("");
      const { from, to } = getReportDateRange(periodFilter);
      const { data, error } = await supabase.rpc("get_sales_summary", { p_from: from, p_to: to });
      if (error) throw error;
      setSummary((data as SalesSummaryRpc | null) ?? null);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memuat data laporan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodFilter]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReportData();
  };

  const { salesReport, financialReport } = mapSalesSummary(summary);

  const maxSoldQty =
    salesReport.topProducts.length > 0
      ? salesReport.topProducts[0].quantitySold
      : 1;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Laporan & Finansial"
        subtitle="Analisis Penjualan & Laba Bersih Kedai"
        onOpenSidebar={openSidebar}
      />

      <ScrollView
        contentContainerStyle={{
          padding: isTablet ? 24 : 16,
          paddingBottom: 110,
          maxWidth: 1000,
          alignSelf: "center",
          width: "100%",
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Tab Switcher: Sales vs Financial */}
        <View className="flex-row bg-surface rounded-card p-1 border border-line mb-4 shadow-sm">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tampilkan laporan penjualan"
            accessibilityState={{ selected: activeTab === "sales" }}
            onPress={() => setActiveTab("sales")}
            className={`flex-1 py-2.5 rounded-chip items-center justify-center flex-row ${
              activeTab === "sales" ? "bg-primary" : "bg-transparent"
            }`}
          >
            <Ionicons
              name="stats-chart"
              size={16}
              color={activeTab === "sales" ? "#FFFFFF" : "#6B7280"}
            />
            <Text
              className={`font-heading-semibold text-sm ml-1.5 ${
                activeTab === "sales" ? "text-white" : "text-muted"
              }`}
            >
              Laporan Penjualan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tampilkan laporan keuangan"
            accessibilityState={{ selected: activeTab === "financial" }}
            onPress={() => setActiveTab("financial")}
            className={`flex-1 py-2.5 rounded-chip items-center justify-center flex-row ${
              activeTab === "financial" ? "bg-primary" : "bg-transparent"
            }`}
          >
            <Ionicons
              name="cash-outline"
              size={16}
              color={activeTab === "financial" ? "#FFFFFF" : "#6B7280"}
            />
            <Text
              className={`font-heading-semibold text-sm ml-1.5 ${
                activeTab === "financial" ? "text-white" : "text-muted"
              }`}
            >
              Laporan Keuangan
            </Text>
          </TouchableOpacity>
        </View>

        {/* Period Filter Buttons */}
        <View className="flex-row gap-1.5 mb-4">
          {(["Hari Ini", "7 Hari Terakhir", "Bulan Ini", "Semua"] as const).map(
            (p) => {
              const active = periodFilter === p;
              return (
                <TouchableOpacity
                  key={p}
                  accessibilityRole="button"
                  accessibilityLabel={`Periode laporan: ${p}`}
                  accessibilityState={{ selected: periodFilter === p }}
                  onPress={() => setPeriodFilter(p)}
                  className={`flex-1 py-2 rounded-chip items-center justify-center border ${
                    active ? "bg-primary border-primary" : "bg-surface border-line"
                  }`}
                >
                  <Text
                    className={`font-body-medium text-xs ${
                      active ? "text-white" : "text-text"
                    }`}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </View>

        {loading ? (
          <LoadingState label="Menghitung rekapitulasi data kedai..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchReportData} />
        ) : activeTab === "sales" ? (
          /* ==================================================================== */
          /* TAB 1: LAPORAN PENJUALAN (SALES REPORT)                               */
          /* ==================================================================== */
          <View>
            {/* PRD Section 22 Rule Invariant Banner */}
            <View className="bg-primary/10 rounded-card p-3 border border-primary/20 mb-4 flex-row items-center">
              <Ionicons name="information-circle" size={18} color="#D1001F" />
              <Text className="font-body text-primary text-xs ml-2 flex-1 leading-4">
                Omzet dihitung dari pesanan yang sudah dibayar (lunas) dan tidak dibatalkan, termasuk yang masih diproses.
              </Text>
            </View>

            {/* 4 Summary Cards Grid */}
            <View className={isTablet ? "flex-row flex-wrap justify-between gap-3 mb-4" : "gap-3 mb-4"}>
              {/* Card 1: Omzet Penjualan */}
              <View
                className="bg-surface rounded-card p-4 border border-line shadow-sm"
                style={isTablet ? { width: "48%" } : undefined}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-body text-muted text-xs">Omzet Penjualan</Text>
                  <View className="w-8 h-8 rounded-full bg-success-soft items-center justify-center">
                    <Ionicons name="trending-up" size={16} color="#166534" />
                  </View>
                </View>
                <Text className="font-heading text-text text-2xl">
                  {formatRupiah(salesReport.totalRevenue)}
                </Text>
                <Text className="font-body text-success text-xs mt-1">
                  Periode {periodFilter}
                </Text>
              </View>

              {/* Card 2: Pesanan Lunas */}
              <View
                className="bg-surface rounded-card p-4 border border-line shadow-sm"
                style={isTablet ? { width: "48%" } : undefined}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-body text-muted text-xs">Pesanan Lunas</Text>
                  <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
                    <Ionicons name="receipt-outline" size={16} color="#D1001F" />
                  </View>
                </View>
                <Text className="font-heading text-text text-2xl">
                  {salesReport.totalPaidOrders} Order
                </Text>
                <Text className="font-body text-muted text-xs mt-1">
                  Sudah dibayar &amp; tidak dibatalkan
                </Text>
              </View>

              {/* Card 3: Total Item Terjual */}
              <View
                className="bg-surface rounded-card p-4 border border-line shadow-sm"
                style={isTablet ? { width: "48%" } : undefined}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-body text-muted text-xs">Item Terjual</Text>
                  <View className="w-8 h-8 rounded-full bg-amber-500/10 items-center justify-center">
                    <Ionicons name="cafe-outline" size={16} color="#B45309" />
                  </View>
                </View>
                <Text className="font-heading text-text text-2xl">
                  {salesReport.totalItemsSold} Pcs
                </Text>
                <Text className="font-body text-muted text-xs mt-1">
                  Total cup & produk fisik
                </Text>
              </View>

              {/* Card 4: Rata-Rata Order (AOV) */}
              <View
                className="bg-surface rounded-card p-4 border border-line shadow-sm"
                style={isTablet ? { width: "48%" } : undefined}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-body text-muted text-xs">Rata-Rata per Nota (AOV)</Text>
                  <View className="w-8 h-8 rounded-full bg-blue-500/10 items-center justify-center">
                    <Ionicons name="analytics-outline" size={16} color="#1D4ED8" />
                  </View>
                </View>
                <Text className="font-heading text-text text-2xl">
                  {formatRupiah(salesReport.averageOrderValue)}
                </Text>
                <Text className="font-body text-muted text-xs mt-1">
                  Average Order Value
                </Text>
              </View>
            </View>

            {/* Top 5 Best Selling Products Section */}
            <View className="bg-surface rounded-card p-4 border border-line shadow-sm">
              <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-line">
                <View className="flex-row items-center">
                  <Ionicons name="ribbon-outline" size={18} color="#D1001F" />
                  <Text className="font-heading-semibold text-text text-base ml-2">
                    Top 5 Menu Terlaris
                  </Text>
                </View>
                <Text className="font-body text-muted text-xs">
                  Berdasarkan volume terjual
                </Text>
              </View>

              {salesReport.topProducts.length === 0 ? (
                <Text className="font-body text-muted text-sm text-center py-4">
                  Belum ada produk terjual pada periode ini.
                </Text>
              ) : (
                salesReport.topProducts.map((p, idx) => {
                  const percentOfTop = Math.round((p.quantitySold / maxSoldQty) * 100);

                  return (
                    <View key={p.productId || idx} className="mb-3.5">
                      <View className="flex-row justify-between items-center mb-1">
                        <View className="flex-row items-center flex-1 mr-2">
                          <View
                            className={`w-5 h-5 rounded-full items-center justify-center mr-2 ${
                              idx === 0
                                ? "bg-amber-500"
                                : idx === 1
                                ? "bg-slate-400"
                                : idx === 2
                                ? "bg-amber-700"
                                : "bg-line"
                            }`}
                          >
                            <Text className="font-heading text-white text-xs leading-none">
                              {idx + 1}
                            </Text>
                          </View>
                          <Text
                            className="font-heading-semibold text-text text-sm flex-1"
                            numberOfLines={1}
                          >
                            {p.productName}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="font-heading-semibold text-text text-xs">
                            {p.quantitySold} Pcs
                          </Text>
                          <Text className="font-body text-muted text-xs">
                            {formatRupiah(p.totalRevenue)}
                          </Text>
                        </View>
                      </View>

                      {/* Visual Progress Bar */}
                      <View className="w-full h-2 rounded-full bg-background overflow-hidden border border-line">
                        <View
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${percentOfTop}%` }}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        ) : (
          /* ==================================================================== */
          /* TAB 2: LAPORAN KEUANGAN (FINANCIAL REPORT)                            */
          /* ==================================================================== */
          <View>
            {/* Net Result Hero Card */}
            <View
              className={`rounded-card p-5 mb-4 border shadow-sm ${
                financialReport.netProfit >= 0
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <View className="flex-row justify-between items-start mb-2">
                <View>
                  <Text
                    className={`font-body text-xs ${
                      financialReport.netProfit >= 0
                        ? "text-emerald-800"
                        : "text-red-800"
                    }`}
                  >
                    Laba Bersih Kedai (Net Result)
                  </Text>
                  <Text
                    className={`font-heading text-3xl mt-1 ${
                      financialReport.netProfit >= 0
                        ? "text-emerald-900"
                        : "text-red-900"
                    }`}
                  >
                    {financialReport.netProfit >= 0 ? "+ " : "- "}
                    {formatRupiah(Math.abs(financialReport.netProfit))}
                  </Text>
                </View>

                <View
                  className={`px-3 py-1 rounded-full border ${
                    financialReport.netProfit >= 0
                      ? "bg-emerald-100 border-emerald-300"
                      : "bg-red-100 border-red-300"
                  }`}
                >
                  <Text
                    className={`font-heading-semibold text-xs ${
                      financialReport.netProfit >= 0
                        ? "text-emerald-800"
                        : "text-red-800"
                    }`}
                  >
                    {financialReport.netProfit >= 0 ? "Surplus " : "Defisit "}
                    {financialReport.profitMargin}%
                  </Text>
                </View>
              </View>

              <Text
                className={`font-body text-xs mt-1 leading-4 ${
                  financialReport.netProfit >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                Rumus PRD Section 22: Laba Bersih = Total Penjualan ({formatRupiah(financialReport.totalSales)}) dikurangi Total Biaya ({formatRupiah(financialReport.totalExpenses)}).
              </Text>
            </View>

            {/* Income vs Expense 2 Columns */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1 bg-surface rounded-card p-4 border border-line shadow-sm">
                <View className="flex-row items-center mb-1">
                  <View className="w-2.5 h-2.5 rounded-full bg-success mr-1.5" />
                  <Text className="font-body text-muted text-xs">Total Penjualan</Text>
                </View>
                <Text className="font-heading text-success text-xl">
                  {formatRupiah(financialReport.totalSales)}
                </Text>
              </View>

              <View className="flex-1 bg-surface rounded-card p-4 border border-line shadow-sm">
                <View className="flex-row items-center mb-1">
                  <View className="w-2.5 h-2.5 rounded-full bg-danger mr-1.5" />
                  <Text className="font-body text-muted text-xs">Total Biaya Operasional</Text>
                </View>
                <Text className="font-heading text-danger text-xl">
                  {formatRupiah(financialReport.totalExpenses)}
                </Text>
              </View>
            </View>

            {/* Alokasi Biaya Pengeluaran per Kategori */}
            <View className="bg-surface rounded-card p-4 border border-line shadow-sm">
              <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-line">
                <View className="flex-row items-center">
                  <Ionicons name="pie-chart-outline" size={18} color="#D1001F" />
                  <Text className="font-heading-semibold text-text text-base ml-2">
                    Alokasi Biaya per Kategori
                  </Text>
                </View>
                <Text className="font-body text-muted text-xs">
                  {periodFilter}
                </Text>
              </View>

              {financialReport.categoryBreakdown.map((catItem) => {
                return (
                  <View key={catItem.category} className="mb-3.5">
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="font-heading-semibold text-text text-sm">
                        {catItem.label}
                      </Text>
                      <View className="items-end">
                        <Text className="font-heading-semibold text-text text-xs">
                          {formatRupiah(catItem.totalAmount)}
                        </Text>
                        <Text className="font-body text-muted text-xs">
                          {catItem.percentage}% dari total biaya
                        </Text>
                      </View>
                    </View>

                    {/* Progress Bar per Kategori */}
                    <View className="w-full h-2 rounded-full bg-background overflow-hidden border border-line">
                      <View
                        className="h-full bg-primary/70 rounded-full"
                        style={{ width: `${Math.min(catItem.percentage, 100)}%` }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
