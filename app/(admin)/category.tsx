import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { Database } from "../../types/database";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Badge, statusTone } from "../../components/Badge";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { LoadingState, EmptyState, ErrorState } from "../../components/States";
import { Ionicons } from "@expo/vector-icons";
import { canDeleteCategory } from "../../lib/category-logic";
import { useResponsive } from "../../hooks/useResponsive";

type Category = Database["public"]["Tables"]["categories"]["Row"];

interface CategoryWithCount extends Category {
  product_count?: number;
}

export default function CategoryScreen() {
  const { openSidebar } = useAdminSidebar();
  const { isTablet, columns } = useResponsive();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "Semua" | "Aktif" | "Nonaktif"
  >("Semua");

  // Modal Form
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Aktif" | "Nonaktif">("Aktif");
  const [nameError, setNameError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      // 1. Fetch categories
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (catError) throw catError;

      // 2. Fetch products to calculate count
      const { data: prodData } = await supabase
        .from("products")
        .select("id, category_id")
        .eq("is_active", true);

      const countMap: Record<string, number> = {};
      (prodData || []).forEach((p) => {
        if (p.category_id) {
          countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
        }
      });

      const listWithCount = (catData || []).map((cat) => ({
        ...cat,
        product_count: countMap[cat.id] || 0,
      }));

      setCategories(listWithCount);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memuat kategori dari server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAddModal = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setStatus("Aktif");
    setNameError("");
    setModalVisible(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setStatus(cat.status);
    setNameError("");
    setModalVisible(true);
  };

  const handleSave = async () => {
    setNameError("");
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError("Nama kategori wajib diisi");
      return;
    }

    setSubmitting(true);
    try {
      if (editingCategory) {
        // UPDATE
        const { error } = await supabase
          .from("categories")
          .update({
            name: cleanName,
            description: description.trim() || null,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingCategory.id);

        if (error) throw error;
        Alert.alert("Sukses", "Kategori berhasil diperbarui.");
      } else {
        // INSERT
        const { error } = await supabase.from("categories").insert({
          name: cleanName,
          description: description.trim() || null,
          status: status,
        });

        if (error) throw error;
        Alert.alert("Sukses", "Kategori baru berhasil ditambahkan.");
      }

      setModalVisible(false);
      fetchCategories();
    } catch (err: any) {
      Alert.alert(
        "Gagal Menyimpan",
        err?.message || "Terjadi kesalahan saat menyimpan kategori.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (cat: Category) => {
    const isAktif = cat.status === "Aktif";
    const newStatus = isAktif ? "Nonaktif" : "Aktif";

    Alert.alert(
      isAktif ? "Nonaktifkan Kategori" : "Aktifkan Kategori",
      isAktif
        ? `Nonaktifkan kategori "${cat.name}"? Kategori nonaktif tidak dapat digunakan untuk produk baru.`
        : `Aktifkan kembali kategori "${cat.name}"?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: isAktif ? "Nonaktifkan" : "Aktifkan",
          style: isAktif ? "destructive" : "default",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("categories")
                .update({
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", cat.id);

              if (error) throw error;
              fetchCategories();
            } catch (err: any) {
              Alert.alert(
                "Gagal Mengubah Status",
                err?.message || "Terjadi kesalahan.",
              );
            }
          },
        },
      ],
    );
  };

  const handleDelete = async (cat: CategoryWithCount) => {
    const guard = canDeleteCategory(cat.product_count || 0);
    if (!guard.canDelete) {
      Alert.alert(
        "Tidak Dapat Menghapus Kategori",
        guard.reason || "Kategori masih memiliki produk terkait.",
      );
      return;
    }

    Alert.alert(
      "Hapus Kategori",
      `Apakah Anda yakin ingin menghapus kategori "${cat.name}" secara permanen?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("categories")
                .delete()
                .eq("id", cat.id);

              if (error) throw error;
              Alert.alert("Sukses", "Kategori berhasil dihapus.");
              fetchCategories();
            } catch (err: any) {
              Alert.alert(
                "Gagal Menghapus",
                err?.message || "Tidak dapat menghapus kategori.",
              );
            }
          },
        },
      ],
    );
  };

  const filteredCategories = categories.filter((cat) => {
    if (statusFilter !== "Semua" && cat.status !== statusFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      cat.name.toLowerCase().includes(q) ||
      (cat.description && cat.description.toLowerCase().includes(q))
    );
  });

  const renderItem = ({ item }: { item: CategoryWithCount }) => {
    const isAktif = item.status === "Aktif";

    return (
      <View
        className="bg-surface rounded-card p-4 mb-3.5 border border-line shadow-sm"
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        <View className="flex-row items-center mb-2.5">
          <View className="w-11 h-11 rounded-chip bg-primary/10 items-center justify-center mr-3 border border-primary/20">
            <Ionicons name="albums-outline" size={22} color="#D1001F" />
          </View>
          <View className="flex-1 mr-2">
            <Text
              className="font-heading-semibold text-text text-base"
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              className="font-body text-muted text-xs mt-0.5"
              numberOfLines={2}
            >
              {item.description || "Tidak ada deskripsi tambahan"}
            </Text>
          </View>
          <Badge label={item.status} tone={statusTone(item.status)} />
        </View>

        {/* Product count indicator */}
        <View className="bg-background rounded-chip px-3 py-2 mb-3 border border-line flex-row justify-between items-center">
          <View className="flex-row items-center">
            <Ionicons name="cafe-outline" size={14} color="#6B7280" />
            <Text className="font-body text-muted text-xs ml-1.5">
              Produk Terdaftar:
            </Text>
          </View>
          <Text className="font-heading-semibold text-text text-xs">
            {item.product_count} Produk
          </Text>
        </View>

        {/* Action Row */}
        <View className="flex-row justify-end gap-2 pt-2.5 border-t border-line items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              isAktif ? `Nonaktifkan ${item.name}` : `Aktifkan ${item.name}`
            }
            onPress={() => handleToggleStatus(item)}
            className={`min-h-11 px-3 py-2 rounded-button border border-line flex-row items-center ${
              isAktif ? "bg-amber-500/10" : "bg-success-soft"
            }`}
          >
            <Ionicons
              name={
                isAktif ? "pause-circle-outline" : "checkmark-circle-outline"
              }
              size={15}
              color={isAktif ? "#B45309" : "#166534"}
            />
            <Text
              className={`font-body-medium text-xs ml-1.5 ${
                isAktif ? "text-amber-800" : "text-success"
              }`}
            >
              {isAktif ? "Nonaktifkan" : "Aktifkan"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Edit kategori ${item.name}`}
            onPress={() => openEditModal(item)}
            className="min-h-11 px-3.5 py-2 rounded-button bg-background border border-line flex-row items-center"
          >
            <Ionicons name="create-outline" size={15} color="#1F2937" />
            <Text className="font-body-medium text-text text-xs ml-1.5">
              Edit
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Hapus kategori ${item.name}`}
            onPress={() => handleDelete(item)}
            className="min-h-11 px-2.5 py-2 rounded-button bg-danger-soft border border-line flex-row items-center"
          >
            <Ionicons name="trash-outline" size={15} color="#991B1B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Kategori Produk"
        subtitle="Kelola Kategori Menu Fantasi Coffee"
        onOpenSidebar={openSidebar}
      />

      <View
        className="flex-1 px-5 pt-4"
        style={isTablet ? { maxWidth: 1200, width: "100%", alignSelf: "center" } : undefined}
      >
        {/* Search & Add Action Header */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari nama kategori..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-body text-sm text-text ml-2"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                className="p-1"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          <Button
            title="Tambah"
            variant="primary"
            className="w-auto px-4 min-h-12"
            icon={<Ionicons name="add" size={18} color="#FFFFFF" />}
            onPress={openAddModal}
          />
        </View>

        {/* Status Filter Tabs */}
        <View className="flex-row gap-2 mb-4">
          {(["Semua", "Aktif", "Nonaktif"] as const).map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                accessibilityRole="button"
                onPress={() => setStatusFilter(st)}
                className={`flex-1 min-h-11 rounded-chip items-center justify-center border ${
                  active
                    ? "bg-primary border-primary"
                    : "bg-surface border-line"
                }`}
              >
                <Text
                  className={`font-body-medium text-xs ${active ? "text-white" : "text-text"}`}
                >
                  {st}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content list with states */}
        {loading ? (
          <LoadingState label="Memuat kategori menu..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchCategories} />
        ) : (
          <FlatList
            key={columns}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
            data={filteredCategories}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            refreshing={loading}
            onRefresh={fetchCategories}
            ListEmptyComponent={
              <EmptyState
                title={
                  searchQuery ? "Kategori Tidak Ditemukan" : "Belum Ada Kategori"
                }
                iconName="albums-outline"
                description={
                  searchQuery
                    ? "Tidak ada kategori yang cocok dengan kata kunci pencarian."
                    : "Tambahkan kategori pertama untuk mengelompokkan produk kedai kopi."
                }
                actionLabel={searchQuery ? undefined : "Tambah Kategori Baru"}
                onAction={searchQuery ? undefined : openAddModal}
              />
            }
          />
        )}
      </View>

      {/* Modal Tambah / Edit Kategori */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className={`flex-1 bg-black/50 ${isTablet ? "justify-center items-center px-6" : "justify-end"}`}>
            <TouchableOpacity
              accessibilityLabel="Tutup dialog"
              className="flex-1"
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setModalVisible(false);
              }}
            />
            <View
              className={`bg-surface ${
                isTablet
                  ? "rounded-card p-6 shadow-xl border border-line"
                  : "rounded-t-card p-6 border-t border-line"
              }`}
              style={isTablet ? { width: "100%", maxWidth: 580, maxHeight: "85%" } : { maxHeight: "85%" }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                contentContainerStyle={{ paddingBottom: 48 }}
              >
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="font-heading text-text text-xl">
                    {editingCategory
                      ? "Edit Kategori Menu"
                      : "Tambah Kategori Baru"}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Tutup dialog"
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Input
                  label="Nama Kategori *"
                  placeholder="Contoh: Espresso & Coffee, Non-Coffee"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (nameError) setNameError("");
                  }}
                  error={nameError}
                  leftIcon={
                    <Ionicons name="albums-outline" size={18} color="#6B7280" />
                  }
                />

                <Input
                  label="Deskripsi Kategori (Opsional)"
                  placeholder="Penjelasan singkat mengenai kategori menu ini"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={{ height: 80, textAlignVertical: "top" }}
                />

                <ChoiceGroup
                  label="Status Kategori"
                  value={status}
                  onChange={(val) => setStatus(val as "Aktif" | "Nonaktif")}
                  options={[
                    { value: "Aktif", label: "Aktif" },
                    { value: "Nonaktif", label: "Nonaktif" },
                  ]}
                />

                <View className="bg-background rounded-chip p-3 mb-4 border border-line">
                  <Text className="font-body text-muted text-xs leading-4">
                    Kategori berstatus Nonaktif tidak dapat dipilih saat
                    mendaftarkan produk baru.
                  </Text>
                </View>

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setModalVisible(false)}
                  />
                  <Button
                    title={editingCategory ? "Simpan" : "Tambah"}
                    variant="primary"
                    className="flex-1"
                    isLoading={submitting}
                    icon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    onPress={handleSave}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
