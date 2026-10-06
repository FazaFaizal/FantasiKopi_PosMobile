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
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { Database } from "../../types/database";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Badge } from "../../components/Badge";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAdminSidebar } from "../../components/SidebarDrawer";
import { LoadingState, EmptyState, ErrorState } from "../../components/States";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "../../hooks/useResponsive";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];

interface ProductWithCategory extends Product {
  category?: Category | null;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminProductScreen() {
  const { openSidebar } = useAdminSidebar();
  const { isTablet, columns } = useResponsive();
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("Semua");
  const [statusFilter, setStatusFilter] = useState<
    "Semua" | "Tersedia" | "Tidak Tersedia"
  >("Semua");

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [status, setStatus] = useState<"Tersedia" | "Tidak Tersedia">(
    "Tersedia",
  );
  const [nameError, setNameError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [categoryError, setCategoryError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      // 1. Fetch categories
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (catError) throw catError;
      setCategories(catData || []);

      // 2. Fetch products
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .select(
          `
          *,
          category:categories (*)
        `,
        )
        .order("name", { ascending: true });

      if (prodError) throw prodError;
      setProducts(prodData || []);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memuat data produk.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setEditingProduct(null);
    setName("");
    setDescription("");
    // Default to first active category if exists
    const activeCats = categories.filter((c) => c.status === "Aktif");
    setCategoryId(activeCats.length > 0 ? activeCats[0].id : null);
    setPrice("");
    setImage("");
    setStatus("Tersedia");
    setNameError("");
    setPriceError("");
    setCategoryError("");
    setModalVisible(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setName(prod.name);
    setDescription(prod.description || "");
    setCategoryId(prod.category_id);
    setPrice(prod.price.toString());
    setImage(prod.image || "");
    setStatus(prod.status);
    setNameError("");
    setPriceError("");
    setCategoryError("");
    setModalVisible(true);
  };

  const handleSave = async () => {
    let isValid = true;
    setNameError("");
    setPriceError("");
    setCategoryError("");

    const cleanName = name.trim();
    if (!cleanName) {
      setNameError("Nama produk wajib diisi");
      isValid = false;
    }

    const numPrice = Number(price);
    if (!price || isNaN(numPrice) || numPrice < 0) {
      setPriceError("Harga harus berupa angka valid (>= 0)");
      isValid = false;
    }

    if (!categoryId) {
      setCategoryError("Kategori produk wajib dipilih");
      isValid = false;
    }

    if (!isValid) return;

    setSubmitting(true);
    try {
      if (editingProduct) {
        // UPDATE
        const { error } = await supabase
          .from("products")
          .update({
            name: cleanName,
            description: description.trim() || null,
            category_id: categoryId,
            price: numPrice,
            image: image.trim() || null,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingProduct.id);

        if (error) throw error;
        Alert.alert("Sukses", "Data produk berhasil diperbarui.");
      } else {
        // INSERT
        const { error } = await supabase.from("products").insert({
          name: cleanName,
          description: description.trim() || null,
          category_id: categoryId,
          price: numPrice,
          image: image.trim() || null,
          status: status,
          is_active: true,
        });

        if (error) throw error;
        Alert.alert("Sukses", "Produk baru berhasil ditambahkan.");
      }

      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      Alert.alert(
        "Gagal Menyimpan",
        err?.message || "Terjadi kesalahan saat menyimpan produk.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAvailability = async (prod: Product) => {
    const newStatus =
      prod.status === "Tersedia" ? "Tidak Tersedia" : "Tersedia";
    try {
      const { error } = await supabase
        .from("products")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prod.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      Alert.alert(
        "Gagal Mengubah Ketersediaan",
        err?.message || "Terjadi kesalahan.",
      );
    }
  };

  const handleDelete = (prod: Product) => {
    Alert.alert(
      "Hapus Produk Permanen",
      `Hapus produk "${prod.name}" secara permanen dari database Supabase? Riwayat pesanan lama tetap aman dengan data snapshot.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus Permanen",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("products")
                .delete()
                .eq("id", prod.id);

              if (error) throw error;
              Alert.alert("Sukses", "Produk telah dihapus secara permanen dari Supabase.");
              fetchData();
            } catch (err: any) {
              Alert.alert(
                "Gagal Menghapus",
                err?.message || "Tidak dapat menghapus produk.",
              );
            }
          },
        },
      ],
    );
  };

  const filteredProducts = products.filter((p) => {
    // Status Filter
    if (statusFilter !== "Semua" && p.status !== statusFilter) return false;
    // Category Filter
    if (
      selectedCategoryFilter !== "Semua" &&
      p.category_id !== selectedCategoryFilter
    )
      return false;
    // Search
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category && p.category.name.toLowerCase().includes(q))
    );
  });

  const activeCategories = categories.filter((c) => c.status === "Aktif");

  const renderItem = ({ item }: { item: ProductWithCategory }) => {
    const isAvailable = item.status === "Tersedia";

    return (
      <View
        className="bg-surface rounded-card p-4 mb-3.5 border border-line shadow-sm justify-between"
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        <View>
          {/* Top Row: Thumbnail + Info + Status Badge */}
          <View className="flex-row items-start mb-3">
            {/* Thumbnail / Image Hero */}
            <View className="w-16 h-16 rounded-card bg-background items-center justify-center mr-3 border border-line overflow-hidden shadow-xs">
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="items-center justify-center w-full h-full bg-primary/10">
                  <Ionicons
                    name={
                      item.category?.name?.toLowerCase().includes("tea")
                        ? "leaf-outline"
                        : item.category?.name?.toLowerCase().includes("snack") ||
                          item.category?.name?.toLowerCase().includes("makan")
                        ? "fast-food-outline"
                        : "cafe-outline"
                    }
                    size={28}
                    color="#D1001F"
                  />
                </View>
              )}
            </View>

            {/* Info */}
            <View className="flex-1 mr-2">
              <Text
                className="font-heading-semibold text-text text-base"
                numberOfLines={1}
              >
                {item.name}
              </Text>

              {/* Category Pill Tag */}
              <View className="flex-row items-center mt-1 mb-1">
                <Text
                  className="font-body-medium text-muted text-xs bg-background px-2.5 py-0.5 rounded-chip border border-line"
                  numberOfLines={1}
                >
                  {item.category?.name || "Tanpa Kategori"}
                </Text>
              </View>

              {/* Price Hero */}
              <Text className="font-heading text-primary text-base">
                {formatRupiah(item.price)}
              </Text>
            </View>

            {/* Status Badge */}
            <Badge
              label={item.status}
              tone={isAvailable ? "success" : "danger"}
            />
          </View>

          {/* Description (if exists) */}
          {item.description ? (
            <Text
              className="font-body text-muted text-xs mb-3 bg-background/80 p-2.5 rounded-chip border border-line/70 leading-4"
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}
        </View>

        {/* Footer Actions Row (Balanced & Structured like Inventory) */}
        <View className="flex-row justify-between items-center pt-3 border-t border-line mt-1">
          {/* Availability Toggle Button on the Left */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              isAvailable
                ? `Set habis untuk ${item.name}`
                : `Set tersedia untuk ${item.name}`
            }
            onPress={() => handleToggleAvailability(item)}
            className={`min-h-10 px-3 py-1.5 rounded-button border flex-row items-center ${
              isAvailable
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-success-soft border-success/30"
            }`}
          >
            <Ionicons
              name={
                isAvailable
                  ? "close-circle-outline"
                  : "checkmark-circle-outline"
              }
              size={15}
              color={isAvailable ? "#B45309" : "#166534"}
            />
            <Text
              className={`font-heading-semibold text-xs ml-1.5 ${
                isAvailable ? "text-amber-800" : "text-success"
              }`}
            >
              {isAvailable ? "Set Habis" : "Set Tersedia"}
            </Text>
          </TouchableOpacity>

          {/* Edit & Delete Buttons on the Right */}
          <View className="flex-row gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.name}`}
              onPress={() => openEditModal(item)}
              className="min-h-10 px-3 py-1.5 rounded-button bg-background border border-line flex-row items-center"
            >
              <Ionicons name="create-outline" size={14} color="#1F2937" />
              <Text className="font-body-medium text-text text-xs ml-1">
                Edit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Hapus produk ${item.name}`}
              onPress={() => handleDelete(item)}
              className="min-h-10 p-2 rounded-button bg-danger-soft border border-line items-center justify-center"
            >
              <Ionicons name="trash-outline" size={14} color="#991B1B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Daftar Produk"
        subtitle="Kelola Menu & Ketersediaan Minuman Kedai"
        onOpenSidebar={openSidebar}
      />

      <View
        className="flex-1 px-5 pt-4"
        style={isTablet ? { maxWidth: 1200, width: "100%", alignSelf: "center" } : undefined}
      >
        {/* Search bar & Add Button */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari nama produk menu..."
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

        {/* Category Filter Horizontal Scroll */}
        <View className="mb-2.5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategoryFilter("Semua")}
              className={`px-3.5 py-2 rounded-chip mr-2 border ${
                selectedCategoryFilter === "Semua"
                  ? "bg-primary border-primary"
                  : "bg-surface border-line"
              }`}
            >
              <Text
                className={`font-body-medium text-xs ${
                  selectedCategoryFilter === "Semua"
                    ? "text-white"
                    : "text-text"
                }`}
              >
                Semua Kategori
              </Text>
            </TouchableOpacity>

            {categories.map((cat) => {
              const active = selectedCategoryFilter === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategoryFilter(cat.id)}
                  className={`px-3.5 py-2 rounded-chip mr-2 border ${
                    active
                      ? "bg-primary border-primary"
                      : "bg-surface border-line"
                  }`}
                >
                  <Text
                    className={`font-body-medium text-xs ${active ? "text-white" : "text-text"}`}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Status Filter Tabs (Sleek Segmented Bar) */}
        <View className="flex-row gap-2 mb-4 bg-surface p-1 rounded-card border border-line">
          {(["Semua", "Tersedia", "Tidak Tersedia"] as const).map((st) => {
            const active = statusFilter === st;
            const displayLabel = st === "Tidak Tersedia" ? "Habis" : st;
            return (
              <TouchableOpacity
                key={st}
                accessibilityRole="button"
                onPress={() => setStatusFilter(st)}
                className={`flex-1 py-1.5 rounded-chip items-center justify-center ${
                  active ? "bg-primary shadow-xs" : "bg-transparent"
                }`}
              >
                <Text
                  className={`font-body-medium text-xs ${active ? "text-white font-heading-semibold" : "text-muted"}`}
                >
                  {displayLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content list with states */}
        {loading ? (
          <LoadingState label="Memuat produk menu..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchData} />
        ) : (
          <FlatList
            key={columns}
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            refreshing={loading}
            onRefresh={fetchData}
            ListEmptyComponent={
              <EmptyState
                title={searchQuery ? "Produk Tidak Ditemukan" : "Belum Ada Produk"}
                iconName="cafe-outline"
                description={
                  searchQuery
                    ? "Tidak ada produk yang cocok dengan kriteria pencarian Anda."
                    : "Mulai dengan menambahkan menu minuman atau makanan pertama untuk kedai."
                }
                actionLabel={searchQuery ? undefined : "Tambah Produk Baru"}
                onAction={searchQuery ? undefined : openAddModal}
              />
            }
          />
        )}
      </View>

      {/* Modal Form Tambah / Edit Produk */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            className={`flex-1 ${
              isTablet ? "justify-center items-center px-6" : "justify-end"
            } bg-black/50`}
          >
            <TouchableOpacity
              accessibilityLabel="Tutup dialog"
              className="flex-1 w-full"
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setModalVisible(false);
              }}
            />
            <View
              style={isTablet ? { width: "100%", maxWidth: 580 } : undefined}
              className={`bg-surface ${
                isTablet
                  ? "rounded-2xl border border-line shadow-2xl"
                  : "rounded-t-card border-t border-line"
              } p-6 max-h-[85%]`}
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
                    {editingProduct ? "Edit Data Produk" : "Tambah Produk Baru"}
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
                  label="Nama Produk Menu *"
                  placeholder="Contoh: Kopi Susu Gula Aren"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (nameError) setNameError("");
                  }}
                  error={nameError}
                  leftIcon={
                    <Ionicons name="cafe-outline" size={18} color="#6B7280" />
                  }
                />

                <Input
                  label="Harga Jual (Rp) *"
                  placeholder="Contoh: 24000"
                  value={price}
                  onChangeText={(t) => {
                    setPrice(t);
                    if (priceError) setPriceError("");
                  }}
                  keyboardType="numeric"
                  error={priceError}
                  leftIcon={
                    <Ionicons name="pricetag-outline" size={18} color="#6B7280" />
                  }
                />

                {/* Category Picker */}
                <View className="mb-4">
                  <Text className="font-body-medium text-text text-sm mb-2">
                    Pilih Kategori *
                  </Text>
                  {categoryError ? (
                    <Text className="font-body text-primary text-xs mb-1.5">
                      {categoryError}
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    {activeCategories.map((cat) => {
                      const isSelected = categoryId === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => {
                            setCategoryId(cat.id);
                            if (categoryError) setCategoryError("");
                          }}
                          className={`px-3.5 py-2.5 rounded-chip border ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "bg-surface border-line"
                          }`}
                        >
                          <Text
                            className={`font-body text-xs ${isSelected ? "font-bold text-white" : "text-text"}`}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {activeCategories.length === 0 && (
                    <Text className="font-body text-muted text-xs mt-1">
                      Belum ada kategori aktif. Silakan tambahkan kategori
                      terlebih dahulu.
                    </Text>
                  )}
                </View>

                <ChoiceGroup
                  label="Status Ketersediaan Produk"
                  value={status}
                  onChange={(val) =>
                    setStatus(val as "Tersedia" | "Tidak Tersedia")
                  }
                  options={[
                    { value: "Tersedia", label: "Tersedia" },
                    { value: "Tidak Tersedia", label: "Tidak Tersedia" },
                  ]}
                />

                <Input
                  label="Deskripsi / Komposisi Menu (Opsional)"
                  placeholder="Penjelasan rasa, takaran, atau bahan racikan"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                  style={{ height: 60, textAlignVertical: "top" }}
                />

                <View className="mb-4">
                  <Input
                    label="URL Foto Produk (Opsional)"
                    placeholder="https://contoh.com/foto-kopi.jpg"
                    value={image}
                    onChangeText={setImage}
                    autoCapitalize="none"
                    containerClassName="mb-0"
                    leftIcon={
                      <Ionicons name="image-outline" size={18} color="#6B7280" />
                    }
                  />
                  {image.trim().length > 0 && (
                    <View className="mt-2.5 p-3 rounded-card bg-background border border-line flex-row items-center">
                      <View className="w-14 h-14 rounded-chip overflow-hidden border border-line mr-3 bg-surface items-center justify-center">
                        <Image
                          source={{ uri: image.trim() }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="font-heading-semibold text-xs text-text">Pratinjau Foto Produk</Text>
                        <Text className="font-body text-xs text-muted mt-0.5" numberOfLines={1}>
                          {image.trim()}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setModalVisible(false)}
                  />
                  <Button
                    title={editingProduct ? "Simpan" : "Tambah"}
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
