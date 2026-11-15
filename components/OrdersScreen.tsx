import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ScreenHeader } from './ScreenHeader';
import { Badge } from './Badge';
import { Button } from './Button';
import { LoadingState, EmptyState, ErrorState } from './States';
import { formatRupiah } from '../lib/formatters';
import {
  OrderStatus,
  OrderRecord,
  canTransitionOrderStatus,
  canCancelOrder,
  canConfirmPayment,
  buildPaymentConfirmationUpdate,
  getBulkCompletableOrders,
  isPaymentSettled,
  getCancellationPaymentStatus,
  getPaymentStatusMeta,
  getPaymentMethodMeta,
  validateCancellationPayload,
  filterOrderHistory,
  getOrderStatusBadgeTone,
  getOrderHistoryStartISO,
  canCorrectPaymentMethod,
  PAYMENT_METHODS,
  PaymentMethod,
  formatCountdown,
  getPaymentTimeLeftMs,
  isAwaitingCustomerPayment,
} from '../lib/order-logic';
import { useResponsive } from '../hooks/useResponsive';
import { useSheetBottomPadding } from '../hooks/useSheetPadding';
import { isHiddenFromKasir, isOnlineOrder } from '../lib/payment-gateway-logic';

interface OrderItemDetail {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
}

interface OrdersScreenProps {
  onOpenSidebar: () => void;
}

const PAGE_SIZE = 50;

/**
 * Riwayat & pengelolaan order — dipakai bersama oleh Kasir dan Admin (PRD 15.1, 19).
 * Admin juga dapat mengoreksi metode pembayaran order yang sudah lunas.
 */
export function OrdersScreen({ onOpenSidebar }: OrdersScreenProps) {
  const sheetPadBottom = useSheetBottomPadding(0);
  const { user } = useAuth();
  const { isTablet } = useResponsive();
  const router = useRouter();
  const { openOrderId } = useLocalSearchParams<{ openOrderId?: string }>();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  // Modal Detail Pesanan
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemDetail[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Modal Pembatalan & Refund
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Paginasi keyset (created_at) agar seluruh riwayat bisa ditelusuri tanpa batas 1000 baris.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(
    async (before: string | null) => {
      // Pesanan QRIS online yang belum lunas belum perlu ditangani kasir.
      let query = supabase.from('orders').select('*').or('payment_channel.eq.Kasir,payment_status.neq.Pending');
      const startISO = getOrderHistoryStartISO(dateFilter);
      if (startISO) query = query.gte('created_at', startISO);
      if (before) query = query.lt('created_at', before);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (error) throw error;
      const rows = (data as unknown as OrderRecord[]) || [];
      setHasMore(rows.length === PAGE_SIZE);
      return rows;
    },
    [dateFilter]
  );

  const fetchOrders = useCallback(async () => {
    try {
      setErrorMessage('');
      // Batalkan dulu pesanan customer yang melewati batas bayar 15 menit
      // (cadangan bila pg_cron belum aktif; gagal di sini tidak menghalangi daftar).
      await supabase.rpc('expire_unpaid_orders');
      setOrders(await loadPage(null));
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setErrorMessage(err?.message || 'Gagal memuat riwayat transaksi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPage]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || orders.length === 0) return;
    try {
      setLoadingMore(true);
      const older = await loadPage(orders[orders.length - 1].created_at);
      setOrders((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))]);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat memuat pesanan berikutnya.');
    } finally {
      setLoadingMore(false);
    }
  };

  // Muat ulang setiap kali halaman dibuka (tab tetap ter-mount di belakang).
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  // Realtime: pesanan customer baru & perubahan status langsung tampil tanpa tarik-refresh.
  useEffect(() => {
    const startISO = getOrderHistoryStartISO(dateFilter);
    const channel = supabase
      .channel(`staff-orders-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const row = payload.new as OrderRecord | null;
        if (!row?.id) return;
        if (isHiddenFromKasir(row)) return;
        if (payload.eventType === 'INSERT') {
          if (startISO && row.created_at < startISO) return;
          setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev : [row, ...prev]));
        } else if (payload.eventType === 'UPDATE') {
          setOrders((prev) => {
            if (prev.some((o) => o.id === row.id)) return prev.map((o) => (o.id === row.id ? { ...o, ...row } : o));
            // Pesanan online yang baru lunas muncul di daftar kasir.
            if (startISO && row.created_at < startISO) return prev;
            return [row, ...prev].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          });
          setSelectedOrder((prev) => (prev && prev.id === row.id ? { ...prev, ...row } : prev));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateFilter]);

  // Detik berjalan untuk hitung mundur batas bayar (hanya bila ada pesanan menunggu bayar).
  const [now, setNow] = useState(() => new Date());
  const hasAwaiting = orders.some((o) => isAwaitingCustomerPayment(o) && !!o.payment_due_at);
  useEffect(() => {
    if (!hasAwaiting) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [hasAwaiting]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleOpenDetail = async (order: OrderRecord) => {
    setSelectedOrder(order);
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id);

      if (error) throw error;
      setOrderItems((data as OrderItemDetail[]) || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
      Alert.alert('Gagal Memuat Detail', err?.message || 'Gagal mengambil rincian menu.');
    } finally {
      setLoadingItems(false);
    }
  };

  // Datang dari tombol "Pesanan masuk" atau banner: langsung tampilkan detail pesanan itu.
  useEffect(() => {
    if (!openOrderId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', openOrderId).maybeSingle();
      if (cancelled) return;
      router.setParams({ openOrderId: undefined });
      if (error || !data) {
        Alert.alert('Pesanan Tidak Ditemukan', error?.message || 'Pesanan mungkin sudah dibatalkan atau kedaluwarsa.');
        return;
      }
      handleOpenDetail(data as unknown as OrderRecord);
    })();
    return () => {
      cancelled = true;
    };
    // Hanya bereaksi pada parameter baru; handleOpenDetail dibuat ulang tiap render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId]);

  const handleUpdateStatus = async (nextStatus: OrderStatus) => {
    if (!selectedOrder) return;

    const userRole = (user?.role as 'Admin' | 'Kasir' | 'Customer') ?? 'Customer';
    const transitionCheck = canTransitionOrderStatus(
      selectedOrder.order_status,
      nextStatus,
      userRole,
      selectedOrder.payment_status
    );

    if (!transitionCheck.allowed) {
      Alert.alert('Transisi Tidak Diizinkan', transitionCheck.reason || 'Status tidak dapat diubah.');
      return;
    }

    try {
      setUpdatingStatus(true);
      const { error } = await supabase
        .from('orders')
        .update({
          order_status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      // Update state lokal
      const updated = {
        ...selectedOrder,
        order_status: nextStatus,
        updated_at: new Date().toISOString(),
      };
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? updated : o)));

      Alert.alert('Status Diperbarui', `Pesanan berhasil diubah menjadi '${nextStatus}'.`);
    } catch (err: any) {
      console.error('Error updating status:', err);
      Alert.alert('Gagal Mengubah Status', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmPayment = () => {
    if (!selectedOrder) return;
    const userRole = (user?.role as 'Admin' | 'Kasir' | 'Customer') ?? 'Customer';
    const check = canConfirmPayment(selectedOrder, userRole, new Date());
    if (!check.allowed) {
      Alert.alert('Tidak Dapat Dikonfirmasi', check.reason || 'Pembayaran tidak dapat dikonfirmasi.');
      return;
    }

    const update = buildPaymentConfirmationUpdate(selectedOrder);
    const methodHint =
      selectedOrder.payment_method === 'QRIS'
        ? 'Pastikan dana QRIS sudah masuk di aplikasi merchant.'
        : selectedOrder.payment_method === 'Debit'
        ? 'Pastikan transaksi kartu di mesin EDC sudah disetujui.'
        : 'Pastikan uang tunai sudah diterima.';

    Alert.alert(
      'Konfirmasi Pembayaran',
      `${formatRupiah(selectedOrder.total_amount)} via ${selectedOrder.payment_method}.\n${methodHint}`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Sudah Dibayar',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              const updatedAt = new Date().toISOString();
              const { error } = await supabase
                .from('orders')
                .update({ ...update, updated_at: updatedAt })
                .eq('id', selectedOrder.id);
              if (error) throw error;

              const updated: OrderRecord = { ...selectedOrder, ...update, updated_at: updatedAt };
              setSelectedOrder(updated);
              setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? updated : o)));
            } catch (err: any) {
              console.error('Error confirming payment:', err);
              Alert.alert('Gagal Konfirmasi Pembayaran', err?.message || 'Terjadi kesalahan sistem.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const bulkCompletable = getBulkCompletableOrders(orders);

  const handleBulkComplete = () => {
    if (bulkCompletable.length === 0) return;
    Alert.alert(
      'Selesaikan Pesanan Siap',
      `Tandai ${bulkCompletable.length} pesanan berstatus Ready (sudah lunas) sebagai Completed?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Selesaikan Semua',
          onPress: async () => {
            const ids = bulkCompletable.map((o) => o.id);
            try {
              setUpdatingStatus(true);
              const updatedAt = new Date().toISOString();
              const { error } = await supabase
                .from('orders')
                .update({ order_status: 'Completed', updated_at: updatedAt })
                .in('id', ids)
                .eq('order_status', 'Ready');
              if (error) throw error;

              setOrders((prev) =>
                prev.map((o) =>
                  ids.includes(o.id) ? { ...o, order_status: 'Completed', updated_at: updatedAt } : o
                )
              );
            } catch (err: any) {
              console.error('Error bulk completing orders:', err);
              Alert.alert('Gagal Menyelesaikan Pesanan', err?.message || 'Terjadi kesalahan sistem.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const handleCorrectPaymentMethod = () => {
    if (!selectedOrder) return;
    const role = (user?.role as 'Admin' | 'Kasir' | 'Customer') ?? 'Customer';
    const options = PAYMENT_METHODS.filter((m) => m !== selectedOrder.payment_method);

    const apply = async (method: PaymentMethod) => {
      const check = canCorrectPaymentMethod(selectedOrder, role, method);
      if (!check.allowed) {
        Alert.alert('Tidak Dapat Dikoreksi', check.reason || 'Koreksi tidak diizinkan.');
        return;
      }
      try {
        setUpdatingStatus(true);
        const { data, error } = await supabase
          .from('orders')
          .update({ payment_method: method, updated_at: new Date().toISOString() })
          .eq('id', selectedOrder.id)
          .select('*')
          .single();
        if (error) throw error;
        const updated = data as unknown as OrderRecord;
        setSelectedOrder(updated);
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        Alert.alert('Koreksi Tersimpan', `Metode pembayaran diubah menjadi ${method} dan tercatat di catatan pesanan.`);
      } catch (err: any) {
        Alert.alert('Gagal Mengoreksi', err?.message || 'Terjadi kesalahan sistem.');
      } finally {
        setUpdatingStatus(false);
      }
    };

    Alert.alert(
      'Koreksi Metode Pembayaran',
      `Tercatat: ${selectedOrder.payment_method}. Pilih metode yang benar.\nRekap kas sif yang masih aktif ikut menyesuaikan; sif yang sudah ditutup tidak berubah.`,
      [{ text: 'Batal', style: 'cancel' }, ...options.map((m) => ({ text: m, onPress: () => apply(m) }))]
    );
  };

  const handleOpenCancelModal = () => {
    if (!selectedOrder) return;
    const userRole = (user?.role as 'Admin' | 'Kasir' | 'Customer') ?? 'Customer';
    const check = canCancelOrder(selectedOrder, userRole);
    if (!check.canCancel) {
      Alert.alert('Tidak Dapat Dibatalkan', check.error || 'Pesanan tidak memenuhi syarat pembatalan.');
      return;
    }
    setCancellationReason('');
    setCancelModalVisible(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedOrder) return;

    const validation = validateCancellationPayload(cancellationReason);
    if (!validation.isValid) {
      Alert.alert('Alasan Belum Valid', validation.error || 'Harap masukkan alasan pembatalan.');
      return;
    }

    try {
      setCancellingOrder(true);
      const cancelledAt = new Date().toISOString();
      // PRD 17.1: Paid → Refunded; belum dibayar → status pembayaran tetap.
      const nextPaymentStatus = getCancellationPaymentStatus(selectedOrder.payment_status);

      const { error } = await supabase
        .from('orders')
        .update({
          order_status: 'Cancelled',
          payment_status: nextPaymentStatus,
          cancelled_by: user?.id || null,
          cancelled_at: cancelledAt,
          cancellation_reason: cancellationReason.trim(),
          updated_at: cancelledAt,
        })
        .eq('id', selectedOrder.id);

      if (error) throw error;

      const updated: OrderRecord = {
        ...selectedOrder,
        order_status: 'Cancelled',
        payment_status: nextPaymentStatus,
        cancelled_by: user?.id || null,
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason.trim(),
        updated_at: cancelledAt,
      };

      setSelectedOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? updated : o)));
      setCancelModalVisible(false);

      Alert.alert(
        'Pesanan Dibatalkan',
        `Pesanan ${selectedOrder.order_number} telah dibatalkan. Status pembayaran: ${getPaymentStatusMeta(nextPaymentStatus, 'Cancelled').label}.`
      );
    } catch (err: any) {
      console.error('Error cancelling order:', err);
      Alert.alert('Gagal Membatalkan Pesanan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const filteredOrders = filterOrderHistory(orders, {
    dateFilter,
    statusFilter,
    searchQuery,
  });

  return (
    <View className="flex-1 bg-background">
      {/* Header Utama Kasir */}
      <ScreenHeader
        title="Riwayat Transaksi"
        subtitle="Status Pesanan & Pembatalan"
        onOpenSidebar={onOpenSidebar}
        rightAction={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Muat Ulang Pesanan"
            onPress={fetchOrders}
            className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text className="font-heading-semibold text-white text-xs ml-1.5">Segarkan</Text>
          </TouchableOpacity>
        }
      />

      {/* Bar Filter Rentang Tanggal & Search Box */}
      <View className="p-3 bg-surface border-b border-line">
        {/* Search Input */}
        <View className="flex-row items-center bg-background border border-line-strong rounded-chip px-3 py-1.5 min-h-11 mb-2.5">
          <Ionicons name="search" size={16} color="#6B7280" />
          <TextInput
            placeholder="Cari no. order atau nama pelanggan..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 ml-2 font-body text-xs text-text py-1"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Periode Waktu */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row gap-1.5">
            {[
              { id: 'today', label: 'Hari Ini' },
              { id: '7days', label: '7 Hari' },
              { id: 'all', label: 'Semua' },
            ].map((period) => (
              <TouchableOpacity
                key={period.id}
                onPress={() => setDateFilter(period.id as any)}
                className={`px-3 py-1 rounded-chip border ${
                  dateFilter === period.id
                    ? 'bg-primary border-primary'
                    : 'bg-background border-line'
                }`}
              >
                <Text
                  className={`text-xs font-heading-semibold ${
                    dateFilter === period.id ? 'text-white' : 'text-muted'
                  }`}
                >
                  {period.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Counter Jumlah Data */}
          <Text className="font-body text-xs text-muted">
            {filteredOrders.length} Pesanan
          </Text>
        </View>

        {/* Aksi Massal: Selesaikan semua pesanan Ready yang sudah lunas */}
        {bulkCompletable.length > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Selesaikan semua pesanan siap"
            onPress={handleBulkComplete}
            disabled={updatingStatus}
            className="mt-2.5 py-2 rounded-chip bg-success flex-row items-center justify-center"
          >
            <Ionicons name="checkmark-done" size={15} color="#FFFFFF" />
            <Text className="font-heading-semibold text-white text-xs ml-1.5">
              Selesaikan {bulkCompletable.length} Pesanan Siap
            </Text>
          </TouchableOpacity>
        )}

        {/* Filter Status Pesanan */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row gap-1.5 mt-2.5"
        >
          {[
            { id: 'all', label: 'Semua Status' },
            { id: 'Pending', label: 'Menunggu' },
            { id: 'Processing', label: 'Diproses' },
            { id: 'Ready', label: 'Siap Disajikan' },
            { id: 'Completed', label: 'Selesai' },
            { id: 'Cancelled', label: 'Dibatalkan' },
          ].map((st) => (
            <TouchableOpacity
              key={st.id}
              onPress={() => setStatusFilter(st.id as any)}
              className={`px-2.5 py-1 rounded-chip border ${
                statusFilter === st.id
                  ? 'bg-text border-text'
                  : 'bg-background border-line'
              }`}
            >
              <Text
                className={`text-xs font-heading-semibold ${
                  statusFilter === st.id ? 'text-white' : 'text-muted'
                }`}
              >
                {st.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Konten Utama */}
      {loading ? (
        <LoadingState label="Memuat riwayat transaksi kasir..." />
      ) : errorMessage ? (
        <ErrorState message={errorMessage} onRetry={fetchOrders} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="Tidak Ada Pesanan"
          description="Tidak ditemukan riwayat pesanan yang sesuai dengan filter pencarian Anda."
          iconName="receipt-outline"
        />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          numColumns={isTablet ? 2 : 1}
          key={isTablet ? 'grid-2' : 'list-1'}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Muat pesanan berikutnya"
                onPress={loadMore}
                disabled={loadingMore}
                className="min-h-11 mx-1.5 mt-1 rounded-button border border-line bg-surface items-center justify-center"
              >
                <Text className="font-heading-semibold text-primary text-xs">
                  {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
          renderItem={({ item }) => {
            const tone = getOrderStatusBadgeTone(item.order_status);
            const dateObj = new Date(item.created_at);
            const timeStr = dateObj.toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateStr = dateObj.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
            });

            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Detail ${item.order_number}`}
                onPress={() => handleOpenDetail(item)}
                className={`flex-1 m-1.5 bg-surface border border-line rounded-card p-3.5 justify-between ${
                  item.order_status === 'Cancelled' ? 'bg-background' : ''
                }`}
              >
                {/* Header Kartu: Nomor Order & Badge Status */}
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 mr-2">
                    <Text className="font-heading-semibold text-text text-sm" numberOfLines={1}>
                      {item.order_number}
                    </Text>
                    <Text className="font-body text-muted text-xs mt-0.5">
                      {dateStr} • {timeStr}
                    </Text>
                  </View>
                  <Badge label={item.order_status} tone={tone} />
                </View>

                {/* Info Pelanggan & Tipe Pesanan */}
                <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-line/60">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
                    <Text className="font-body-medium text-text text-xs ml-1.5" numberOfLines={1}>
                      {item.customer_name || 'Pelanggan Umum'}
                    </Text>
                  </View>
                  {item.order_type ? (
                    <View className="bg-background px-2 py-0.5 rounded-chip border border-line">
                      <Text className="text-xs font-heading-semibold text-muted">{item.order_type}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Footer Kartu: Metode Bayar & Total Tagihan */}
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-wrap flex-1 mr-2">
                    <Ionicons
                      name={getPaymentMethodMeta(item.payment_method).icon}
                      size={15}
                      color="#6B7280"
                    />
                    <Text className="font-body text-muted text-xs ml-1">
                      {item.payment_method}
                    </Text>
                    {isOnlineOrder(item) && (
                      <Text className="text-xs font-heading-semibold text-primary ml-1.5">(Online)</Text>
                    )}
                    {item.payment_status === 'Refunded' && (
                      <Text className="text-xs font-heading-semibold text-danger ml-1.5">
                        (Dikembalikan)
                      </Text>
                    )}
                    {item.order_status !== 'Cancelled' && !isPaymentSettled(item.payment_status) && (
                      <Text className="text-xs font-heading-semibold text-warning ml-1.5">
                        (Belum Bayar)
                      </Text>
                    )}
                    <PaymentCountdown order={item} now={now} />
                  </View>
                  <Text className="font-heading-semibold text-primary text-sm">
                    {formatRupiah(item.total_amount)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal 1: Detail Pesanan Kasir */}
      <Modal
        visible={Boolean(selectedOrder)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View className={`flex-1 bg-black/60 items-center ${isTablet ? 'justify-center p-6' : 'justify-end'}`}>
          <View
            className={`bg-surface w-full border border-line ${isTablet ? 'rounded-card' : 'rounded-t-card'}`}
            style={{ maxWidth: isTablet ? 640 : undefined, maxHeight: isTablet ? '90%' : '92%', paddingBottom: isTablet ? 0 : sheetPadBottom }}
          >
            {/* Modal Header */}
            {selectedOrder && (
              <View className="px-4 pt-4 pb-3 border-b border-line flex-row justify-between items-start">
                <View className="flex-1 mr-2">
                  <Text className="font-heading text-text text-lg">
                    {selectedOrder.order_number}
                  </Text>
                  <Text className="font-body text-muted text-sm">
                    {[selectedOrder.order_type, selectedOrder.customer_name].filter(Boolean).join(' · ')}
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5 mt-2">
                    <Badge
                      label={selectedOrder.order_status}
                      tone={getOrderStatusBadgeTone(selectedOrder.order_status)}
                    />
                    <Badge {...getPaymentStatusMeta(selectedOrder.payment_status, selectedOrder.order_status)} />
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Tutup detail pesanan"
                  onPress={() => setSelectedOrder(null)}
                  className="w-11 h-11 -mr-2 -mt-1 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            )}

            {/* Modal Body Scroll */}
            {selectedOrder && (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ padding: 16 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Jika Dibatalkan, Tampilkan Alasan */}
                {selectedOrder.order_status === 'Cancelled' && (
                  <View className="p-3 rounded-chip bg-danger-soft mb-4">
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="alert-circle" size={16} color="#991B1B" />
                      <Text className="font-heading-semibold text-danger text-xs ml-1.5">
                        Pesanan Dibatalkan
                      </Text>
                    </View>
                    <Text className="font-body text-danger text-sm">
                      Alasan: {selectedOrder.cancellation_reason || 'Tidak ada keterangan'}
                    </Text>
                  </View>
                )}

                {/* List Menu Items (Snapshot) */}
                <Text className="font-body-semibold text-muted text-xs mb-1">Pesanan</Text>

                {loadingItems ? (
                  <LoadingState label="Memuat rincian menu..." />
                ) : (
                  <View className="mb-2">
                    {orderItems.map((item, idx) => (
                      <View
                        key={item.id || idx}
                        className={`py-2 ${idx !== orderItems.length - 1 ? 'border-b border-line' : ''}`}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text className="font-heading-semibold text-text text-sm flex-1 mr-2">
                            {item.quantity}x {item.product_name}
                          </Text>
                          <Text className="font-heading-semibold text-text text-sm">
                            {formatRupiah(item.subtotal)}
                          </Text>
                        </View>
                        {item.notes ? (
                          <Text className="font-body text-muted text-sm italic mt-0.5">
                            Catatan: {item.notes}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}

                {/* Ringkasan Finansial */}
                <View className="pt-3 border-t border-line">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="font-heading-semibold text-text text-base">Total</Text>
                    <Text className="font-heading text-primary text-xl">
                      {formatRupiah(selectedOrder.total_amount)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="font-body text-muted text-sm">Metode pembayaran</Text>
                    <Text className="font-body-medium text-text text-sm">
                      {selectedOrder.payment_method || '-'}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* Actions Footer */}
            {selectedOrder && (
              <View className="px-4 pt-3 pb-4 border-t border-line gap-2">
                {isAwaitingCustomerPayment(selectedOrder) && selectedOrder.payment_due_at && (
                  <View className="flex-row items-center justify-center">
                    <PaymentCountdown order={selectedOrder} now={now} long />
                  </View>
                )}

                {/* Konfirmasi Pembayaran (order customer / belum lunas) */}
                {selectedOrder.order_status !== 'Cancelled' &&
                  selectedOrder.order_status !== 'Completed' &&
                  selectedOrder.payment_status === 'Pending' && (
                    <Button
                      title={
                        updatingStatus
                          ? 'Menyimpan...'
                          : selectedOrder.order_status === 'Pending'
                          ? 'Konfirmasi Pembayaran & Proses'
                          : 'Konfirmasi Pembayaran'
                      }
                      disabled={updatingStatus}
                      onPress={handleConfirmPayment}
                      icon={<Ionicons name="wallet-outline" size={16} color="#FFFFFF" />}
                    />
                  )}

                {/* Order Pending yang sudah lunas: langsung terima & proses */}
                {selectedOrder.order_status === 'Pending' &&
                  isPaymentSettled(selectedOrder.payment_status) && (
                    <Button
                      title={updatingStatus ? 'Menyimpan...' : 'Terima & Proses Pesanan'}
                      disabled={updatingStatus}
                      onPress={() => handleUpdateStatus('Processing')}
                      icon={<Ionicons name="cafe-outline" size={16} color="#FFFFFF" />}
                    />
                  )}

                {/* Aksi Perubahan Status Alur Normal */}
                {selectedOrder.order_status === 'Processing' && (
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        title={updatingStatus ? 'Menyimpan...' : 'Tandai Siap (Ready)'}
                        disabled={updatingStatus}
                        onPress={() => handleUpdateStatus('Ready')}
                        icon={<Ionicons name="notifications-outline" size={16} color="#FFFFFF" />}
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        title={updatingStatus ? 'Menyimpan...' : 'Selesaikan'}
                        variant="success"
                        disabled={updatingStatus}
                        onPress={() => handleUpdateStatus('Completed')}
                        icon={<Ionicons name="checkmark-done" size={16} color="#FFFFFF" />}
                      />
                    </View>
                  </View>
                )}

                {selectedOrder.order_status === 'Ready' && (
                  <Button
                    title={updatingStatus ? 'Menyimpan...' : 'Selesaikan Pesanan'}
                    variant="success"
                    disabled={updatingStatus}
                    onPress={() => handleUpdateStatus('Completed')}
                    icon={<Ionicons name="checkmark-done" size={18} color="#FFFFFF" />}
                  />
                )}

                {/* Koreksi metode pembayaran (Admin, PRD 15.1) */}
                {user?.role === 'Admin' && selectedOrder.payment_status === 'Paid' && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Koreksi metode pembayaran"
                    onPress={handleCorrectPaymentMethod}
                    disabled={updatingStatus}
                    className="min-h-11 py-2.5 rounded-button border border-line bg-background items-center justify-center flex-row"
                  >
                    <Ionicons name="swap-horizontal-outline" size={16} color="#1F2937" />
                    <Text className="font-heading-semibold text-text text-xs ml-1.5">
                      Koreksi Metode Pembayaran
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Tombol Batalkan & Refund (jika bukan Completed/Cancelled) */}
                {selectedOrder.order_status !== 'Completed' &&
                  selectedOrder.order_status !== 'Cancelled' && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Batalkan Pesanan & Refund"
                      onPress={handleOpenCancelModal}
                      className="min-h-11 rounded-button border border-danger/30 bg-danger-soft items-center justify-center flex-row"
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#991B1B" />
                      <Text className="font-heading-semibold text-danger text-xs ml-1.5">
                        Batalkan Pesanan & Refund
                      </Text>
                    </TouchableOpacity>
                  )}
                {/* TODO: tombol cetak ulang struk ditambahkan kembali setelah printer thermal tersambung. */}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal 2: Konfirmasi Pembatalan & Alasan Refund */}
      <Modal
        visible={cancelModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1 bg-black/60 justify-center items-center p-4"
        >
          <View className="bg-surface w-full max-w-md rounded-card p-5 border border-line shadow-xl">
            <View className="items-center mb-3">
              <View className="w-12 h-12 rounded-full bg-danger-soft items-center justify-center mb-2 border border-danger/30">
                <Ionicons name="warning-outline" size={24} color="#991B1B" />
              </View>
              <Text className="font-heading text-text text-base">Batalkan Pesanan?</Text>
              <Text className="font-body text-muted text-xs text-center mt-1">
                Tindakan ini tidak dapat dibatalkan. Jika pesanan sudah dibayar, pembayaran ditandai Dikembalikan (refund).
              </Text>
            </View>

            <View className="mb-4">
              <Text className="font-heading-semibold text-text text-xs mb-1.5">
                Alasan Pembatalan <Text className="text-danger">*</Text>
              </Text>
              <TextInput
                placeholder="Contoh: Pelanggan salah pesan / minta batalkan"
                placeholderTextColor="#6B7280"
                value={cancellationReason}
                onChangeText={setCancellationReason}
                multiline
                numberOfLines={3}
                style={{ height: 75, textAlignVertical: 'top' }}
                className="bg-background border border-line-strong rounded-chip p-2.5 text-xs font-body text-text"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setCancelModalVisible(false)}
                className="flex-1 min-h-11 rounded-button border border-line bg-background items-center justify-center"
              >
                <Text className="font-heading-semibold text-text text-xs">Kembali</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancel}
                disabled={cancellingOrder}
                className="flex-1 min-h-11 rounded-button bg-danger items-center justify-center"
              >
                <Text className="font-heading-semibold text-white text-xs">
                  {cancellingOrder ? 'Membatalkan...' : 'Ya, Batalkan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Sisa waktu bayar pesanan customer (batas 15 menit). */
function PaymentCountdown({ order, now, long = false }: { order: OrderRecord; now: Date; long?: boolean }) {
  const left = getPaymentTimeLeftMs(order, now);
  if (left === null) return null;
  const expired = left <= 0;
  return (
    <Text
      accessibilityLiveRegion={expired ? "polite" : "none"}
      className={`font-heading-semibold ${long ? 'text-xs' : 'text-xs ml-1.5'} ${
        expired ? 'text-danger' : left < 3 * 60_000 ? 'text-warning' : 'text-muted'
      }`}
    >
      {expired
        ? long
          ? 'Batas bayar habis. Pesanan akan dibatalkan otomatis'
          : 'Kedaluwarsa'
        : long
        ? `Sisa waktu bayar ${formatCountdown(left)}`
        : `Sisa ${formatCountdown(left)}`}
    </Text>
  );
}
