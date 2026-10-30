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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useKasirSidebar } from '../../components/SidebarDrawer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { LoadingState, EmptyState, ErrorState } from '../../components/States';
import { formatRupiah } from '../../lib/formatters';
import {
  OrderStatus,
  OrderRecord,
  canTransitionOrderStatus,
  canCancelOrder,
  validateCancellationPayload,
  filterOrderHistory,
  getOrderStatusBadgeTone,
} from '../../lib/order-logic';
import { useResponsive } from '../../hooks/useResponsive';

interface OrderItemDetail {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
}

export default function KasirOrdersScreen() {
  const { user } = useAuth();
  const { openSidebar } = useKasirSidebar();
  const { isTablet } = useResponsive();

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

  const fetchOrders = useCallback(async () => {
    try {
      setErrorMessage('');
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setOrders((data as unknown as OrderRecord[]) || []);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setErrorMessage(err?.message || 'Gagal memuat riwayat transaksi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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

  const handleUpdateStatus = async (nextStatus: OrderStatus) => {
    if (!selectedOrder) return;

    const userRole = (user?.role as 'Admin' | 'Kasir' | 'Customer') ?? 'Customer';
    const transitionCheck = canTransitionOrderStatus(
      selectedOrder.order_status,
      nextStatus,
      userRole
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
      const nextPaymentStatus =
        selectedOrder.payment_status === 'Lunas' || selectedOrder.payment_status === 'Paid'
          ? 'Refunded'
          : 'Batal';

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
        payment_status: nextPaymentStatus as any,
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
        `Pesanan ${selectedOrder.order_number} telah dibatalkan. Status pembayaran dicatat sebagai ${nextPaymentStatus}.`
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
        onOpenSidebar={openSidebar}
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
        <View className="flex-row items-center bg-background border border-line rounded-chip px-3 py-1.5 mb-2.5">
          <Ionicons name="search" size={16} color="#9CA3AF" />
          <TextInput
            placeholder="Cari no. order atau nama pelanggan..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 ml-2 font-body text-xs text-text py-1"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
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
                className={`text-[11px] font-heading-semibold ${
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
                className={`flex-1 m-1.5 bg-surface border border-line rounded-card p-3.5 shadow-sm justify-between ${
                  item.order_status === 'Cancelled' ? 'bg-slate-50/80' : ''
                }`}
              >
                {/* Header Kartu: Nomor Order & Badge Status */}
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 mr-2">
                    <Text className="font-heading-semibold text-text text-sm" numberOfLines={1}>
                      {item.order_number}
                    </Text>
                    <Text className="font-body text-muted text-[11px] mt-0.5">
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
                  <View className="bg-background px-2 py-0.5 rounded-chip border border-line">
                    <Text className="text-[10px] font-heading-semibold text-muted">
                      {item.order_type || 'Dine In'}
                    </Text>
                  </View>
                </View>

                {/* Footer Kartu: Metode Bayar & Total Tagihan */}
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center">
                    <Ionicons
                      name={item.payment_method === 'Tunai' ? 'cash-outline' : 'qr-code-outline'}
                      size={15}
                      color="#6B7280"
                    />
                    <Text className="font-body text-muted text-xs ml-1">
                      {item.payment_method}
                    </Text>
                    {item.payment_status === 'Refunded' && (
                      <Text className="text-[10px] font-heading-semibold text-rose-600 ml-1.5">
                        (Refunded)
                      </Text>
                    )}
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
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View className="flex-1 bg-black/60 justify-end md:justify-center items-center">
          <View className="bg-surface w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90%] border border-line flex-col">
            {/* Modal Header */}
            {selectedOrder && (
              <View className="p-4 border-b border-line flex-row justify-between items-center">
                <View>
                  <Text className="font-heading-semibold text-text text-base">
                    {selectedOrder.order_number}
                  </Text>
                  <Text className="font-body text-muted text-xs">
                    {selectedOrder.order_type} • {selectedOrder.customer_name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-full bg-background border border-line"
                >
                  <Ionicons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            )}

            {/* Modal Body Scroll */}
            {selectedOrder && (
              <ScrollView className="p-4 flex-1" showsVerticalScrollIndicator={false}>
                {/* Status Banner */}
                <View className="flex-row justify-between items-center p-3 rounded-card bg-background border border-line mb-3.5">
                  <View>
                    <Text className="font-body text-muted text-xs">Status Pesanan:</Text>
                    <Text className="font-heading-semibold text-text text-sm">
                      {selectedOrder.order_status}
                    </Text>
                  </View>
                  <Badge
                    label={selectedOrder.order_status}
                    tone={getOrderStatusBadgeTone(selectedOrder.order_status)}
                  />
                </View>

                {/* Jika Dibatalkan, Tampilkan Alasan */}
                {selectedOrder.order_status === 'Cancelled' && (
                  <View className="p-3 rounded-card bg-rose-50 border border-rose-200 mb-3.5">
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="alert-circle" size={16} color="#DC2626" />
                      <Text className="font-heading-semibold text-rose-700 text-xs ml-1.5">
                        Pesanan Dibatalkan
                      </Text>
                    </View>
                    <Text className="font-body text-rose-900 text-xs">
                      Alasan: {selectedOrder.cancellation_reason || 'Tidak ada keterangan'}
                    </Text>
                    <Text className="font-body text-rose-700 text-[11px] mt-1">
                      Status Refund: {selectedOrder.payment_status}
                    </Text>
                  </View>
                )}

                {/* List Menu Items (Snapshot) */}
                <Text className="font-heading-semibold text-text text-xs mb-2">
                  Daftar Menu yang Dipesan
                </Text>

                {loadingItems ? (
                  <LoadingState label="Memuat rincian menu..." />
                ) : (
                  <View className="bg-background rounded-card p-2 border border-line mb-3.5">
                    {orderItems.map((item, idx) => (
                      <View
                        key={item.id || idx}
                        className={`p-2 ${
                          idx !== orderItems.length - 1 ? 'border-b border-line/60' : ''
                        }`}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text className="font-heading-semibold text-text text-xs flex-1 mr-2">
                            {item.quantity}x {item.product_name}
                          </Text>
                          <Text className="font-heading-semibold text-text text-xs">
                            {formatRupiah(item.subtotal)}
                          </Text>
                        </View>
                        {item.notes ? (
                          <Text className="font-body text-muted text-[11px] italic mt-0.5">
                            * {item.notes}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}

                {/* Ringkasan Finansial */}
                <View className="bg-background rounded-card p-3 border border-line mb-4">
                  <View className="flex-row justify-between mb-1">
                    <Text className="font-body text-muted text-xs">Total Tagihan:</Text>
                    <Text className="font-heading-semibold text-primary text-sm">
                      {formatRupiah(selectedOrder.total_amount)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-1">
                    <Text className="font-body text-muted text-xs">Metode Pembayaran:</Text>
                    <Text className="font-body-medium text-text text-xs">
                      {selectedOrder.payment_method}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="font-body text-muted text-xs">Status Pembayaran:</Text>
                    <Text
                      className={`font-heading-semibold text-xs ${
                        selectedOrder.payment_status === 'Refunded'
                          ? 'text-rose-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {selectedOrder.payment_status}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* Actions Footer */}
            {selectedOrder && (
              <View className="p-4 border-t border-line bg-surface flex-col gap-2">
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
                      <TouchableOpacity
                        onPress={() => handleUpdateStatus('Completed')}
                        disabled={updatingStatus}
                        className="h-11 bg-emerald-600 rounded-button items-center justify-center flex-row"
                      >
                        <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                        <Text className="font-heading-semibold text-white text-xs ml-1.5">
                          Selesaikan
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {selectedOrder.order_status === 'Ready' && (
                  <Button
                    title={updatingStatus ? 'Menyimpan...' : 'Selesaikan Pesanan (Completed)'}
                    disabled={updatingStatus}
                    onPress={() => handleUpdateStatus('Completed')}
                    icon={<Ionicons name="checkmark-done" size={18} color="#FFFFFF" />}
                  />
                )}

                {/* Tombol Batalkan & Refund (jika bukan Completed/Cancelled) */}
                {selectedOrder.order_status !== 'Completed' &&
                  selectedOrder.order_status !== 'Cancelled' && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Batalkan Pesanan & Refund"
                      onPress={handleOpenCancelModal}
                      className="py-2.5 rounded-button border border-rose-300 bg-rose-50 items-center justify-center flex-row"
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                      <Text className="font-heading-semibold text-rose-700 text-xs ml-1.5">
                        Batalkan Pesanan & Refund
                      </Text>
                    </TouchableOpacity>
                  )}
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 bg-black/60 justify-center items-center p-4"
        >
          <View className="bg-surface w-full max-w-md rounded-card p-5 border border-line shadow-2xl">
            <View className="items-center mb-3">
              <View className="w-12 h-12 rounded-full bg-rose-500/10 items-center justify-center mb-2 border border-rose-500/20">
                <Ionicons name="warning-outline" size={24} color="#DC2626" />
              </View>
              <Text className="font-heading text-text text-base">Batalkan Pesanan?</Text>
              <Text className="font-body text-muted text-xs text-center mt-1">
                Tindakan ini tidak dapat dibatalkan. Status pembayaran akan ditandai Refunded.
              </Text>
            </View>

            <View className="mb-4">
              <Text className="font-heading-semibold text-text text-xs mb-1.5">
                Alasan Pembatalan <Text className="text-rose-600">*</Text>
              </Text>
              <TextInput
                placeholder="Contoh: Pelanggan salah pesan / minta batalkan"
                placeholderTextColor="#9CA3AF"
                value={cancellationReason}
                onChangeText={setCancellationReason}
                multiline
                numberOfLines={3}
                style={{ height: 75, textAlignVertical: 'top' }}
                className="bg-background border border-line rounded-chip p-2.5 text-xs font-body text-text"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setCancelModalVisible(false)}
                className="flex-1 py-2.5 rounded-button border border-line bg-background items-center justify-center"
              >
                <Text className="font-heading-semibold text-text text-xs">Kembali</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancel}
                disabled={cancellingOrder}
                className="flex-1 py-2.5 rounded-button bg-rose-600 items-center justify-center"
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
