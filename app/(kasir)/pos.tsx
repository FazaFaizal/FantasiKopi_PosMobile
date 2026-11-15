import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingState, EmptyState, ErrorState } from '../../components/States';
import { useKasirSidebar } from '../../components/SidebarDrawer';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRupiah } from '../../lib/formatters';
import {
  CartItem,
  PosProduct,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  updateCartItemNotes,
  calculateCartTotals,
  calculateCashChange,
  getQuickCashSuggestions,
  validateOrderPayload,
  filterPosProducts,
  buildCreateOrderParams,
  CreatedOrder,
} from '../../lib/pos-logic';
import { isPosLocked } from '../../lib/shift-logic';
import type { PaymentMethod } from '../../lib/order-logic';
import { ShiftRequiredNotice } from '../../components/ShiftRequiredNotice';
import { IncomingOrdersButton } from '../../components/IncomingOrdersButton';
import { toggleProductAvailability } from '../../lib/product-logic';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'Tunai', label: 'Tunai', icon: 'cash-outline' },
  { value: 'QRIS', label: 'QRIS', icon: 'qr-code-outline' },
  { value: 'Debit', label: 'Debit', icon: 'card-outline' },
];

interface CategoryItem {
  id: string;
  name: string;
}

export default function KasirPOS() {
  const { signOut, user } = useAuth();
  const { openSidebar, incoming, openOrder } = useKasirSidebar();
  const { isTablet, width } = useResponsive();
  // Panel keranjang tablet: 38% layar, minimal 360px, maksimal 440px.
  const cartPanelWidth = Math.min(440, Math.max(360, Math.round(width * 0.38)));
  const insets = useSafeAreaInsets();

  // State Produk & Kategori
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  // Foto yang gagal dimuat (URL rusak / offline) diganti ikon pengganti.
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // State Keranjang Belanja & Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [orderType, setOrderType] = useState<'Dine In' | 'Take Away'>('Dine In');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tunai');
  const [cashGivenText, setCashGivenText] = useState('');
  // Langkah bayar tunai: uang diterima diisi di modal setelah menekan Bayar.
  const [cashModalVisible, setCashModalVisible] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // State Modal Catatan Item
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [selectedCartItemForNotes, setSelectedCartItemForNotes] = useState<CartItem | null>(null);
  const [tempNotes, setTempNotes] = useState('');

  // State Modal Struk Transaksi Sukses
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: string;
    customerName: string;
    cashierName: string;
    totalAmount: number;
    paymentMethod: PaymentMethod;
    orderType: 'Dine In' | 'Take Away';
    orderStatus: 'Processing';
    cashGiven: number;
    change: number;
    items: CartItem[];
    createdAt: string;
  } | null>(null);

  // Fetch Produk dan Kategori dari Supabase
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      const [catRes, prodRes] = await Promise.all([
        supabase.from('categories').select('id, name, status').order('name', { ascending: true }),
        supabase
          .from('products')
          .select('id, name, price, category_id, status, is_active, image')
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;

      const activeCategories = (catRes.data || []).filter((c) => c.status === 'Aktif');
      setCategories(activeCategories);
      setProducts(prodRes.data || []);
    } catch (err: any) {
      console.error('Error fetching POS data:', err);
      setErrorMessage(err.message || 'Gagal memuat katalog produk kasir.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sif kasir: POS terkunci sampai ada sif aktif (diperiksa ulang setiap layar difokuskan)
  const [openShift, setOpenShift] = useState<{ id: string; status: string } | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const fetchOpenShift = useCallback(async () => {
    setShiftLoading(true);
    const { data, error } = await supabase
      .from('cash_shifts')
      .select('id, status')
      .eq('status', 'Open')
      .maybeSingle();
    if (error) console.error('Error fetching open shift:', error);
    setOpenShift(data ?? null);
    setShiftLoading(false);
  }, []);
  useFocusEffect(
    useCallback(() => {
      fetchOpenShift();
    }, [fetchOpenShift])
  );
  const posLocked = isPosLocked(openShift);

  // Filter Produk Sesuai Kategori dan Input Pencarian
  const filteredProducts = useMemo(() => {
    return filterPosProducts(products, selectedCategory, searchQuery);
  }, [products, selectedCategory, searchQuery]);

  // Kalkulasi Total Keranjang
  const { totalItems, total } = useMemo(() => {
    return calculateCartTotals(cart);
  }, [cart]);

  // Kalkulasi Pembayaran Tunai
  const cashGivenNumber = useMemo(() => {
    const parsed = parseInt(cashGivenText.replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) ? 0 : parsed;
  }, [cashGivenText]);

  const cashCalculation = useMemo(() => {
    return calculateCashChange(total, cashGivenNumber);
  }, [total, cashGivenNumber]);

  // Saran Uang Pas / Pecahan Uang
  const quickCashSuggestions = useMemo(() => {
    return getQuickCashSuggestions(total);
  }, [total]);

  // Ketersediaan menu oleh Kasir (hanya kolom status yang boleh diubah).
  type Availability = 'Tersedia' | 'Tidak Tersedia';
  // Produk yang statusnya akan diubah; modal konfirmasi tampil selama tidak null.
  const [statusConfirm, setStatusConfirm] = useState<PosProduct | null>(null);

  const saveProductStatus = async (product: PosProduct, from: Availability, to: Availability): Promise<boolean> => {
    try {
      setTogglingProductId(product.id);
      // Optimistic update pada antarmuka kasir
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: to } : p)));
      const { error } = await supabase.from('products').update({ status: to }).eq('id', product.id);
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Error toggling product status:', err);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: from } : p)));
      Alert.alert('Gagal Mengubah Status', err?.message || 'Terjadi kesalahan saat memperbarui status produk.');
      return false;
    } finally {
      setTogglingProductId(null);
    }
  };

  const getAvailability = (product: PosProduct): Availability =>
    product.status === 'Tidak Tersedia' ? 'Tidak Tersedia' : 'Tersedia';

  // Mengetuk pil hanya membuka konfirmasi; status baru berubah setelah dikonfirmasi.
  const handleToggleProductStatus = (product: PosProduct) => setStatusConfirm(product);

  const handleConfirmProductStatus = async () => {
    if (!statusConfirm) return;
    const product = statusConfirm;
    const current = getAvailability(product);
    setStatusConfirm(null);
    await saveProductStatus(product, current, toggleProductAvailability(current) as Availability);
  };

  // Handler Keranjang
  const handleAddToCart = (product: PosProduct) => {
    // Produk habis ter-disable di kartu; status hanya diubah lewat toggle di pojok kartu.
    if (product.status === 'Tidak Tersedia') return;
    setCart((prevCart) => addToCart(prevCart, product));
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prevCart) => updateCartItemQuantity(prevCart, productId, delta));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prevCart) => removeFromCart(prevCart, productId));
  };

  const handleOpenNotesModal = (item: CartItem) => {
    setSelectedCartItemForNotes(item);
    setTempNotes(item.notes || '');
    setNotesModalVisible(true);
  };

  const handleSaveNotes = () => {
    if (selectedCartItemForNotes) {
      setCart((prevCart) =>
        updateCartItemNotes(prevCart, selectedCartItemForNotes.productId, tempNotes)
      );
    }
    setNotesModalVisible(false);
    setSelectedCartItemForNotes(null);
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    Alert.alert('Kosongkan Keranjang', 'Apakah Anda yakin ingin membatalkan semua item di keranjang?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Kosongkan',
        style: 'destructive',
        onPress: () => {
          setCart([]);
          setCashGivenText('');
          setCustomerName('');
        },
      },
    ]);
  };

  // Handler Checkout & Pembayaran
  const handleProcessOrder = async () => {
    const payload = {
      cart,
      paymentMethod,
      cashGiven: cashGivenNumber,
      customerName: customerName.trim(),
    };

    const validation = validateOrderPayload(payload);
    if (!validation.isValid) {
      Alert.alert('Transaksi Belum Lengkap', validation.error || 'Periksa kembali data pesanan.');
      return;
    }

    try {
      setSubmittingOrder(true);
      const cashierIdentifier = user?.email || 'Kasir Kedai';

      // Order & item disimpan atomik oleh database (create_order): harga, total,
      // nomor order, dan status Paid/Processing ditentukan server.
      const { data: created, error: orderError } = await supabase.rpc(
        'create_order',
        buildCreateOrderParams(cart, {
          customerName: customerName.trim() || 'Pelanggan Umum',
          orderType,
          paymentMethod,
          notes: paymentMethod === 'Tunai' ? `Bayar: ${formatRupiah(cashGivenNumber)}` : `Pembayaran ${paymentMethod}`,
        })
      );
      if (orderError) throw orderError;
      const orderData = created as unknown as CreatedOrder;

      // 3. Simpan data untuk Struk Transaksi Digital
      setCompletedOrder({
        orderNumber: orderData.order_number,
        customerName: customerName.trim() || 'Pelanggan Umum',
        cashierName: cashierIdentifier,
        totalAmount: Number(orderData.total_amount),
        paymentMethod,
        orderType,
        orderStatus: 'Processing',
        cashGiven: paymentMethod === 'Tunai' ? cashGivenNumber : total,
        change: paymentMethod === 'Tunai' ? cashCalculation.change : 0,
        items: [...cart],
        createdAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      });

      // 4. Bersihkan state keranjang dan buka Struk
      setCart([]);
      setCashGivenText('');
      setCustomerName('');
      setCartModalVisible(false);
      setCashModalVisible(false);
      setReceiptModalVisible(true);
    } catch (err: any) {
      console.error('Error completing order:', err);
      Alert.alert('Gagal Memproses Transaksi', err.message || 'Terjadi kesalahan sistem saat menyimpan order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari sesi kasir?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: signOut },
    ]);
  };

  // Render Konten Keranjang (Dipakai di Tablet Panel atau Smartphone Modal)
  const renderCartContent = (inModal = false) => (
    <View className="flex-1 bg-surface">
      {/* Header Keranjang / Pembayaran: HP memakai header layar penuh, tablet satu baris ringkas */}
      {inModal ? (
        <ScreenHeader
          title="Keranjang"
          subtitle={`${totalItems} item · ${formatRupiah(total)}`}
          onClose={() => setCartModalVisible(false)}
          showNetworkStatus={false}
          rightAction={
            cart.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Kosongkan keranjang"
                onPress={handleClearCart}
                className="w-11 h-11 items-center justify-center bg-white/15 rounded-chip"
              >
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <View className="px-4 py-2 border-b border-line flex-row justify-between items-center bg-surface min-h-14">
          <Text className="font-heading-semibold text-text text-base">
            Keranjang <Text className="font-body text-muted text-sm">· {totalItems} item</Text>
          </Text>
          {cart.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Kosongkan keranjang"
              onPress={handleClearCart}
              className="w-11 h-11 items-center justify-center rounded-chip"
            >
              <Ionicons name="trash-outline" size={18} color="#991B1B" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tipe pesanan & meja/nama pelanggan dalam satu baris */}
      <View className="px-3 py-2 bg-background border-b border-line flex-row items-center gap-2">
        <View className="flex-row bg-surface border border-line rounded-chip p-0.5" accessibilityRole="radiogroup">
          {(['Dine In', 'Take Away'] as const).map((type) => {
            const selected = orderType === type;
            return (
              <TouchableOpacity
                key={type}
                accessibilityRole="radio"
                accessibilityLabel={type}
                accessibilityState={{ selected }}
                onPress={() => setOrderType(type)}
                className={`px-3 min-h-11 justify-center rounded-chip ${selected ? 'bg-primary' : 'bg-transparent'}`}
              >
                <Text className={`text-xs font-heading-semibold ${selected ? 'text-white' : 'text-text'}`}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Nomor meja atau nama pelanggan, opsional"
          placeholder={orderType === 'Dine In' ? 'Meja / nama' : 'Nama pelanggan'}
          placeholderTextColor="#6B7280"
          value={customerName}
          onChangeText={setCustomerName}
          className="flex-1 bg-surface border border-line-strong rounded-chip px-3 min-h-11 font-body text-text"
          style={{ fontSize: 14, paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }}
        />
      </View>

      {/* List Item Keranjang */}
      {cart.length === 0 ? (
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="cafe-outline" size={48} color="#CBD5E1" />
          <Text className="font-heading-semibold text-text text-sm mt-3">Keranjang Masih Kosong</Text>
          <Text className="font-body text-muted text-xs text-center mt-1">
            Pilih menu kopi atau snack dari katalog di samping untuk memulai pesanan.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          // Padding di wadah isi agar kartu terakhir tidak menempel ke garis footer saat digulir ke bawah.
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {cart.map((item) => (
            <View
              key={item.productId}
              className="bg-surface border border-line rounded-card p-3 mb-2.5"
            >
              {/* Ketuk nama/harga untuk menambah atau mengubah catatan; catatan hanya tampil bila ada */}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  item.notes
                    ? `${item.productName}, catatan: ${item.notes}. Ketuk untuk mengubah catatan`
                    : `${item.productName}. Ketuk untuk menambah catatan`
                }
                onPress={() => handleOpenNotesModal(item)}
                activeOpacity={0.7}
                className="min-h-11"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-heading-semibold text-text text-sm" numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <Text className="font-body text-muted text-xs mt-0.5">
                      {formatRupiah(item.unitPrice)}
                    </Text>
                  </View>

                  {/* Subtotal Item */}
                  <Text className="font-heading-semibold text-primary text-sm">
                    {formatRupiah(item.unitPrice * item.quantity)}
                  </Text>
                </View>

                {item.notes ? (
                  <View className="flex-row items-start mt-1.5">
                    <Ionicons name="create-outline" size={14} color="#6B7280" style={{ marginTop: 1 }} />
                    <Text className="font-body text-text text-xs ml-1 flex-1" numberOfLines={2}>
                      {item.notes}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {/* Quantity Controller & Hapus */}
              <View className="flex-row justify-between items-center mt-2.5 pt-2 border-t border-line">
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Hapus ${item.productName} dari keranjang`}
                  onPress={() => handleRemoveFromCart(item.productId)}
                  className="w-11 h-11 items-center justify-center rounded-chip"
                >
                  <Ionicons name="trash-outline" size={18} color="#6B7280" />
                </TouchableOpacity>

                <View className="flex-row items-center bg-background rounded-chip border border-line">
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Kurangi ${item.productName}`}
                    onPress={() => handleUpdateQuantity(item.productId, -1)}
                    className="w-11 h-11 items-center justify-center bg-line/50 rounded-l-chip"
                  >
                    <Ionicons name="remove" size={16} color="#111827" />
                  </TouchableOpacity>
                  <Text
                    accessibilityLabel={`Jumlah ${item.quantity}`}
                    className="font-heading-semibold text-text text-sm px-3"
                  >
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Tambah ${item.productName}`}
                    onPress={() => handleUpdateQuantity(item.productId, 1)}
                    className="w-11 h-11 items-center justify-center bg-primary rounded-r-chip"
                  >
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Bagian Checkout & Pembayaran */}
      {cart.length > 0 && (
        <View
          className="bg-surface border-t border-line px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          {/* Ringkasan: total jadi titik fokus, kembalian langsung di sebelahnya */}
          <View className="flex-row items-end justify-between mb-3">
            <View className="flex-1 mr-3">
              <Text className="font-body text-muted text-xs">Total · {totalItems} item</Text>
              <Text className="font-heading text-text text-2xl" numberOfLines={1}>
                {formatRupiah(total)}
              </Text>
            </View>
          </View>

          {/* Metode bayar: satu kontrol bersegmen */}
          <View className="flex-row bg-background border border-line rounded-chip p-1 mb-3" accessibilityRole="radiogroup">
            {PAYMENT_OPTIONS.map((opt) => {
              const selected = paymentMethod === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`Bayar ${opt.label}`}
                  accessibilityState={{ selected }}
                  onPress={() => setPaymentMethod(opt.value)}
                  className={`flex-1 min-h-11 rounded-chip flex-row items-center justify-center ${
                    selected ? 'bg-primary' : 'bg-transparent'
                  }`}
                >
                  <Ionicons name={opt.icon} size={16} color={selected ? '#FFFFFF' : '#4B5563'} />
                  <Text className={`text-sm ml-1.5 ${selected ? 'font-heading-semibold text-white' : 'font-body-medium text-text'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentMethod !== 'Tunai' ? (
            <View className="mb-3 flex-row items-start">
              <Ionicons name="information-circle-outline" size={18} color="#4B5563" />
              <Text className="font-body text-text text-xs ml-2 flex-1 leading-4">
                {paymentMethod === 'Debit'
                  ? 'Gesek/tap kartu pelanggan di mesin EDC, lalu tekan Bayar setelah transaksi disetujui.'
                  : 'Arahkan pelanggan scan QRIS kedai, lalu tekan Bayar setelah dana masuk.'}
              </Text>
            </View>
          ) : null}

          <Button
            size="lg"
            title={submittingOrder ? 'Memproses...' : `Bayar ${formatRupiah(total)}`}
            onPress={paymentMethod === 'Tunai' ? () => setCashModalVisible(true) : handleProcessOrder}
            isLoading={submittingOrder && !cashModalVisible}
            disabled={submittingOrder}
            icon={<Ionicons name={paymentMethod === 'Tunai' ? 'cash-outline' : 'checkmark-circle'} size={18} color="#FFFFFF" />}
          />
        </View>
      )}
    </View>
  );

  // Langkah bayar tunai: total, uang diterima, pecahan cepat, kembalian, konfirmasi.
  const cashModal = (
        <Modal
          visible={cashModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCashModalVisible(false)}
        >
          <KeyboardAvoidingView behavior="padding" className="flex-1 bg-black/50 justify-center items-center p-5">
            <View className="bg-surface rounded-card p-5 w-full max-w-md border border-line shadow-xl">
              <Text className="font-heading text-text text-lg">Terima pembayaran tunai</Text>
              <View className="flex-row justify-between items-end mt-3 mb-4">
                <Text className="font-body text-muted text-sm">Total</Text>
                <Text className="font-heading text-text text-2xl">{formatRupiah(total)}</Text>
              </View>
    
              <Text className="font-body-medium text-text text-xs mb-1">Uang diterima</Text>
              <TextInput
                accessibilityLabel="Uang diterima"
                autoFocus
                placeholder="Masukkan nominal"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
                value={cashGivenText}
                onChangeText={setCashGivenText}
                className="bg-surface border border-line-strong rounded-chip px-3 min-h-14 font-heading text-text"
                // Ukuran lewat style: kelas text-xl memasang lineHeight yang memotong angka di Android.
                style={{ fontSize: 20, paddingVertical: 0, textAlignVertical: 'center', includeFontPadding: false }}
              />
    
              {/* Pecahan cepat: membungkus ke baris berikut, tidak perlu digeser */}
              <View className="flex-row flex-wrap gap-2 mt-2">
                {quickCashSuggestions.map((amount) => {
                  const active = cashGivenNumber === amount;
                  return (
                    <TouchableOpacity
                      key={amount}
                      accessibilityRole="button"
                      accessibilityLabel={amount === total ? 'Uang pas' : `Uang diterima ${formatRupiah(amount)}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setCashGivenText(String(amount))}
                      className={`px-3 min-h-11 justify-center rounded-chip border ${
                        active ? 'bg-primary/10 border-primary' : 'bg-surface border-line'
                      }`}
                    >
                      <Text className={`text-sm ${active ? 'font-heading-semibold text-primary' : 'font-body text-text'}`}>
                        {amount === total ? 'Uang pas' : formatRupiah(amount)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
    
              {cashGivenNumber > 0 && !cashCalculation.isValid ? (
                <View className="flex-row items-center mt-2" accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={14} color="#991B1B" />
                  <Text className="font-body text-danger text-xs ml-1 flex-1">{cashCalculation.error}</Text>
                </View>
              ) : null}
    
              <View
                className={`flex-row justify-between items-center mt-4 p-3 rounded-chip ${
                  cashCalculation.isValid ? 'bg-success-soft' : 'bg-background'
                }`}
              >
                <Text className={`font-heading-semibold text-base ${cashCalculation.isValid ? 'text-success' : 'text-muted'}`}>
                  Kembalian
                </Text>
                <Text className={`font-heading text-xl ${cashCalculation.isValid ? 'text-success' : 'text-muted'}`}>
                  {cashCalculation.isValid ? formatRupiah(cashCalculation.change) : '-'}
                </Text>
              </View>
    
              <View className="flex-row gap-2 mt-5">
                <Button title="Batal" variant="outline" className="flex-1" onPress={() => setCashModalVisible(false)} />
                <Button
                  title={submittingOrder ? 'Memproses...' : 'Konfirmasi Bayar'}
                  className="flex-1"
                  isLoading={submittingOrder}
                  disabled={submittingOrder || !cashCalculation.isValid}
                  onPress={handleProcessOrder}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header Utama Kasir */}
      <ScreenHeader
        title="Terminal Kasir POS"
        subtitle={user?.email ?? undefined}
        onOpenSidebar={openSidebar}
        rightAction={
          <View className="flex-row items-center gap-2">
            <IncomingOrdersButton
              orders={incoming}
              onOpenOrder={openOrder}
              onOpenAll={() => router.replace('/(kasir)/orders' as never)}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Keluar dari sesi kasir"
              onPress={handleLogout}
              className={`flex-row items-center justify-center bg-white/15 min-h-11 rounded-chip ${isTablet ? 'px-3' : 'w-11'}`}
            >
              <Ionicons name="log-out-outline" size={isTablet ? 15 : 18} color="#FFFFFF" />
              {/* Di HP cukup ikon agar judul header tidak terpotong; label tetap dibacakan pembaca layar. */}
              {isTablet ? <Text className="font-body-medium text-white text-xs ml-1.5">Keluar</Text> : null}
            </TouchableOpacity>
          </View>
        }
      />

      {(shiftLoading || posLocked) && (
        <ShiftRequiredNotice
          loading={shiftLoading}
          onOpenCash={() => router.replace('/(kasir)/cash')}
          onRetry={fetchOpenShift}
        />
      )}

      {/* Main Content Layout (Split Screen di Tablet, Single Column di Phone) */}
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1 flex-row"
        style={shiftLoading || posLocked ? { display: 'none' } : undefined}
      >
        {/* Katalog Menu (Left Side) */}
        <View className="flex-1">
          {/* Baris Pencarian & Profil Petugas */}
          <View className="p-3 bg-surface border-b border-line flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center bg-background border border-line-strong rounded-chip min-h-11 px-3 py-1.5">
              <Ionicons name="search" size={16} color="#6B7280" />
              <TextInput
                accessibilityLabel="Cari menu"
                placeholder="Cari kopi, manual brew, pastry..."
                placeholderTextColor="#6B7280"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 ml-2 text-xs font-body text-text py-0"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Hapus pencarian"
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  onPress={() => setSearchQuery('')}
                >
                  <Ionicons name="close-circle" size={16} color="#6B7280" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Baris Filter Kategori Horizontal */}
          <View className="bg-surface border-b border-line py-2 px-3">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategory === null }}
                onPress={() => setSelectedCategory(null)}
                className={`px-3 min-h-11 justify-center rounded-chip mr-2 border ${
                  selectedCategory === null
                    ? 'bg-primary border-primary'
                    : 'bg-background border-line'
                }`}
              >
                <Text
                  className={`font-heading-semibold text-xs ${
                    selectedCategory === null ? 'text-white' : 'text-text'
                  }`}
                >
                  Semua Menu
                </Text>
              </TouchableOpacity>

              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedCategory(cat.id)}
                    className={`px-3 min-h-11 justify-center rounded-chip mr-2 border ${
                      isSelected ? 'bg-primary border-primary' : 'bg-background border-line'
                    }`}
                  >
                    <Text
                      className={`font-heading-semibold text-xs ${
                        isSelected ? 'text-white' : 'text-text'
                      }`}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Grid Menu Produk */}
          {loading ? (
            <LoadingState label="Memuat katalog menu kopi..." />
          ) : errorMessage ? (
            <ErrorState message={errorMessage} onRetry={fetchData} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="Menu Tidak Ditemukan"
              description="Tidak ada produk menu yang sesuai dengan filter atau kata kunci pencarian Anda."
              iconName="cafe-outline"
            />
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              numColumns={isTablet ? 3 : 1}
              key={isTablet ? 'grid-3' : 'list-1'}
              contentContainerStyle={{
                padding: 12,
                paddingBottom: isTablet ? 40 : 120, // Beri jarak bottom bar jika di smartphone
              }}
              renderItem={({ item }) => {
                const isUnavailable = item.status === 'Tidak Tersedia';
                const cartMatch = cart.find((c) => c.productId === item.id);
                const isToggling = togglingProductId === item.id;

                const availabilityToggle = (
                  <TouchableOpacity
                    accessibilityRole="switch"
                    accessibilityLabel={`Ketersediaan ${item.name}`}
                    accessibilityHint={isUnavailable ? 'Ketuk untuk menandai tersedia' : 'Ketuk untuk menandai habis'}
                    accessibilityState={{ checked: !isUnavailable, disabled: isToggling }}
                    onPress={() => handleToggleProductStatus(item)}
                    disabled={isToggling}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    className={`flex-row items-center px-2.5 min-h-8 rounded-chip border ${
                      isUnavailable ? 'bg-danger-soft border-danger/30' : 'bg-success-soft border-success/30'
                    }`}
                  >
                    <View className={`w-2 h-2 rounded-full mr-1.5 ${isUnavailable ? 'bg-danger' : 'bg-success'}`} />
                    <Text className={`text-xs font-heading-semibold ${isUnavailable ? 'text-danger' : 'text-success'}`}>
                      {isToggling ? '...' : isUnavailable ? 'Habis' : 'Tersedia'}
                    </Text>
                    <Ionicons
                      name="swap-horizontal"
                      size={12}
                      color={isUnavailable ? '#991B1B' : '#166534'}
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                );

                // Seluruh kartu = tambah ke keranjang. Pil ketersediaan di dalamnya tetap punya aksi sendiri
                // (sentuhan ditangkap tombol terdalam).
                const addToCartProps = {
                  onPress: () => handleAddToCart(item),
                  disabled: isUnavailable,
                  accessibilityRole: 'button' as const,
                  accessibilityLabel: isUnavailable
                    ? `${item.name} habis`
                    : `Tambah ${item.name} ke keranjang${cartMatch ? `, sudah ${cartMatch.quantity} di keranjang` : ''}`,
                  accessibilityState: { disabled: isUnavailable },
                  // Kartu dibaca sebagai satu elemen oleh pembaca layar, jadi ubah ketersediaan
                  // disediakan sebagai aksi aksesibilitas kartu.
                  accessibilityActions: [
                    { name: 'toggleAvailability', label: isUnavailable ? 'Tandai tersedia' : 'Tandai habis' },
                  ],
                  onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
                    if (e.nativeEvent.actionName === 'toggleAvailability') handleToggleProductStatus(item);
                  },
                  activeOpacity: 0.7,
                };

                // HP: baris lebar penuh agar foto, nama, dan harga tidak berdesakan.
                if (!isTablet) {
                  return (
                    <TouchableOpacity
                      {...addToCartProps}
                      className={`flex-row items-center border border-line rounded-card pl-3 pr-2.5 py-2.5 mb-2 ${
                        isUnavailable ? 'bg-background' : 'bg-surface'
                      }`}
                    >
                      <View className={`flex-1 flex-row items-center mr-2 ${isUnavailable ? 'opacity-60' : ''}`}>
                        <ProductThumb
                          size={56}
                          uri={failedImages[item.id] ? null : item.image}
                          onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                        />
                        <View className="flex-1 ml-3">
                          <Text
                            className={`font-heading-semibold text-sm leading-5 ${
                              isUnavailable ? 'text-muted line-through' : 'text-text'
                            }`}
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          <View className="flex-row items-center mt-0.5">
                            <Text className={`font-heading text-sm ${isUnavailable ? 'text-muted' : 'text-primary'}`}>
                              {formatRupiah(item.price)}
                            </Text>
                            {cartMatch ? (
                              <View className="ml-2 px-2 py-0.5 rounded-chip bg-primary">
                                <Text className="font-heading-semibold text-white text-xs">{cartMatch.quantity} di keranjang</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      {availabilityToggle}
                    </TouchableOpacity>
                  );
                }

                // Tablet: kartu grid.
                return (
                  <TouchableOpacity
                    {...addToCartProps}
                    className={`flex-1 m-1.5 border border-line rounded-card p-3 ${
                      isUnavailable ? 'bg-background' : 'bg-surface'
                    }`}
                  >
                    {/* Baris atas: foto di kiri, sakelar ketersediaan di kanan */}
                    <View className="flex-row justify-between items-start mb-2.5">
                      <ProductThumb
                        size={56}
                        uri={failedImages[item.id] ? null : item.image}
                        onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                      />
                      {availabilityToggle}
                    </View>

                    {/* Nama selebar kartu, harga di bawah */}
                    <View className={`flex-1 justify-between ${isUnavailable ? 'opacity-60' : ''}`}>
                      <Text
                        className={`font-heading-semibold text-sm leading-5 ${
                          isUnavailable ? 'text-muted line-through' : 'text-text'
                        }`}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>

                      <View className="mt-2 pt-2 border-t border-line/60 flex-row justify-between items-center">
                        <Text className={`font-heading text-sm ${isUnavailable ? 'text-muted' : 'text-primary'}`}>
                          {formatRupiah(item.price)}
                        </Text>
                        {isUnavailable ? null : (
                          <View className="w-6 h-6 rounded-chip bg-primary/10 items-center justify-center">
                            <Ionicons name="add" size={14} color="#D1001F" />
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Jumlah di keranjang */}
                    {cartMatch && (
                      <View className="absolute -top-1.5 -left-1.5 bg-primary rounded-full min-w-6 h-6 px-1 items-center justify-center z-10 border border-white">
                        <Text className="text-white text-xs font-heading-semibold">{cartMatch.quantity}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {/* Panel Keranjang di Sisi Kanan (Khusus Layar Tablet) */}
        {isTablet && (
          <View className="border-l border-line bg-surface" style={{ width: cartPanelWidth }}>
            {renderCartContent(false)}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Floating Bottom Bar Keranjang (Khusus Layar Smartphone) */}
      {!isTablet && cart.length > 0 && (
        <View
          className="absolute left-4 right-4 bg-primary rounded-card p-3.5 shadow-xl flex-row justify-between items-center border border-white/20"
          style={{ bottom: Math.max(insets.bottom, 16) }}
        >
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2.5">
              <Ionicons name="cart" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text className="font-body-medium text-white/80 text-xs">
                {totalItems} item pesanan
              </Text>
              <Text className="font-heading text-white text-base leading-5">
                {formatRupiah(total)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Lihat keranjang dan bayar, ${totalItems} item, ${formatRupiah(total)}`}
            onPress={() => setCartModalVisible(true)}
            className="bg-white px-4 min-h-11 rounded-chip flex-row items-center"
          >
            <Text className="font-heading-semibold text-primary text-xs mr-1">Lihat & Bayar</Text>
            <Ionicons name="chevron-forward" size={14} color="#D1001F" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal Konfirmasi Ubah Ketersediaan Produk */}
      <Modal
        visible={statusConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusConfirm(null)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          {statusConfirm ? (
            (() => {
              const toUnavailable = getAvailability(statusConfirm) === 'Tersedia';
              return (
                <View className="bg-surface rounded-card p-5 w-full max-w-sm border border-line shadow-xl">
                  <View
                    className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${
                      toUnavailable ? 'bg-danger-soft' : 'bg-success-soft'
                    }`}
                  >
                    <Ionicons
                      name={toUnavailable ? 'close-circle-outline' : 'checkmark-circle-outline'}
                      size={26}
                      color={toUnavailable ? '#991B1B' : '#166534'}
                    />
                  </View>
                  <Text className="font-heading text-text text-lg">
                    {toUnavailable ? 'Tandai menu habis?' : 'Tandai menu tersedia?'}
                  </Text>
                  <Text className="font-heading-semibold text-text text-base mt-1">{statusConfirm.name}</Text>
                  <Text className="font-body text-muted text-sm mt-2 leading-5">
                    {toUnavailable
                      ? 'Menu tidak bisa ditambahkan ke keranjang di POS maupun dipesan customer sampai ditandai tersedia lagi.'
                      : 'Menu bisa kembali ditambahkan ke keranjang dan dipesan customer.'}
                  </Text>
                  <View className="flex-row gap-2 mt-5">
                    <Button title="Batal" variant="outline" className="flex-1" onPress={() => setStatusConfirm(null)} />
                    <Button
                      title={toUnavailable ? 'Ya, Habis' : 'Ya, Tersedia'}
                      variant={toUnavailable ? 'danger' : 'success'}
                      className="flex-1"
                      onPress={handleConfirmProductStatus}
                    />
                  </View>
                </View>
              );
            })()
          ) : null}
        </View>
      </Modal>

      {/* Tablet: modal tunai di level layar. HP: di dalam modal keranjang (iOS tidak bisa dua modal sejajar). */}
      {isTablet ? cashModal : null}

      {/* Modal Keranjang & Pembayaran (Untuk Layar Smartphone) */}
      <Modal
        visible={cartModalVisible && !isTablet}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setCartModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1 bg-surface"
        >
          {renderCartContent(true)}
          {!isTablet ? cashModal : null}
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Tambah / Edit Catatan Khusus Item */}
      <Modal
        visible={notesModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <KeyboardAvoidingView behavior="padding" className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-surface rounded-card p-5 w-full max-w-sm border border-line shadow-lg">
            <Text className="font-heading-semibold text-text text-base mb-1">
              Catatan Pesanan Barista
            </Text>
            <Text className="font-body text-muted text-xs mb-3">
              Item: {selectedCartItemForNotes?.productName}
            </Text>

            <TextInput
              placeholder="Contoh: Less sweet, oat milk, es dipisah..."
              placeholderTextColor="#6B7280"
              value={tempNotes}
              onChangeText={setTempNotes}
              className="bg-background border border-line-strong rounded-chip p-3 text-xs font-body text-text mb-4"
              multiline
              numberOfLines={3}
            />

            <View className="flex-row gap-2">
              <Button
                title="Batal"
                variant="outline"
                className="flex-1"
                onPress={() => setNotesModalVisible(false)}
              />
              <Button title="Simpan Catatan" className="flex-1" onPress={handleSaveNotes} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Struk Digital Transaksi Sukses */}
      <Modal
        visible={receiptModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReceiptModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center p-4">
          <View
            className="bg-surface rounded-card w-full border border-line shadow-xl"
            style={{ maxWidth: isTablet ? 560 : 460, maxHeight: '92%' }}
          >
            {/* Header Nota */}
            <View className="flex-row items-center px-5 pt-5 pb-4 border-b border-dashed border-line">
              <View className="w-12 h-12 rounded-full bg-success-soft items-center justify-center mr-3">
                <Ionicons name="checkmark-done" size={24} color="#166534" />
              </View>
              <View className="flex-1">
                <Text className="font-heading text-text text-lg">Transaksi Berhasil</Text>
                {completedOrder ? (
                  <Text className="font-body text-muted text-sm">
                    {completedOrder.orderNumber} · {completedOrder.createdAt}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Rincian Nota Transaksi: tinggi mengikuti isi, digulir bila melebihi layar */}
            {completedOrder && (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}
                showsVerticalScrollIndicator={false}
              >
                <ReceiptRow label="Pelanggan" value={`${completedOrder.customerName} · ${completedOrder.orderType}`} />
                <ReceiptRow label="Status pesanan" value="Diproses" />

                <View className="my-3 border-b border-dashed border-line" />

                {completedOrder.items.map((item, idx) => (
                  <View key={idx} className="mb-2.5">
                    <View className="flex-row justify-between">
                      <Text className="font-body-medium text-text text-sm flex-1 mr-3">
                        {item.quantity}x {item.productName}
                      </Text>
                      <Text className="font-body-medium text-text text-sm">
                        {formatRupiah(item.unitPrice * item.quantity)}
                      </Text>
                    </View>
                    {item.notes ? (
                      <Text className="font-body text-muted text-sm mt-0.5">Catatan: {item.notes}</Text>
                    ) : null}
                  </View>
                ))}

                <View className="my-3 border-b border-dashed border-line" />

                <View className="flex-row justify-between items-center mb-2">
                  <Text className="font-heading-semibold text-text text-base">Total</Text>
                  <Text className="font-heading text-primary text-xl">{formatRupiah(completedOrder.totalAmount)}</Text>
                </View>
                <ReceiptRow
                  label={completedOrder.paymentMethod === 'Tunai' ? 'Tunai diterima' : `Dibayar ${completedOrder.paymentMethod}`}
                  value={formatRupiah(completedOrder.cashGiven)}
                />
                {completedOrder.paymentMethod === 'Tunai' && (
                  <View className="flex-row justify-between items-center mt-1 p-3 rounded-chip bg-success-soft">
                    <Text className="font-heading-semibold text-success text-base">Kembalian</Text>
                    <Text className="font-heading text-success text-xl">{formatRupiah(completedOrder.change)}</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Aksi */}
            <View className="px-5 pt-3 pb-5 border-t border-line gap-2.5">
              {/* TODO: tombol cetak struk ditambahkan kembali setelah printer thermal tersambung. */}
              <Button
                title="Transaksi Baru"
                icon={<Ionicons name="refresh" size={18} color="#FFFFFF" />}
                onPress={() => {
                  setReceiptModalVisible(false);
                  setCompletedOrder(null);
                }}
              />
              <Button
                title="Lihat di Riwayat Pesanan"
                variant="outline"
                onPress={() => {
                  setReceiptModalVisible(false);
                  setCompletedOrder(null);
                  router.replace('/(kasir)/orders' as never);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Foto kecil produk di kartu POS; ikon gambar sebagai penanda bila foto belum diunggah. */
function ProductThumb({ uri, onError, size = 48 }: { uri?: string | null; onError: () => void; size?: number }) {
  return (
    <View
      className="rounded-chip overflow-hidden bg-background border border-line items-center justify-center"
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={onError}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="image-outline" size={20} color="#6B7280" />
      )}
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-start mb-1.5">
      <Text className="font-body text-muted text-sm mr-3">{label}</Text>
      <Text className="font-body-medium text-text text-sm flex-1 text-right">{value}</Text>
    </View>
  );
}
