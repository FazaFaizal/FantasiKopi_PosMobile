import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Badge } from "../../components/Badge";
import { LoadingState, EmptyState, ErrorState } from "../../components/States";
import { formatRupiah } from "../../lib/formatters";
import { useResponsive } from "../../hooks/useResponsive";
import {
  OrderRecord,
  OrderStatus,
  getPaymentMethodMeta,
  getPaymentStatusMeta,
  canCustomerCancelOrder,
  validateCancellationPayload,
  describeCancellation,
  formatCountdown,
  getPaymentTimeLeftMs,
  isPaymentExpired,
  CUSTOMER_PAYMENT_TIMEOUT_MINUTES,
  ONLINE_PAYMENT_TIMEOUT_MINUTES,
} from "../../lib/order-logic";
import { isOnlineOrder } from "../../lib/payment-gateway-logic";
import { openOnlinePayment } from "../../lib/online-payment";
import { getCustomerOrderStatusMeta } from "../../lib/customer-order-logic";

interface OrderItemDetail {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
}

interface OrderWithItems extends OrderRecord {
  order_items?: OrderItemDetail[];
}

export default function CustomerOrdersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isTablet } = useResponsive();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [errorMessage, setErrorMessage] = useState("");

  // Selected Order for Receipt Details Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // #6: pembatalan oleh customer (selama Pending & belum dibayar)
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // Pesanan QRIS online yang sedang dibuka halaman bayarnya
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    const allowed = canCustomerCancelOrder(selectedOrder);
    if (!allowed.allowed) {
      Alert.alert("Tidak Dapat Dibatalkan", allowed.reason || "Pesanan tidak dapat dibatalkan.");
      return;
    }
    const valid = validateCancellationPayload(cancelReason);
    if (!valid.isValid) {
      Alert.alert("Alasan Belum Diisi", valid.error || "Isi alasan pembatalan.");
      return;
    }
    try {
      setCancelling(true);
      const { error } = await supabase.rpc("cancel_my_order", {
        p_order_id: selectedOrder.id,
        p_reason: cancelReason.trim(),
      });
      if (error) throw error;
      setCancelMode(false);
      setCancelReason("");
      setDetailModalVisible(false);
      Alert.alert("Pesanan Dibatalkan", `Pesanan ${selectedOrder.order_number} telah dibatalkan.`);
      fetchOrders();
    } catch (err: any) {
      // Mis. kasir baru saja mengonfirmasi pembayaran → database menolak pembatalan.
      Alert.alert("Gagal Membatalkan", err?.message || "Terjadi kesalahan.");
      fetchOrders();
    } finally {
      setCancelling(false);
    }
  };

  const userId = user?.id;

  const fetchOrders = useCallback(async () => {
    if (!userId) return;
    try {
      setErrorMessage("");
      // Pesanan yang melewati batas bayar 15 menit dibatalkan dulu (cadangan bila pg_cron belum aktif).
      await supabase.rpc("expire_unpaid_orders");
      // PRD Section 26: Customer hanya dapat melihat Order yang berkaitan dengan User Account miliknya.
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders((data as OrderWithItems[]) || []);
    } catch (err: any) {
      console.error("Error fetching customer orders:", err);
      setErrorMessage(err?.message || "Gagal memuat pesanan. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchOrders();

    // Realtime subscription for customer's orders
    if (!userId) return;
    const channel = supabase
      .channel(`customer-orders-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, userId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  // Hitung mundur batas bayar; saat waktu habis, muat ulang agar pesanan tampil dibatalkan.
  const [now, setNow] = useState(() => new Date());
  const hasAwaiting = orders.some((o) => getPaymentTimeLeftMs(o) !== null);
  useEffect(() => {
    if (!hasAwaiting) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [hasAwaiting]);
  const lastExpiryRefresh = useRef(0);
  useEffect(() => {
    if (!orders.some((o) => isPaymentExpired(o, now))) return;
    if (Date.now() - lastExpiryRefresh.current < 15_000) return;
    lastExpiryRefresh.current = Date.now();
    fetchOrders();
  }, [now, orders, fetchOrders]);

  const handleOpenDetail = async (order: OrderWithItems) => {
    setSelectedOrder(order);
    setDetailModalVisible(true);

    // If order_items are not already attached or empty, fetch them explicitly
    if (!order.order_items || order.order_items.length === 0) {
      setLoadingItems(true);
      try {
        const { data: items, error } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", order.id);

        if (!error && items) {
          setSelectedOrder((prev) => (prev ? { ...prev, order_items: items } : null));
        }
      } catch (err) {
        console.error("Error loading order items:", err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  // Filter Active vs History
  const activeOrders = orders.filter((o) =>
    ["Pending", "Processing", "Ready"].includes(o.order_status)
  );

  const historyOrders = orders.filter((o) =>
    ["Completed", "Cancelled"].includes(o.order_status)
  );

  const displayedOrders = activeTab === "active" ? activeOrders : historyOrders;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // Status Stepper Component
  const handlePayOnline = async (order: OrderWithItems) => {
    setPayingOrderId(order.id);
    // Layar Bayar QRIS (di dalam aplikasi) mengikuti status lunas dari webhook Midtrans.
    const result = await openOnlinePayment(order.id);
    setPayingOrderId(null);
    if (!result.ok) {
      Alert.alert("Pembayaran Online", result.error);
      fetchOrders();
    }
  };

  const renderPaymentDeadline = (order: OrderWithItems) => {
    const left = getPaymentTimeLeftMs(order, now);
    if (left === null) return null;
    const expired = left <= 0;
    const online = isOnlineOrder(order);
    const limitMinutes = online ? ONLINE_PAYMENT_TIMEOUT_MINUTES : CUSTOMER_PAYMENT_TIMEOUT_MINUTES;
    const dueTime = order.payment_due_at
      ? new Date(order.payment_due_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : "-";
    return (
      <View
        accessibilityLiveRegion="polite"
        className={`rounded-card p-3 mb-2 border flex-row items-center ${
          expired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        }`}
      >
        <Ionicons name={expired ? "alert-circle" : "time-outline"} size={20} color={expired ? "#DC2626" : "#B45309"} />
        <View className="ml-2 flex-1">
          <Text className={`font-heading-semibold text-xs ${expired ? "text-danger" : "text-amber-800"}`}>
            {expired
              ? "Batas bayar habis"
              : online
              ? `Selesaikan pembayaran QRIS sebelum ${dueTime}`
              : `Bayar di kasir sebelum ${dueTime}`}
          </Text>
          <Text className={`font-body text-[11px] ${expired ? "text-red-700" : "text-amber-800"}`}>
            {expired
              ? "Pesanan dibatalkan otomatis. Silakan pesan kembali."
              : `Sisa waktu ${formatCountdown(left)} · lewat ${limitMinutes} menit pesanan dibatalkan otomatis.`}
          </Text>
          {online && !expired && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Bayar pesanan ${order.order_number} dengan QRIS online`}
              onPress={() => handlePayOnline(order)}
              disabled={payingOrderId === order.id}
              className="mt-2 min-h-11 bg-primary rounded-chip flex-row items-center justify-center px-3"
            >
              <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" />
              <Text className="font-heading-semibold text-white text-xs ml-1.5">
                {payingOrderId === order.id ? "Membuka pembayaran..." : "Bayar Sekarang (QRIS)"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderStatusStepper = (order: OrderWithItems) => {
    const status: OrderStatus = order.order_status;
    if (status === "Cancelled") {
      const cancellation = describeCancellation(order, userId);
      return (
        <View className="bg-red-50 border border-red-200 rounded-card p-3 my-2 flex-row items-center">
          <Ionicons name="close-circle" size={20} color="#DC2626" />
          <View className="ml-2 flex-1">
            <Text className="font-heading-semibold text-danger text-xs">
              {cancellation.title}
            </Text>
            <Text className="font-body text-red-700 text-[11px]">
              {cancellation.detail}
            </Text>
          </View>
        </View>
      );
    }

    const currentMeta = getCustomerOrderStatusMeta(status);
    const steps = [
      { step: 1, label: "Menunggu" },
      { step: 2, label: "Diracik" },
      { step: 3, label: "Siap" },
      { step: 4, label: "Selesai" },
    ];

    return (
      <View className="my-3">
        {/* Step indicator line & icons */}
        <View className="flex-row items-center justify-between px-2 relative">
          <View className="absolute left-6 right-6 top-3 h-0.5 bg-line -z-10" />
          {steps.map((item) => {
            const isCompleted = item.step < currentMeta.step;
            const isCurrent = item.step === currentMeta.step;

            return (
              <View key={item.step} className="items-center">
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
                    isCurrent
                      ? "bg-primary border-primary"
                      : isCompleted
                      ? "bg-emerald-600 border-emerald-600"
                      : "bg-surface border-line"
                  }`}
                >
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                  ) : (
                    <Text
                      className={`text-[10px] font-heading-bold ${
                        isCurrent ? "text-white" : "text-muted"
                      }`}
                    >
                      {item.step}
                    </Text>
                  )}
                </View>
                <Text
                  className={`text-[10px] mt-1 ${
                    isCurrent
                      ? "font-heading-semibold text-primary"
                      : isCompleted
                      ? "font-body-medium text-text"
                      : "font-body text-muted"
                  }`}
                >
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Current status description banner */}
        <View className="bg-primary/5 border border-primary/20 rounded-chip p-2.5 mt-2.5 flex-row items-center">
          <Ionicons name="information-circle" size={16} color="#D1001F" />
          <Text className="font-body text-text text-xs ml-1.5 flex-1">
            {currentMeta.description}
          </Text>
        </View>
      </View>
    );
  };

  const renderOrderItem = ({ item }: { item: OrderWithItems }) => {
    const meta = getCustomerOrderStatusMeta(item.order_status);

    return (
      <View className="bg-surface rounded-card p-4 mb-3 border border-line shadow-sm">
        {/* Order Header */}
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1 mr-2">
            <Text className="font-heading-bold text-text text-sm">
              {item.order_number}
            </Text>
            <Text className="font-body text-muted text-xs mt-0.5">
              {formatDate(item.created_at)}
            </Text>
          </View>
          <Badge label={meta.label} tone={meta.tone} />
        </View>

        {/* Order Type & Payment Pill */}
        <View className="flex-row gap-2 mb-2">
          <View className="bg-background rounded-chip px-2.5 py-1 border border-line flex-row items-center">
            <Ionicons
              name={item.order_type === "Take Away" ? "bag-handle-outline" : "restaurant-outline"}
              size={12}
              color="#4B5563"
            />
            <Text className="font-body-medium text-text text-xs ml-1">
              {item.order_type || "Dine In"}
            </Text>
          </View>

          <View className="bg-background rounded-chip px-2.5 py-1 border border-line flex-row items-center">
            <Ionicons
              name={getPaymentMethodMeta(item.payment_method).icon}
              size={12}
              color="#4B5563"
            />
            <Text className="font-body-medium text-text text-xs ml-1">
              {item.payment_method}
            </Text>
          </View>
        </View>

        {/* Batas bayar di kasir (pesanan belum dibayar) */}
        {renderPaymentDeadline(item)}

        {/* Progress Stepper for Active Orders */}
        {renderStatusStepper(item)}

        {/* Order Footer with Total & Detail Action */}
        <View className="pt-3 border-t border-line flex-row justify-between items-center mt-1">
          <View>
            <Text className="font-body text-muted text-[11px]">Total Tagihan</Text>
            <Text className="font-heading-bold text-primary text-base">
              {formatRupiah(item.total_amount)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => handleOpenDetail(item)}
            activeOpacity={0.8}
            className="flex-row items-center bg-surface border border-line px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="receipt-outline" size={14} color="#D1001F" />
            <Text className="font-heading-semibold text-primary text-xs ml-1.5">
              Detail Nota
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Pesanan Saya"
        subtitle="Lacak Status & Riwayat Pemesanan"
        rightAction={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Kembali ke katalog menu"
            onPress={() => router.back()}
            className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="cafe-outline" size={16} color="#FFFFFF" />
            <Text className="font-body-medium text-white text-xs ml-1.5">
              Menu
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Tab Switcher: Pesanan Aktif vs Riwayat Selesai */}
      <View
        className="px-4 pt-3 pb-2"
        style={isTablet ? { maxWidth: 800, width: "100%", alignSelf: "center" } : undefined}
      >
        <View className="flex-row bg-surface rounded-card p-1 border border-line shadow-sm">
          <TouchableOpacity
            onPress={() => setActiveTab("active")}
            activeOpacity={0.8}
            className={`flex-1 py-2 rounded-chip items-center justify-center flex-row ${
              activeTab === "active" ? "bg-primary" : "bg-transparent"
            }`}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={activeTab === "active" ? "#FFFFFF" : "#4B5563"}
            />
            <Text
              className={`text-xs ml-1.5 ${
                activeTab === "active"
                  ? "font-heading-semibold text-white"
                  : "font-body-medium text-text"
              }`}
            >
              Pesanan Aktif ({activeOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("history")}
            activeOpacity={0.8}
            className={`flex-1 py-2 rounded-chip items-center justify-center flex-row ${
              activeTab === "history" ? "bg-primary" : "bg-transparent"
            }`}
          >
            <Ionicons
              name="checkmark-done-outline"
              size={14}
              color={activeTab === "history" ? "#FFFFFF" : "#4B5563"}
            />
            <Text
              className={`text-xs ml-1.5 ${
                activeTab === "history"
                  ? "font-heading-semibold text-white"
                  : "font-body-medium text-text"
              }`}
            >
              Riwayat Selesai ({historyOrders.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Orders List */}
      {loading ? (
        <LoadingState label="Memuat riwayat pesanan..." />
      ) : (
        <FlatList
          data={displayedOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 40,
            maxWidth: 800,
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
          ListEmptyComponent={
            errorMessage ? (
              <ErrorState message={errorMessage} onRetry={fetchOrders} />
            ) : (
            <EmptyState
              title={
                activeTab === "active"
                  ? "Tidak Ada Pesanan Aktif"
                  : "Belum Ada Riwayat Pesanan"
              }
              description={
                activeTab === "active"
                  ? "Anda belum memiliki pesanan yang sedang diproses. Silakan pilih menu di katalog."
                  : "Pesanan yang telah selesai atau dibatalkan akan tercatat di sini."
              }
              actionLabel={activeTab === "active" ? "Buka Katalog Menu" : undefined}
              onAction={activeTab === "active" ? () => router.push("/(customer)/product") : undefined}
            />
            )
          }
        />
      )}

      {/* Modal Detail Nota */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setDetailModalVisible(false);
          setCancelMode(false);
        }}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-surface rounded-card p-5 w-full max-w-md border border-line shadow-2xl max-h-[85%]">
            {/* Header Modal */}
            <View className="flex-row justify-between items-center pb-3 border-b border-line mb-3">
              <View>
                <Text className="font-heading-bold text-text text-base">
                  Nota Pesanan
                </Text>
                <Text className="font-body text-primary text-xs">
                  {selectedOrder?.order_number}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                className="p-1"
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Order Meta Info */}
              <View className="bg-background rounded-card p-3 border border-line mb-4">
                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Waktu</Text>
                  <Text className="font-body text-text text-xs">
                    {selectedOrder ? formatDate(selectedOrder.created_at) : "-"}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Pemesan</Text>
                  <Text className="font-body text-text text-xs">
                    {selectedOrder?.customer_name || user?.email}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Tipe Pesanan</Text>
                  <Text className="font-body text-text text-xs">
                    {selectedOrder?.order_type || "Dine In"}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Metode Bayar</Text>
                  <Text className="font-body text-text text-xs">
                    {selectedOrder?.payment_method} ·{" "}
                    {selectedOrder
                      ? getPaymentStatusMeta(selectedOrder.payment_status, selectedOrder.order_status).label
                      : ""}
                  </Text>
                </View>

                {selectedOrder?.notes && (
                  <View className="mt-1 pt-1 border-t border-line/60">
                    <Text className="font-body text-muted text-[11px]">
                      Catatan: {selectedOrder.notes}
                    </Text>
                  </View>
                )}
              </View>

              {/* Items List */}
              <Text className="font-heading-semibold text-text text-sm mb-2">
                Rincian Menu
              </Text>

              {loadingItems ? (
                <LoadingState label="Memuat rincian..." />
              ) : selectedOrder?.order_items && selectedOrder.order_items.length > 0 ? (
                <View className="bg-surface rounded-card border border-line p-3 mb-4 divide-y divide-line">
                  {selectedOrder.order_items.map((item, idx) => (
                    <View key={item.id || idx} className="py-2.5">
                      <View className="flex-row justify-between">
                        <Text className="font-heading-semibold text-text text-xs flex-1 mr-2">
                          {item.product_name}
                        </Text>
                        <Text className="font-heading text-text text-xs">
                          {formatRupiah(item.subtotal)}
                        </Text>
                      </View>
                      <View className="flex-row justify-between mt-0.5">
                        <Text className="font-body text-muted text-[11px]">
                          {item.quantity} x {formatRupiah(item.unit_price)}
                        </Text>
                      </View>
                      {item.notes && (
                        <Text className="text-[11px] text-amber-700 font-body mt-0.5">
                          • {item.notes}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-muted text-xs italic mb-4">
                  Tidak ada rincian item.
                </Text>
              )}

              {/* Total Calculation */}
              <View className="bg-background rounded-card p-3 border border-line mb-4">
                <View className="flex-row justify-between items-center">
                  <Text className="font-heading-bold text-text text-sm">
                    Total Pembayaran
                  </Text>
                  <Text className="font-heading-bold text-primary text-base">
                    {selectedOrder ? formatRupiah(selectedOrder.total_amount) : "Rp 0"}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {selectedOrder && canCustomerCancelOrder(selectedOrder).allowed && (
              cancelMode ? (
                <View className="mt-2 bg-rose-50 border border-rose-200 rounded-card p-3">
                  <Text className="font-heading-semibold text-rose-700 text-xs mb-1.5">Alasan pembatalan</Text>
                  <TextInput
                    accessibilityLabel="Alasan pembatalan pesanan"
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="Contoh: Salah pilih menu"
                    placeholderTextColor="#9CA3AF"
                    className="bg-surface border border-line rounded-chip px-3 py-2 font-body text-text text-sm mb-2"
                  />
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setCancelMode(false)}
                      className="flex-1 min-h-11 bg-surface border border-line rounded-chip items-center justify-center"
                    >
                      <Text className="font-heading-semibold text-text text-xs">Tidak Jadi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Konfirmasi batalkan pesanan"
                      onPress={handleCancelOrder}
                      disabled={cancelling}
                      className="flex-1 min-h-11 bg-rose-600 rounded-chip items-center justify-center"
                    >
                      <Text className="font-heading-semibold text-white text-xs">
                        {cancelling ? "Membatalkan..." : "Ya, Batalkan"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Batalkan pesanan ini"
                  onPress={() => setCancelMode(true)}
                  className="mt-2 min-h-11 border border-rose-300 bg-rose-50 rounded-chip items-center justify-center flex-row"
                >
                  <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                  <Text className="font-heading-semibold text-rose-700 text-xs ml-1.5">
                    Batalkan Pesanan (belum dibayar)
                  </Text>
                </TouchableOpacity>
              )
            )}

            <View className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    "Simpan / Cetak Nota",
                    `Nota digital untuk pesanan ${selectedOrder?.order_number} berhasil disiapkan.\n(Koneksi printer fisik akan dihubungkan nanti).`,
                    [{ text: "OK" }]
                  );
                }}
                className="flex-1 bg-surface border border-line py-3 rounded-chip items-center flex-row justify-center"
              >
                <Ionicons name="print-outline" size={16} color="#1F2937" />
                <Text className="font-heading-semibold text-text text-xs ml-1.5">
                  Cetak Nota
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                className="flex-1 bg-primary py-3 rounded-chip items-center justify-center"
              >
                <Text className="font-heading-semibold text-white text-xs">
                  Tutup
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
