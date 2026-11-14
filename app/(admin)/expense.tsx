import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { Expense } from "../../types/database";
import { useAuth } from "../../lib/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { LoadingState, EmptyState, ErrorState } from "../../components/States";
import { formatRupiah } from "../../lib/formatters";
import { useResponsive } from "../../hooks/useResponsive";
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  ExpensePeriodFilter,
  getExpenseCategoryMeta,
  validateExpenseInput,
  filterExpenses,
  calculateTotalExpenses,
} from "../../lib/expense-logic";
import { getBusinessDateString } from "../../lib/timezone";

export default function ExpenseScreen() {
  const { openSidebar } = useAdminSidebar();
  const { user } = useAuth();
  const { isTablet } = useResponsive();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Filter States
  const [periodFilter, setPeriodFilter] = useState<ExpensePeriodFilter>("Bulan Ini");
  const [categoryFilter, setCategoryFilter] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal Form States
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Raw Material");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    getBusinessDateString()
  );
  const [paidFromCash, setPaidFromCash] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fetch Expenses from Supabase
  const fetchExpenses = useCallback(async () => {
    try {
      setErrorMessage("");
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExpenses((data as Expense[]) || []);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memuat data pengeluaran.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchExpenses();
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingExpense(null);
    setDescription("");
    setCategory("Raw Material");
    setAmount("");
    setExpenseDate(getBusinessDateString());
    setPaidFromCash(true);
    setFormErrors({});
    setModalVisible(true);
  };

  // Open Edit Modal
  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setDescription(exp.description);
    setCategory(exp.category);
    setAmount(String(exp.amount));
    setExpenseDate(exp.expense_date);
    setPaidFromCash(exp.paid_from_cash);
    setFormErrors({});
    setModalVisible(true);
  };

  // Save Expense (Insert / Update)
  const handleSaveExpense = async () => {
    const numAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

    const validation = validateExpenseInput({
      description,
      category,
      amount: numAmount,
      expense_date: expenseDate,
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setSaving(true);
    try {
      if (editingExpense) {
        // UPDATE
        const { error } = await supabase
          .from("expenses")
          .update({
            description: description.trim(),
            category,
            amount: numAmount,
            expense_date: expenseDate,
            paid_from_cash: paidFromCash,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingExpense.id);

        if (error) throw error;
        Alert.alert("Sukses", "Pengeluaran berhasil diperbarui.");
      } else {
        // INSERT
        const { error } = await supabase.from("expenses").insert({
          description: description.trim(),
          category,
          amount: numAmount,
          expense_date: expenseDate,
          paid_from_cash: paidFromCash,
          created_by: user?.id || null,
        });

        if (error) throw error;
        Alert.alert("Sukses", "Pengeluaran baru berhasil dicatat.");
      }

      setModalVisible(false);
      fetchExpenses();
    } catch (err: any) {
      Alert.alert(
        "Gagal Menyimpan",
        err?.message || "Terjadi kesalahan saat menyimpan pengeluaran."
      );
    } finally {
      setSaving(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = (exp: Expense) => {
    Alert.alert(
      "Hapus Pengeluaran",
      `Apakah Anda yakin ingin menghapus catatan "${exp.description}" (${formatRupiah(
        exp.amount
      )})?` +
        (exp.stock_movement_id
          ? "\n\nBiaya ini berasal dari Stock In. Riwayat stok tidak ikut berubah."
          : ""),
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("expenses")
                .delete()
                .eq("id", exp.id);

              if (error) throw error;
              Alert.alert("Sukses", "Pengeluaran berhasil dihapus.");
              fetchExpenses();
            } catch (err: any) {
              Alert.alert(
                "Gagal Menghapus",
                err?.message || "Tidak dapat menghapus data pengeluaran."
              );
            }
          },
        },
      ]
    );
  };

  // Filtered List
  const filteredList = filterExpenses(expenses, {
    category: categoryFilter,
    searchQuery,
    period: periodFilter,
  });

  const totalFilteredAmount = calculateTotalExpenses(filteredList);

  const renderExpenseItem = ({ item }: { item: Expense }) => {
    const meta = getExpenseCategoryMeta(item.category);

    return (
      <View className="bg-surface rounded-card p-4 mb-3 border border-line shadow-sm">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1 mr-2">
            <View className="flex-row items-center mb-1">
              <Badge label={meta.label} tone={meta.tone} />
              <Text className="font-body text-muted text-xs ml-2">
                {item.expense_date}
              </Text>
            </View>
            {item.stock_movement_id ? (
              <View className="flex-row items-center mb-1">
                <Ionicons name="cube-outline" size={12} color="#6B7280" />
                <Text className="font-body-medium text-muted text-[11px] ml-1">
                  Dari Stock In (stok sudah tercatat)
                </Text>
              </View>
            ) : null}
            <Text className="font-body text-muted text-[11px] mb-1">
              {item.paid_from_cash ? "Dibayar dari kas laci" : "Dibayar dari sumber lain"}
            </Text>
            <Text
              className="font-heading-semibold text-text text-base"
              numberOfLines={2}
            >
              {item.description}
            </Text>
          </View>
          <Text className="font-heading text-danger text-base">
            - {formatRupiah(item.amount)}
          </Text>
        </View>

        <View className="flex-row justify-between items-center pt-2.5 mt-1 border-t border-line">
          <Text className="font-body text-muted text-xs leading-4">
            {meta.description}
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.description}`}
              onPress={() => openEditModal(item)}
              className="w-11 h-11 rounded-full bg-background border border-line items-center justify-center"
            >
              <Ionicons name="create-outline" size={15} color="#4B5563" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Hapus ${item.description}`}
              onPress={() => handleDeleteExpense(item)}
              className="w-11 h-11 rounded-full bg-danger-soft border border-line items-center justify-center"
            >
              <Ionicons name="trash-outline" size={15} color="#991B1B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Biaya Operasional"
        subtitle="Pencatatan & Alokasi Pengeluaran Kedai"
        onOpenSidebar={openSidebar}
      />

      <View
        className="flex-1 px-4 pt-3"
        style={isTablet ? { maxWidth: 1000, width: "100%", alignSelf: "center" } : undefined}
      >
        {/* Total Expense Summary Banner */}
        <View className="bg-primary/10 rounded-card p-4 mb-3 border border-primary/20 flex-row justify-between items-center shadow-sm">
          <View className="flex-row items-center">
            <View className="w-11 h-11 rounded-chip bg-primary items-center justify-center mr-3">
              <Ionicons name="wallet-outline" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text className="font-body text-muted text-xs">
                Total Biaya ({periodFilter})
              </Text>
              <Text className="font-heading text-primary text-xl">
                {formatRupiah(totalFilteredAmount)}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="font-body-semibold text-text text-sm">
              {filteredList.length} Transaksi
            </Text>
            <Text className="font-body text-muted text-xs">
              {categoryFilter === "Semua" ? "Semua Kategori" : categoryFilter}
            </Text>
          </View>
        </View>

        {/* Search Bar & Add Button */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari deskripsi pengeluaran..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-body text-sm text-text ml-2"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          <Button
            title="Catat Biaya"
            variant="primary"
            className="w-auto px-4 min-h-12"
            icon={<Ionicons name="add" size={18} color="#FFFFFF" />}
            onPress={openCreateModal}
          />
        </View>

        {/* Period Filter Pills */}
        <View className="flex-row gap-1.5 mb-2.5">
          {(["Hari Ini", "7 Hari Terakhir", "Bulan Ini", "Semua"] as const).map(
            (p) => {
              const active = periodFilter === p;
              return (
                <TouchableOpacity
                  key={p}
                  accessibilityRole="button"
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

        {/* Category Filter Pills (Horizontal Scroll) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3 max-h-9"
          contentContainerStyle={{ paddingRight: 10 }}
        >
          {["Semua", ...EXPENSE_CATEGORIES].map((cat) => {
            const active = categoryFilter === cat;
            const label =
              cat === "Semua" ? "Semua Kategori" : getExpenseCategoryMeta(cat as ExpenseCategory).label;

            return (
              <TouchableOpacity
                key={cat}
                accessibilityRole="button"
                onPress={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 mr-2 rounded-full border ${
                  active
                    ? "bg-text border-text"
                    : "bg-surface border-line"
                }`}
              >
                <Text
                  className={`font-body-medium text-xs ${
                    active ? "text-white" : "text-text"
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Main Expenses List */}
        {loading ? (
          <LoadingState label="Memuat catatan pengeluaran..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchExpenses} />
        ) : filteredList.length === 0 ? (
          <EmptyState
            title="Belum Ada Pengeluaran"
            description={
              searchQuery || categoryFilter !== "Semua" || periodFilter !== "Semua"
                ? "Tidak ada pengeluaran yang cocok dengan kriteria filter."
                : "Belum ada pengeluaran operasional yang dicatat."
            }
            actionLabel="Catat Pengeluaran Baru"
            onAction={openCreateModal}
          />
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            renderItem={renderExpenseItem}
            contentContainerStyle={{ paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        )}
      </View>

      {/* Modal Form Tambah / Edit Pengeluaran */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-black/60 justify-end"
        >
          <View
            className="bg-surface rounded-t-3xl p-5 border-t border-line shadow-2xl"
            style={{ maxHeight: "88%" }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-line mb-4">
              <View>
                <Text className="font-heading text-text text-lg">
                  {editingExpense ? "Edit Pengeluaran" : "Catat Pengeluaran Baru"}
                </Text>
                <Text className="font-body text-muted text-xs">
                  Biaya operasional, bahan baku, atau aset kedai
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Tutup form pengeluaran"
                onPress={() => setModalVisible(false)}
                className="w-11 h-11 rounded-full bg-background items-center justify-center border border-line"
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
              {/* Deskripsi */}
              <Input
                label="Deskripsi Pengeluaran"
                placeholder="Contoh: Biji Kopi Arabika Gayo 5kg"
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  if (formErrors.description) {
                    setFormErrors((prev) => ({ ...prev, description: "" }));
                  }
                }}
                error={formErrors.description}
                leftIcon={<Ionicons name="receipt-outline" size={18} color="#6B7280" />}
              />

              {/* Kategori Dropdown / Choice Selector */}
              <View className="mb-4">
                <Text className="font-body-semibold text-text text-sm mb-1.5">
                  Kategori Pengeluaran
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const isSelected = category === cat;
                    const meta = getExpenseCategoryMeta(cat);

                    return (
                      <TouchableOpacity
                        key={cat}
                        accessibilityRole="button"
                        onPress={() => setCategory(cat)}
                        className={`flex-row items-center px-3.5 py-2.5 rounded-card border ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-background border-line"
                        }`}
                        style={{ width: "48%" }}
                      >
                        <View
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: meta.color }}
                        />
                        <View className="flex-1">
                          <Text
                            className={`font-heading-semibold text-xs ${
                              isSelected ? "text-primary" : "text-text"
                            }`}
                          >
                            {meta.label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {formErrors.category && (
                  <Text className="font-body text-danger text-xs mt-1">
                    {formErrors.category}
                  </Text>
                )}
              </View>

              {/* Nominal Biaya */}
              <Input
                label="Nominal Biaya (Rp)"
                placeholder="Contoh: 250000"
                value={amount}
                keyboardType="numeric"
                onChangeText={(text) => {
                  setAmount(text);
                  if (formErrors.amount) {
                    setFormErrors((prev) => ({ ...prev, amount: "" }));
                  }
                }}
                error={formErrors.amount}
                leftIcon={<Ionicons name="cash-outline" size={18} color="#6B7280" />}
              />
              {amount ? (
                <Text className="font-heading-semibold text-primary text-xs -mt-2 mb-3">
                  Pratinjau: {formatRupiah(parseInt(amount.replace(/\D/g, "") || "0", 10))}
                </Text>
              ) : null}

              {/* Tanggal Pengeluaran */}
              <Input
                label="Tanggal Transaksi (YYYY-MM-DD)"
                placeholder="YYYY-MM-DD"
                value={expenseDate}
                onChangeText={(text) => {
                  setExpenseDate(text);
                  if (formErrors.expense_date) {
                    setFormErrors((prev) => ({ ...prev, expense_date: "" }));
                  }
                }}
                error={formErrors.expense_date}
                leftIcon={<Ionicons name="calendar-outline" size={18} color="#6B7280" />}
              />

              {/* Sumber dana: kas laci (uang penjualan hari itu) atau sumber lain */}
              <TouchableOpacity
                accessibilityRole="checkbox"
                accessibilityState={{ checked: paidFromCash }}
                accessibilityLabel="Dibayar dari kas laci"
                onPress={() => setPaidFromCash((v) => !v)}
                className="flex-row items-center mb-2 min-h-11"
              >
                <Ionicons
                  name={paidFromCash ? "checkbox" : "square-outline"}
                  size={22}
                  color={paidFromCash ? "#D1001F" : "#6B7280"}
                />
                <View className="ml-2 flex-1">
                  <Text className="font-body-medium text-text text-sm">Dibayar dari kas laci</Text>
                  <Text className="font-body text-muted text-[11px]">
                    Memakai uang penjualan hari itu. Matikan jika dibayar lewat transfer atau sumber lain.
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* Modal Actions */}
            <View className="flex-row gap-2 pt-2 border-t border-line">
              <Button
                title="Batal"
                variant="outline"
                className="flex-1"
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingExpense ? "Simpan Perubahan" : "Tambah Pengeluaran"}
                variant="primary"
                className="flex-1"
                isLoading={saving}
                onPress={handleSaveExpense}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
