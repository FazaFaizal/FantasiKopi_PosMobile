import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Pressable,
} from "react-native";
import { Badge } from "../../components/Badge";
import { ScreenHeader } from "../../components/ScreenHeader";
import { LoadingState, EmptyState, ErrorState } from "../../components/States";
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
  syncCartWithProducts,
  getServerTotalNotice,
  getProductDetailView,
  checkCustomerCartChange,
  findBlockingUnpaidOrder,
  CUSTOMER_MAX_UNPAID_ORDERS,
} from "../../lib/customer-order-logic";
import { calculateCartTotals, buildCreateOrderParams, CreatedOrder } from "../../lib/pos-logic";
import {
  CUSTOMER_PAYMENT_TIMEOUT_MINUTES,
  ONLINE_PAYMENT_TIMEOUT_MINUTES,
  OrderRecord,
} from "../../lib/order-logic";
import {
  CUSTOMER_PAYMENT_OPTIONS,
  CustomerPaymentOption,
  getCustomerPaymentOption,
} from "../../lib/payment-gateway-logic";
import { openOnlinePayment } from "../../lib/online-payment";

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
  const [menuError, setMenuError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  // Detail menu yang sedang ditahan (tampil selama jari menekan kartu)
  const [peekProduct, setPeekProduct] = useState<ProductWithCategory | null>(null);

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
  // Pilihan bayar: QRIS online (Midtrans) atau bayar di kasir (Tunai / QRIS / Debit).
  const [paymentOptionKey, setPaymentOptionKey] = useState<CustomerPaymentOption["key"]>("online_qris");
  const paymentOption = getCustomerPaymentOption(paymentOptionKey);
  const paymentMethod = paymentOption.method;
  const [orderNotes, setOrderNotes] = useState("");

  // Keranjang terbaru untuk sinkronisasi setelah menu dimuat ulang.
  const cartRef = useRef<CustomerCartItem[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Pesanan yang belum dibayar (maks. 1 per customer; ditegakkan juga oleh create_order).
  const [blockingOrder, setBlockingOrder] = useState<Pick<OrderRecord, "order_number"> | null>(null);
  const userId = user?.id;
  const refreshBlockingOrder = useCallback(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("orders")
      .select("order_number, order_status, payment_status, payment_due_at")
      .eq("user_id", userId)
      .eq("order_status", "Pending")
      .eq("payment_status", "Pending");
    if (error) return null; // database tetap menolak bila memang masih ada pesanan
    const found = findBlockingUnpaidOrder((data as OrderRecord[]) || []);
    setBlockingOrder(found);
    return found;
  }, [userId]);

  const fetchData = useCallback(async () => {
    try {
      setMenuError("");
      // 1. Fetch active categories
      const { data: catData, error: catError } = await supabase
        .from("categories")
        .select("*")
        .eq("status", "Aktif")
        .order("name", { ascending: true });

      if (catError) throw catError;
      setCategories(catData || []);

      // 2. Produk aktif saja (nonaktif tidak ditampilkan; produk habis tetap tampil tapi tidak bisa dipesan)
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .select("*, category:categories(*)")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (prodError) throw prodError;
      const latest = (prodData as ProductWithCategory[]) || [];
      setProducts(latest);

      // Harga & ketersediaan di keranjang mengikuti menu terbaru (database menagih harga terbaru).
      const synced = syncCartWithProducts(cartRef.current, latest);
      if (synced.changes.length > 0) {
        setCart(synced.cart);
        Alert.alert("Keranjang Diperbarui", synced.changes.join("\n"));
      }
    } catch (err: any) {
      console.error("Error fetching customer menu:", err);
      setMenuError(err?.message || "Gagal memuat menu. Periksa koneksi internet Anda.");
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
      if (item.is_active === false) return false;
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

    const limit = checkCustomerCartChange(cart, selectedProduct.id, 1);
    if (!limit.allowed) {
      Alert.alert("Batas Pesanan", limit.reason || "Batas pesanan tercapai.");
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
    if (delta > 0) {
      const limit = checkCustomerCartChange(cart, productId, delta);
      if (!limit.allowed) {
        Alert.alert("Batas Pesanan", limit.reason || "Batas pesanan tercapai.");
        return;
      }
    }
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

    const blocking = await refreshBlockingOrder();
    if (blocking) {
      Alert.alert(
        "Masih Ada Pesanan Belum Dibayar",
        `Pesanan ${blocking.order_number} belum dibayar. Bayar di kasir atau batalkan dulu sebelum membuat pesanan baru.`,
        [
          { text: "Tutup", style: "cancel" },
          { text: "Lihat Pesanan", onPress: () => router.push("/(customer)/orders") },
        ]
      );
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
          paymentChannel: paymentOption.channel,
        })
      );
      if (orderErr) throw orderErr;
      const newOrder = created as unknown as CreatedOrder;
      const totalNotice = getServerTotalNotice(cartTotals.total, Number(newOrder.total_amount));
      const dueTime = newOrder.payment_due_at
        ? new Date(newOrder.payment_due_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        : null;

      // 5. Success Flow
      setCart([]);
      refreshBlockingOrder();
      setCartModalVisible(false);
      setTableNumber("");
      setOrderNotes("");

      if (paymentOption.channel === "Online") {
        // QRIS online: buka halaman bayar Midtrans; pesanan diproses otomatis setelah lunas.
        if (totalNotice) Alert.alert("Total Disesuaikan", totalNotice);
        // Halaman bayar Midtrans dibuka di dalam aplikasi (layar Bayar QRIS).
        const result = await openOnlinePayment(newOrder.id);
        if (!result.ok) {
          Alert.alert(
            "Pembayaran Online Belum Bisa Dibuka",
            `${result.error}\nPesanan ${newOrder.order_number} dibatalkan otomatis bila tidak dibayar dalam ${ONLINE_PAYMENT_TIMEOUT_MINUTES} menit.`
          );
          router.push("/(customer)/orders");
        }
        return;
      }

      Alert.alert(
        "Pesanan Berhasil Dibuat!",
        `Nomor Pesanan: ${newOrder.order_number}\nTotal: ${formatRupiah(Number(newOrder.total_amount))}\n` +
          (totalNotice ? `${totalNotice}\n` : "") +
          "\n" +
          (paymentMethod === "QRIS"
            ? "Scan QRIS kedai di kasir lalu tunjukkan bukti pembayaran."
            : paymentMethod === "Debit"
            ? "Silakan bayar dengan kartu debit di kasir."
            : "Silakan bayar tunai di kasir.") +
          `\nBayar di kasir dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit${dueTime ? ` (sebelum ${dueTime})` : ""}; lewat dari itu pesanan dibatalkan otomatis.` +
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
      // Mis. menu baru saja habis / harga berubah → muat ulang menu agar keranjang tersinkron.
      fetchData();
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
      // Tahan kartu untuk melihat detail menu; lepas untuk menutup (PRD 25: Product Detail).
      <Pressable
        onLongPress={() => setPeekProduct(item)}
        onPressOut={() => setPeekProduct(null)}
        delayLongPress={300}
        accessibilityHint="Tahan untuk melihat detail menu"
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
      </Pressable>
    );
  };

  const renderPeekDetail = () => {
    if (!peekProduct) return null;
    const detail = getProductDetailView(peekProduct);
    return (
      // pointerEvents="none": overlay tidak merebut sentuhan, sehingga saat jari dilepas
      // kartu menu tetap menerima onPressOut dan detail langsung tertutup.
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 }}
        className="bg-black/50 items-center justify-center px-6"
      >
        <View className="bg-surface rounded-card w-full max-w-sm overflow-hidden border border-line shadow-xl">
          <View className="w-full h-56 bg-primary/10 items-center justify-center">
            {peekProduct.image && !failedImages[peekProduct.id] ? (
              <Image source={{ uri: peekProduct.image }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Ionicons name="cafe-outline" size={64} color="#D1001F" />
            )}
          </View>
          <View className="p-4">
            <View className="flex-row items-start justify-between mb-1">
              <Text className="font-heading-bold text-text text-lg flex-1 mr-2">{peekProduct.name}</Text>
              <Badge label={detail.statusLabel} tone={detail.tone} />
            </View>
            {peekProduct.category ? (
              <Text className="font-body text-muted text-xs mb-2">{peekProduct.category.name}</Text>
            ) : null}
            <Text className="font-heading-bold text-primary text-xl mb-2">{formatRupiah(peekProduct.price)}</Text>
            <Text className="font-body text-text text-sm leading-5">{detail.description}</Text>
            {!detail.canOrder ? (
              <Text className="font-body text-danger text-xs mt-2">Menu ini sedang habis dan belum dapat dipesan.</Text>
            ) : null}
            <Text className="font-body text-muted text-[11px] text-center mt-3">Lepaskan untuk menutup</Text>
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
            menuError ? (
              <ErrorState message={menuError} onRetry={onRefresh} />
            ) : (
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
            )
          }
        />
      )}

      {/* Floating Cart Capsule Bar */}
      {cart.length > 0 && (
        <View className="absolute bottom-5 left-4 right-4 items-center">
          <TouchableOpacity
            onPress={() => {
              setCartModalVisible(true);
              refreshBlockingOrder();
            }}
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
                          accessibilityRole="button"
                          accessibilityLabel={`Kurangi ${item.productName}`}
                          onPress={() =>
                            handleUpdateQuantity(item.productId, item.notes, -1)
                          }
                          className="w-11 h-11 rounded-chip items-center justify-center bg-surface border border-line"
                        >
                          <Ionicons name="remove" size={14} color="#1F2937" />
                        </TouchableOpacity>

                        <Text className="font-heading-semibold text-text text-xs px-2.5">
                          {item.quantity}
                        </Text>

                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Tambah ${item.productName}`}
                          onPress={() =>
                            handleUpdateQuantity(item.productId, item.notes, 1)
                          }
                          className="w-11 h-11 rounded-chip items-center justify-center bg-surface border border-line"
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

                  {/* Pilihan bayar: QRIS online (Midtrans) atau bayar di kasir */}
                  <Text className="font-body-medium text-text text-xs mb-1.5">
                    Cara Pembayaran
                  </Text>
                  <View className="gap-2 mb-3.5">
                    {CUSTOMER_PAYMENT_OPTIONS.map((option) => {
                      const selected = paymentOptionKey === option.key;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => setPaymentOptionKey(option.key)}
                          className={`min-h-12 px-3 py-2.5 rounded-chip border flex-row items-center ${
                            selected ? "bg-primary/10 border-primary" : "bg-surface border-line"
                          }`}
                        >
                          <Ionicons
                            name={option.icon as keyof typeof Ionicons.glyphMap}
                            size={18}
                            color={selected ? "#D1001F" : "#4B5563"}
                          />
                          <View className="flex-1 ml-2.5">
                            <Text className={`text-xs ${selected ? "font-heading-semibold text-primary" : "font-body-medium text-text"}`}>
                              {option.label}
                            </Text>
                            <Text className="font-body text-muted text-[11px]">{option.description}</Text>
                          </View>
                          <Ionicons
                            name={selected ? "radio-button-on" : "radio-button-off"}
                            size={18}
                            color={selected ? "#D1001F" : "#9CA3AF"}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text className="font-body text-muted text-[11px] mb-3">
                    {paymentOption.channel === "Online"
                      ? `Selesaikan pembayaran QRIS dalam ${ONLINE_PAYMENT_TIMEOUT_MINUTES} menit; pesanan langsung disiapkan setelah lunas.`
                      : `Bayar di kasir dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit; pesanan disiapkan setelah kasir mengonfirmasi pembayaran.`}
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

                {blockingOrder && (
                  <View className="bg-amber-50 border border-amber-200 rounded-card p-3 mb-3">
                    <Text className="font-heading-semibold text-amber-800 text-xs">
                      Pesanan {blockingOrder.order_number} belum dibayar
                    </Text>
                    <Text className="font-body text-amber-800 text-[11px] mt-0.5">
                      Satu akun hanya boleh punya {CUSTOMER_MAX_UNPAID_ORDERS} pesanan yang belum dibayar. Bayar di kasir atau
                      batalkan pesanan tersebut dulu.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleSubmitOrder}
                  disabled={submittingOrder || !!blockingOrder}
                  accessibilityState={{ disabled: submittingOrder || !!blockingOrder }}
                  activeOpacity={0.8}
                  className={`bg-primary py-3.5 rounded-card items-center justify-center shadow-md ${
                    submittingOrder || blockingOrder ? "opacity-60" : ""
                  }`}
                >
                  <Text className="font-heading-bold text-white text-base">
                    {submittingOrder
                      ? "Memproses Pesanan..."
                      : paymentOption.channel === "Online"
                      ? "Buat Pesanan & Bayar QRIS"
                      : "Konfirmasi & Buat Pesanan"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {renderPeekDetail()}
    </View>
  );
}
