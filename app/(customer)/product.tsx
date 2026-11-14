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
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Badge } from "../../components/Badge";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingState, EmptyState } from "../../components/States";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { Category, Product } from "../../types/database";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "../../hooks/useResponsive";
import { formatRupiah } from "../../lib/formatters";
import { useRouter } from "expo-router";
import {
  CustomerCartItem,
  canAddProductToCustomerCart,
  validateCustomerCheckoutPayload,
} from "../../lib/customer-order-logic";
import { calculateCartTotals, buildCreateOrderParams, CreatedOrder } from "../../lib/pos-logic";
import { PAYMENT_METHODS, PaymentMethod, getPaymentMethodMeta } from "../../lib/order-logic";

interface ProductWithCategory extends Product {
  category?: Category | null;
}

export default function CustomerProduct() {
  const { user } = useAuth();
  const router = useRouter();
  const { isTablet, columns } = useResponsive();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Cart & Checkout States
  const [cart, setCart] = useState<CustomerCartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Note Modal for Item Customization
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithCategory | null>(null);
  const [itemNoteInput, setItemNoteInput] = useState("");

  // Checkout Form fields
  const [orderType, setOrderType] = useState<"Dine In" | "Take Away">("Dine In");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState(
    user?.email?.split("@")[0] || "Pelanggan"
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("QRIS");
  const [orderNotes, setOrderNotes] = useState("");

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

  const cartTotals = useMemo(() => {
    return calculateCartTotals(cart);
  }, [cart]);

  // Handle Add to Cart with Invariant Check
  const handleInitiateAddToCart = (product: ProductWithCategory) => {
    const check = canAddProductToCustomerCart(product);
    if (!check.canAdd) {
      Alert.alert("Menu Tidak Dapat Dipesan", check.reason || "Menu sedang tidak tersedia.");
      return;
    }

    setSelectedProduct(product);
    setItemNoteInput("");
    setNoteModalVisible(true);
  };

  const handleConfirmAddToCart = () => {
    if (!selectedProduct) return;

    const check = canAddProductToCustomerCart(selectedProduct);
    if (!check.canAdd) {
      Alert.alert("Menu Tidak Tersedia", check.reason);
      setNoteModalVisible(false);
      return;
    }

    const cleanNote = itemNoteInput.trim();
    const existingIndex = cart.findIndex(
      (c) => c.productId === selectedProduct.id && (c.notes || "") === cleanNote
    );

    if (existingIndex > -1) {
      const nextCart = [...cart];
      nextCart[existingIndex] = {
        ...nextCart[existingIndex],
        quantity: nextCart[existingIndex].quantity + 1,
      };
      setCart(nextCart);
    } else {
      setCart([
        ...cart,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          unitPrice: selectedProduct.price,
          quantity: 1,
          notes: cleanNote || undefined,
          status: selectedProduct.status,
          is_active: selectedProduct.is_active,
        },
      ]);
    }

    setNoteModalVisible(false);
    setSelectedProduct(null);
    setItemNoteInput("");
  };

  const handleUpdateQuantity = (productId: string, notes: string | undefined, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId && (item.notes || "") === (notes || "")) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CustomerCartItem => item !== null)
    );
  };

  const handleRemoveItem = (productId: string, notes: string | undefined) => {
    setCart((prev) =>
      prev.filter(
        (item) => !(item.productId === productId && (item.notes || "") === (notes || ""))
      )
    );
  };

  const handleClearCart = () => {
    Alert.alert("Kosongkan Keranjang", "Apakah Anda yakin ingin menghapus semua pesanan?", [
      { text: "Batal", style: "cancel" },
      { text: "Hapus Semua", style: "destructive", onPress: () => setCart([]) },
    ]);
  };

  // Submit Order to Supabase
  const handleSubmitOrder = async () => {
    const payload = {
      cart,
      customerName,
      orderType,
      paymentMethod,
      tableNumber: orderType === "Dine In" ? tableNumber : undefined,
      notes: orderNotes,
    };

    const validation = validateCustomerCheckoutPayload(payload);
    if (!validation.isValid) {
      Alert.alert("Perhatian", validation.error || "Data pesanan belum lengkap.");
      return;
    }

    setSubmittingOrder(true);
    try {
      // 1. Nomor order (ORD-YYYYMMDD-XXXX) dibuat atomik oleh trigger database,
      //    karena RLS membuat customer hanya bisa melihat order miliknya sendiri.

      // 2. Prepare notes combining table number & custom notes
      const notesArray: string[] = [];
      if (orderType === "Dine In" && tableNumber.trim()) {
        notesArray.push(`Nomor Meja: ${tableNumber.trim()}`);
      }
      if (orderNotes.trim()) {
        notesArray.push(orderNotes.trim());
      }
      const combinedNotes = notesArray.length > 0 ? notesArray.join(" | ") : null;

      // 3. Order & item disimpan atomik oleh database (create_order): harga & total
      //    dihitung dari data produk; status awal Pending/Pending ditentukan server.
      const { data: created, error: orderErr } = await supabase.rpc(
        "create_order",
        buildCreateOrderParams(cart, {
          customerName,
          orderType,
          paymentMethod,
          notes: combinedNotes,
        })
      );
      if (orderErr) throw orderErr;
      const newOrder = created as unknown as CreatedOrder;

      // 5. Success Flow
      setCart([]);
      setCartModalVisible(false);
      setTableNumber("");
      setOrderNotes("");

      Alert.alert(
        "Pesanan Berhasil Dibuat!",
        `Nomor Pesanan: ${newOrder.order_number}\n\n` +
          (paymentMethod === "QRIS"
            ? "Scan QRIS di kasir lalu tunjukkan bukti pembayaran."
            : paymentMethod === "Debit"
            ? "Silakan bayar dengan kartu debit di kasir."
            : "Silakan bayar tunai di kasir.") +
          "\nPesanan diproses setelah kasir mengonfirmasi pembayaran.",
        [
          {
            text: "Lacak Pesanan Saya",
            onPress: () => router.push("/(customer)/orders"),
          },
        ]
      );
    } catch (err: any) {
      console.error("Error creating customer order:", err);
      Alert.alert("Gagal Membuat Pesanan", err.message || "Terjadi kesalahan sistem.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const renderProductItem = ({ item }: { item: ProductWithCategory }) => {
    const isAvailable = item.status === "Tersedia" && item.is_active;
    const itemInCartCount = cart
      .filter((c) => c.productId === item.id)
      .reduce((sum, c) => sum + c.quantity, 0);

    return (
      <View
        className={`bg-surface rounded-card p-4 mb-3 border border-line shadow-sm flex-row items-center ${
          !isAvailable ? "opacity-70" : ""
        }`}
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        {/* Product Image / Placeholder */}
        <View className="w-20 h-20 rounded-chip bg-primary/10 items-center justify-center mr-3.5 border border-line overflow-hidden relative">
          {item.image && !failedImages[item.id] ? (
            <Image
              source={{ uri: item.image }}
              className="w-full h-full"
              resizeMode="cover"
              onError={() =>
                setFailedImages((prev) => ({ ...prev, [item.id]: true }))
              }
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

          {itemInCartCount > 0 && (
            <View className="absolute top-1 right-1 bg-primary rounded-full px-1.5 py-0.5">
              <Text className="text-[10px] font-heading-bold text-white">
                {itemInCartCount}x
              </Text>
            </View>
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

          <View className="flex-row items-center justify-between mt-1">
            <Text className="font-heading-bold text-primary text-base">
              {formatRupiah(item.price)}
            </Text>

            {isAvailable ? (
              <TouchableOpacity
                onPress={() => handleInitiateAddToCart(item)}
                activeOpacity={0.8}
                className="flex-row items-center bg-primary px-3 py-1.5 rounded-chip"
                accessibilityRole="button"
                accessibilityLabel={`Tambah ${item.name} ke keranjang`}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text className="font-body-semibold text-white text-xs ml-1">
                  Pesan
                </Text>
              </TouchableOpacity>
            ) : (
              <Badge
                label="Habis"
                tone="danger"
                icon={<Ionicons name="close-circle" size={12} color="#991B1B" />}
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
        subtitle="Jelajahi Menu & Pesan Mandiri"
        rightAction={
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Buka riwayat pesanan saya"
              onPress={() => router.push("/(customer)/orders")}
              className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-chip"
            >
              <Ionicons name="receipt-outline" size={16} color="#FFFFFF" />
              <Text className="font-body-medium text-white text-xs ml-1.5">
                Pesanan
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Buka profil saya"
              onPress={() => router.push("/(customer)/profile")}
              className="flex-row items-center bg-white/15 px-2.5 py-1.5 rounded-chip min-h-11"
            >
              <Ionicons name="person-circle-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
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
            paddingBottom: cart.length > 0 ? 100 : 40,
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

      {/* Floating Cart Capsule Bar */}
      {cart.length > 0 && (
        <View className="absolute bottom-5 left-4 right-4 items-center">
          <TouchableOpacity
            onPress={() => setCartModalVisible(true)}
            activeOpacity={0.9}
            className="bg-primary flex-row items-center justify-between px-5 py-3.5 rounded-full shadow-lg border border-red-700 w-full max-w-lg"
          >
            <View className="flex-row items-center">
              <View className="bg-white/20 w-8 h-8 rounded-full items-center justify-center mr-3">
                <Ionicons name="cart" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text className="text-white text-xs font-body">
                  {cartTotals.totalItems} Item di Keranjang
                </Text>
                <Text className="text-white text-base font-heading-bold">
                  {formatRupiah(cartTotals.total)}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center bg-white px-3.5 py-1.5 rounded-full">
              <Text className="text-primary font-heading-semibold text-xs mr-1">
                Buka Keranjang
              </Text>
              <Ionicons name="arrow-forward" size={14} color="#D1001F" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: Item Customization / Notes */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-surface rounded-card p-5 w-full max-w-sm border border-line shadow-xl">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="font-heading-semibold text-text text-base">
                Catatan Pesanan
              </Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="font-body-medium text-text text-sm mb-1">
              {selectedProduct?.name}
            </Text>
            <Text className="font-heading text-primary text-sm mb-3">
              {selectedProduct ? formatRupiah(selectedProduct.price) : ""}
            </Text>

            <TextInput
              value={itemNoteInput}
              onChangeText={setItemNoteInput}
              placeholder="Contoh: Less ice, less sweet, oat milk..."
              placeholderTextColor="#9CA3AF"
              className="bg-background border border-line rounded-chip px-3 py-2.5 font-body text-text text-sm mb-4"
              multiline
              numberOfLines={3}
            />

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setNoteModalVisible(false)}
                className="flex-1 bg-surface border border-line py-2.5 rounded-chip items-center"
              >
                <Text className="font-body-medium text-muted text-xs">
                  Batal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmAddToCart}
                className="flex-1 bg-primary py-2.5 rounded-chip items-center"
              >
                <Text className="font-body-semibold text-white text-xs">
                  Tambahkan (+1)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Cart & Checkout Sheet */}
      <Modal
        visible={cartModalVisible}
        animationType="slide"
        onRequestClose={() => setCartModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-background"
        >
          {/* Header Modal */}
          <View className="bg-primary px-5 py-4 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="cart" size={22} color="#FFFFFF" />
              <Text className="font-heading-bold text-white text-lg ml-2">
                Keranjang & Checkout
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setCartModalVisible(false)}
              className="p-1"
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Section 1: Daftar Item Keranjang */}
            <View className="flex-row justify-between items-center mb-2">
              <Text className="font-heading-semibold text-text text-base">
                Daftar Pesanan ({cart.length})
              </Text>
              {cart.length > 0 && (
                <TouchableOpacity onPress={handleClearCart}>
                  <Text className="font-body text-danger text-xs">
                    Kosongkan
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {cart.length === 0 ? (
              <EmptyState
                title="Keranjang Kosong"
                description="Belum ada menu yang Anda pilih."
              />
            ) : (
              <View className="bg-surface rounded-card border border-line p-3 mb-5 shadow-sm divide-y divide-line">
                {cart.map((item, idx) => (
                  <View key={`${item.productId}-${idx}`} className="py-3">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 mr-2">
                        <Text className="font-heading-semibold text-text text-sm">
                          {item.productName}
                        </Text>
                        <Text className="font-body text-primary text-xs mt-0.5">
                          {formatRupiah(item.unitPrice)}
                        </Text>
                        {item.notes ? (
                          <View className="bg-amber-50 rounded px-2 py-0.5 mt-1 self-start border border-amber-200">
                            <Text className="text-[11px] text-amber-800 font-body">
                              Catatan: {item.notes}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Quantity Controls */}
                      <View className="flex-row items-center bg-background rounded-chip border border-line p-0.5">
                        <TouchableOpacity
                          onPress={() =>
                            handleUpdateQuantity(item.productId, item.notes, -1)
                          }
                          className="w-7 h-7 rounded items-center justify-center bg-surface border border-line"
                        >
                          <Ionicons name="remove" size={14} color="#1F2937" />
                        </TouchableOpacity>

                        <Text className="font-heading-semibold text-text text-xs px-2.5">
                          {item.quantity}
                        </Text>

                        <TouchableOpacity
                          onPress={() =>
                            handleUpdateQuantity(item.productId, item.notes, 1)
                          }
                          className="w-7 h-7 rounded items-center justify-center bg-surface border border-line"
                        >
                          <Ionicons name="add" size={14} color="#1F2937" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-line/60">
                      <TouchableOpacity
                        onPress={() =>
                          handleRemoveItem(item.productId, item.notes)
                        }
                        className="flex-row items-center"
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                        <Text className="text-danger font-body text-xs ml-1">
                          Hapus
                        </Text>
                      </TouchableOpacity>

                      <Text className="font-heading text-text text-sm">
                        Subtotal: {formatRupiah(item.unitPrice * item.quantity)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Section 2: Formulir Checkout */}
            {cart.length > 0 && (
              <>
                <Text className="font-heading-semibold text-text text-base mb-2">
                  Detail Pemesanan
                </Text>

                <View className="bg-surface rounded-card border border-line p-4 mb-5 shadow-sm">
                  {/* Tipe Pesanan: Dine In vs Take Away */}
                  <Text className="font-body-medium text-text text-xs mb-1.5">
                    Tipe Pesanan
                  </Text>
                  <View className="flex-row gap-2 mb-3.5">
                    <TouchableOpacity
                      onPress={() => setOrderType("Dine In")}
                      className={`flex-1 py-2.5 rounded-chip border items-center flex-row justify-center ${
                        orderType === "Dine In"
                          ? "bg-primary border-primary"
                          : "bg-surface border-line"
                      }`}
                    >
                      <Ionicons
                        name="restaurant-outline"
                        size={16}
                        color={orderType === "Dine In" ? "#FFFFFF" : "#4B5563"}
                      />
                      <Text
                        className={`text-xs ml-1.5 ${
                          orderType === "Dine In"
                            ? "font-heading-semibold text-white"
                            : "font-body text-text"
                        }`}
                      >
                        Dine In (Makan di Tempat)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setOrderType("Take Away")}
                      className={`flex-1 py-2.5 rounded-chip border items-center flex-row justify-center ${
                        orderType === "Take Away"
                          ? "bg-primary border-primary"
                          : "bg-surface border-line"
                      }`}
                    >
                      <Ionicons
                        name="bag-handle-outline"
                        size={16}
                        color={orderType === "Take Away" ? "#FFFFFF" : "#4B5563"}
                      />
                      <Text
                        className={`text-xs ml-1.5 ${
                          orderType === "Take Away"
                            ? "font-heading-semibold text-white"
                            : "font-body text-text"
                        }`}
                      >
                        Take Away (Bungkus)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Nomor Meja jika Dine In */}
                  {orderType === "Dine In" && (
                    <View className="mb-3.5">
                      <Text className="font-body-medium text-text text-xs mb-1">
                        Nomor Meja (Opsional)
                      </Text>
                      <TextInput
                        value={tableNumber}
                        onChangeText={setTableNumber}
                        placeholder="Contoh: Meja 05 atau Meja Bar"
                        placeholderTextColor="#9CA3AF"
                        className="bg-background border border-line rounded-chip px-3 py-2 font-body text-text text-sm"
                      />
                    </View>
                  )}

                  {/* Nama Pemesan */}
                  <View className="mb-3.5">
                    <Text className="font-body-medium text-text text-xs mb-1">
                      Nama Pemesan <Text className="text-danger">*</Text>
                    </Text>
                    <TextInput
                      value={customerName}
                      onChangeText={setCustomerName}
                      placeholder="Masukkan nama Anda..."
                      placeholderTextColor="#9CA3AF"
                      className="bg-background border border-line rounded-chip px-3 py-2 font-body text-text text-sm"
                    />
                  </View>

                  {/* Metode Pembayaran: dibayar di kasir (Tunai / QRIS / Debit) */}
                  <Text className="font-body-medium text-text text-xs mb-1.5">
                    Metode Pembayaran
                  </Text>
                  <View className="flex-row gap-2 mb-3.5">
                    {PAYMENT_METHODS.map((method) => {
                      const meta = getPaymentMethodMeta(method);
                      const selected = paymentMethod === method;
                      return (
                        <TouchableOpacity
                          key={method}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setPaymentMethod(method)}
                          className={`flex-1 py-2.5 rounded-chip border items-center flex-row justify-center ${
                            selected ? "bg-primary border-primary" : "bg-surface border-line"
                          }`}
                        >
                          <Ionicons name={meta.icon} size={16} color={selected ? "#FFFFFF" : "#4B5563"} />
                          <Text
                            className={`text-xs ml-1.5 ${
                              selected ? "font-heading-semibold text-white" : "font-body text-text"
                            }`}
                          >
                            {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text className="font-body text-muted text-[11px] mb-3">
                    Pembayaran dikonfirmasi oleh kasir. Pesanan mulai disiapkan setelah pembayaran diterima.
                  </Text>

                  {/* Catatan Khusus Pesanan */}
                  <View>
                    <Text className="font-body-medium text-text text-xs mb-1">
                      Catatan Tambahan untuk Kasir / Barista
                    </Text>
                    <TextInput
                      value={orderNotes}
                      onChangeText={setOrderNotes}
                      placeholder="Contoh: Tolong sediakan sedotan kertas..."
                      placeholderTextColor="#9CA3AF"
                      className="bg-background border border-line rounded-chip px-3 py-2 font-body text-text text-sm"
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </View>

                {/* Section 3: Ringkasan Biaya & Konfirmasi */}
                <View className="bg-surface rounded-card border border-line p-4 mb-5 shadow-sm">
                  <Text className="font-heading-semibold text-text text-sm mb-3">
                    Ringkasan Tagihan
                  </Text>
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="font-body text-muted text-xs">
                      Subtotal ({cartTotals.totalItems} item)
                    </Text>
                    <Text className="font-body text-text text-xs">
                      {formatRupiah(cartTotals.subtotal)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-3">
                    <Text className="font-body text-muted text-xs">
                      Pajak & Layanan
                    </Text>
                    <Text className="font-body text-success text-xs">
                      Termasuk
                    </Text>
                  </View>
                  <View className="pt-2 border-t border-line flex-row justify-between items-center">
                    <Text className="font-heading-semibold text-text text-base">
                      Total Pembayaran
                    </Text>
                    <Text className="font-heading-bold text-primary text-xl">
                      {formatRupiah(cartTotals.total)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSubmitOrder}
                  disabled={submittingOrder}
                  activeOpacity={0.8}
                  className={`bg-primary py-3.5 rounded-card items-center justify-center shadow-md ${
                    submittingOrder ? "opacity-60" : ""
                  }`}
                >
                  <Text className="font-heading-bold text-white text-base">
                    {submittingOrder
                      ? "Memproses Pesanan..."
                      : "Konfirmasi & Buat Pesanan"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
