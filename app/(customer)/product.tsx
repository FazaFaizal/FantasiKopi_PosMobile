import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from "react-native";
import { Badge } from "../../components/Badge";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingState, EmptyState } from "../../components/States";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { Category, Product } from "../../types/database";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "../../hooks/useResponsive";

interface ProductWithCategory extends Product {
  category?: Category | null;
}

const formatRupiah = (val: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

export default function CustomerProduct() {
  const { signOut, user } = useAuth();
  const { isTablet, columns } = useResponsive();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch active categories
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .select("*")
        .eq("status", "Aktif")
        .order("name", { ascending: true });

      if (catError) throw catError;
      setCategories(catData || []);

      // 2. Fetch active products with category
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .select("*, category:categories(*)")
        .order("name", { ascending: true });

      if (prodError) throw prodError;
      setProducts((prodData as ProductWithCategory[]) || []);
    } catch (err: any) {
      console.error("Error fetching customer menu:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleLogout = () => {
    Alert.alert(
      "Konfirmasi Keluar",
      "Apakah Anda yakin ingin keluar dari akun pelanggan?",
      [
        { text: "Batal", style: "cancel" },
        { text: "Keluar", style: "destructive", onPress: signOut },
      ],
    );
  };

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description &&
          item.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCategory =
        selectedCategoryId === "all" || item.category_id === selectedCategoryId;

      return matchSearch && matchCategory;
    });
  }, [products, searchQuery, selectedCategoryId]);

  const renderProductItem = ({ item }: { item: ProductWithCategory }) => {
    const isAvailable = item.status === "Tersedia";

    return (
      <View
        className={`bg-surface rounded-card p-4 mb-3 border border-line shadow-sm flex-row items-center ${
          !isAvailable ? "opacity-75" : ""
        }`}
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        {/* Product Image / Placeholder */}
        <View className="w-18 h-18 rounded-chip bg-primary/10 items-center justify-center mr-3.5 border border-line overflow-hidden">
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={
                item.category?.name?.toLowerCase().includes("tea")
                  ? "leaf-outline"
                  : item.category?.name?.toLowerCase().includes("snack")
                    ? "fast-food-outline"
                    : "cafe-outline"
              }
              size={32}
              color={isAvailable ? "#D1001F" : "#9CA3AF"}
            />
          )}
        </View>

        {/* Product Details */}
        <View className="flex-1 mr-2">
          <View className="flex-row items-center flex-wrap gap-1 mb-1">
            <Text
              className="font-heading-semibold text-text text-base flex-1"
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>

          {item.category && (
            <View className="self-start mb-1.5">
              <Badge label={item.category.name} tone="neutral" />
            </View>
          )}

          {item.description ? (
            <Text
              className="font-body text-muted text-xs mb-1.5 leading-4"
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}

          <View className="flex-row items-center justify-between mt-0.5">
            <Text className="font-heading-bold text-primary text-base">
              {formatRupiah(item.price)}
            </Text>

            {isAvailable ? (
              <Badge
                label="Tersedia"
                tone="success"
                icon={
                  <Ionicons name="checkmark-circle" size={12} color="#166534" />
                }
              />
            ) : (
              <Badge
                label="Habis"
                tone="danger"
                icon={
                  <Ionicons name="close-circle" size={12} color="#991B1B" />
                }
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Fantasi Coffee"
        subtitle="Jelajahi Menu Spesial Kedai"
        rightAction={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Keluar dari akun customer"
            onPress={handleLogout}
            className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
            <Text className="font-body-medium text-white text-xs ml-1.5">
              Keluar
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Customer Header Info */}
      <View className="bg-surface px-4 py-3 border-b border-line flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <Ionicons name="person-circle-outline" size={20} color="#D1001F" />
          <Text
            className="font-body-medium text-text text-xs ml-1.5"
            numberOfLines={1}
          >
            {user?.email}
          </Text>
        </View>
        <Badge label="Pelanggan" tone="accent" />
      </View>

      {/* Search Input */}
      <View
        className="p-4 pb-2"
        style={isTablet ? { maxWidth: 1200, width: "100%", alignSelf: "center" } : undefined}
      >
        <View className="flex-row items-center bg-surface border border-line rounded-card px-3.5 py-2.5 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#6B7280" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cari kopi, makanan, atau minuman..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 ml-2 font-body text-text text-sm py-0"
            accessibilityLabel="Input pencarian menu"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Hapus pencarian"
              className="p-1"
            >
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Horizontal Category Chips */}
      <View
        className="py-2"
        style={isTablet ? { maxWidth: 1200, width: "100%", alignSelf: "center" } : undefined}
      >
        <FlatList
          horizontal
          data={[{ id: "all", name: "Semua Menu" } as Category, ...categories]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => {
            const isSelected = selectedCategoryId === item.id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedCategoryId(item.id)}
                activeOpacity={0.7}
                className={`px-4 py-2 rounded-chip border ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-surface border-line"
                }`}
              >
                <Text
                  className={`text-xs ${
                    isSelected
                      ? "font-heading-semibold text-white"
                      : "font-body-medium text-text"
                  }`}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Product List */}
      {loading ? (
        <LoadingState label="Memuat katalog menu..." />
      ) : (
        <FlatList
          key={columns}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 40,
            maxWidth: 1200,
            width: "100%",
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#D1001F"]}
            />
          }
          ListHeaderComponent={
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-heading-semibold text-text text-sm">
                Daftar Menu ({filteredProducts.length})
              </Text>
              <Text className="font-body text-muted text-xs">
                Ketersediaan menu terupdate
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="Menu Tidak Ditemukan"
              description={
                searchQuery
                  ? `Tidak ada menu yang sesuai dengan kata kunci "${searchQuery}".`
                  : "Belum ada produk aktif pada kategori ini."
              }
              actionLabel={searchQuery ? "Reset Pencarian" : undefined}
              onAction={searchQuery ? () => setSearchQuery("") : undefined}
            />
          }
        />
      )}
    </View>
  );
}
