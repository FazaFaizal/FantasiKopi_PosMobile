import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
  generateOrderNumber,
  filterPosProducts,
} from '../../lib/pos-logic';
import { toggleProductAvailability } from '../../lib/product-logic';

interface CategoryItem {
  id: string;
  name: string;
}

export default function KasirPOS() {
  const { signOut, user } = useAuth();
  const { openSidebar } = useKasirSidebar();
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();

  // State Produk & Kategori
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);

  // State Keranjang Belanja & Checkout
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS'>('Tunai');
  const [cashGivenText, setCashGivenText] = useState('');
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
    paymentMethod: 'Tunai' | 'QRIS';
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
          .select('id, name, price, category_id, status, is_active')
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

  // Handler Toggle Ketersediaan Menu oleh Kasir (Hanya status yang dapat diubah)
  const handleToggleProductStatus = async (product: PosProduct) => {
    const current = (product.status === 'Tidak Tersedia' ? 'Tidak Tersedia' : 'Tersedia') as
      | 'Tersedia'
      | 'Tidak Tersedia';
    const nextStatus = toggleProductAvailability(current);

    try {
      setTogglingProductId(product.id);

      // Optimistic update pada antarmuka kasir
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: nextStatus } : p))
      );

      // Simpan perubahan HANYA kolom status ke Supabase
      const { error } = await supabase
        .from('products')
        .update({ status: nextStatus })
        .eq('id', product.id);

      if (error) throw error;
    } catch (err: any) {
      console.error('Error toggling product status:', err);
      // Revert optimistic update jika gagal
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: current } : p))
      );
      Alert.alert(
        'Gagal Mengubah Status',
        err?.message || 'Terjadi kesalahan saat memperbarui status produk.'
      );
    } finally {
      setTogglingProductId(null);
    }
  };

  // Handler Keranjang
  const handleAddToCart = (product: PosProduct) => {
    if (product.status === 'Tidak Tersedia') {
      Alert.alert(
        'Produk Habis',
        `${product.name} sedang ditandai Habis. Ketuk toggle status jika ingin mengaktifkannya kembali.`,
        [
          { text: 'Tutup', style: 'cancel' },
          {
            text: 'Jadikan Tersedia',
            onPress: () => handleToggleProductStatus(product),
          },
        ]
      );
      return;
    }
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
      const generatedNumber = generateOrderNumber(new Date(), Date.now() % 10000);
      const cashierIdentifier = user?.email || 'Kasir Kedai';

      // 1. Simpan Transaksi Induk ke tabel 'orders'
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: generatedNumber,
          user_id: user?.id || null,
          cashier_name: cashierIdentifier,
          customer_name: customerName.trim() || 'Pelanggan Umum',
          total_amount: total,
          payment_method: paymentMethod,
          payment_status: 'Lunas',
          notes: paymentMethod === 'Tunai' ? `Bayar: ${formatRupiah(cashGivenNumber)}` : 'Pembayaran QRIS',
        })
        .select('id, created_at')
        .single();

      if (orderError) throw orderError;

      // 2. Simpan Rincian Item ke tabel 'order_items' (Pola Snapshot Harga & Nama)
      const orderItemsPayload = cart.map((item) => ({
        order_id: orderData.id,
        product_id: item.productId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemsError) throw itemsError;

      // 3. Simpan data untuk Struk Transaksi Digital
      setCompletedOrder({
        orderNumber: generatedNumber,
        customerName: customerName.trim() || 'Pelanggan Umum',
        cashierName: cashierIdentifier,
        totalAmount: total,
        paymentMethod,
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
      {/* Header Keranjang / Pembayaran */}
      {inModal ? (
        <ScreenHeader
          title="Keranjang & Pembayaran"
          subtitle={`Total: ${formatRupiah(total)} • ${totalItems} item pesanan`}
          onClose={() => setCartModalVisible(false)}
          rightAction={
            cart.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Kosongkan keranjang"
                onPress={handleClearCart}
                className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-chip"
              >
                <Ionicons name="trash-outline" size={15} color="#FFFFFF" />
                <Text className="font-body-medium text-white text-xs ml-1.5">Reset</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <View className="p-4 border-b border-line flex-row justify-between items-center bg-surface">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2">
              <Ionicons name="cart" size={18} color="#D1001F" />
            </View>
            <View>
              <Text className="font-heading-semibold text-text text-base">Keranjang Pesanan</Text>
              <Text className="font-body text-muted text-xs">{totalItems} item pesanan</Text>
            </View>
          </View>

          {cart.length > 0 && (
            <TouchableOpacity
              onPress={handleClearCart}
              className="p-1.5 rounded-chip bg-rose-50 border border-rose-200"
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Input Nama Pelanggan / Nomor Meja */}
      <View className="p-3 bg-background border-b border-line">
        <Text className="font-heading-semibold text-text text-xs mb-1">Pelanggan / Nomor Meja</Text>
        <TextInput
          placeholder="Contoh: Meja 03 / Kak Sarah"
          placeholderTextColor="#9CA3AF"
          value={customerName}
          onChangeText={setCustomerName}
          className="bg-surface border border-line rounded-chip px-3 py-2 text-xs font-body text-text"
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
        <ScrollView className="flex-1 p-3" showsVerticalScrollIndicator={false}>
          {cart.map((item) => (
            <View
              key={item.productId}
              className="bg-surface border border-line rounded-card p-3 mb-2.5 shadow-sm"
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

              {/* Catatan Khusus Item */}
              <TouchableOpacity
                onPress={() => handleOpenNotesModal(item)}
                className="mt-2 py-1 px-2 rounded-chip bg-background border border-line flex-row items-center self-start"
              >
                <Ionicons name="create-outline" size={12} color="#6B7280" />
                <Text className="font-body text-muted text-[11px] ml-1">
                  {item.notes ? item.notes : 'Tambah catatan (less sweet, dll)'}
                </Text>
              </TouchableOpacity>

              {/* Quantity Controller & Hapus */}
              <View className="flex-row justify-between items-center mt-2.5 pt-2 border-t border-line">
                <TouchableOpacity
                  onPress={() => handleRemoveFromCart(item.productId)}
                  className="p-1 rounded-chip"
                >
                  <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                </TouchableOpacity>

                <View className="flex-row items-center bg-background rounded-chip border border-line">
                  <TouchableOpacity
                    onPress={() => handleUpdateQuantity(item.productId, -1)}
                    className="w-7 h-7 items-center justify-center bg-line/50 rounded-l-chip"
                  >
                    <Ionicons name="remove" size={14} color="#111827" />
                  </TouchableOpacity>
                  <Text className="font-heading-semibold text-text text-xs px-3">
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleUpdateQuantity(item.productId, 1)}
                    className="w-7 h-7 items-center justify-center bg-primary rounded-r-chip"
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
          className="p-4 bg-surface border-t border-line shadow-lg"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {/* Subtotal & Total */}
          <View className="flex-row justify-between items-center mb-2">
            <Text className="font-body text-muted text-xs">Total Pembayaran</Text>
            <Text className="font-heading text-primary text-xl">{formatRupiah(total)}</Text>
          </View>

          {/* Pilihan Metode Bayar */}
          <View className="flex-row gap-2 mb-3">
            <TouchableOpacity
              onPress={() => setPaymentMethod('Tunai')}
              className={`flex-1 py-2 px-3 rounded-chip border items-center flex-row justify-center ${
                paymentMethod === 'Tunai'
                  ? 'bg-primary/10 border-primary'
                  : 'bg-background border-line'
              }`}
            >
              <Ionicons
                name="cash-outline"
                size={16}
                color={paymentMethod === 'Tunai' ? '#D1001F' : '#6B7280'}
              />
              <Text
                className={`font-heading-semibold text-xs ml-1.5 ${
                  paymentMethod === 'Tunai' ? 'text-primary' : 'text-muted'
                }`}
              >
                Tunai (Cash)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod('QRIS')}
              className={`flex-1 py-2 px-3 rounded-chip border items-center flex-row justify-center ${
                paymentMethod === 'QRIS'
                  ? 'bg-primary/10 border-primary'
                  : 'bg-background border-line'
              }`}
            >
              <Ionicons
                name="qr-code-outline"
                size={16}
                color={paymentMethod === 'QRIS' ? '#D1001F' : '#6B7280'}
              />
              <Text
                className={`font-heading-semibold text-xs ml-1.5 ${
                  paymentMethod === 'QRIS' ? 'text-primary' : 'text-muted'
                }`}
              >
                QRIS Digital
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Pembayaran Tunai & Kembalian */}
          {paymentMethod === 'Tunai' ? (
            <View className="mb-3 bg-background p-2.5 rounded-chip border border-line">
              <Text className="font-body text-muted text-[11px] mb-1">Nominal Uang Diterima:</Text>
              <TextInput
                placeholder="Masukkan nominal (Rp)"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={cashGivenText}
                onChangeText={setCashGivenText}
                className="bg-surface border border-line rounded-chip px-3 py-1.5 text-xs font-heading-semibold text-text mb-2"
              />

              {/* Tombol Cepat Pecahan Uang */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-1.5 mb-2">
                {quickCashSuggestions.map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    onPress={() => setCashGivenText(String(amount))}
                    className="bg-surface border border-line px-2 py-1 rounded-chip"
                  >
                    <Text className="font-body text-text text-[11px]">
                      {amount === total ? 'Uang Pas' : formatRupiah(amount)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Status Kembalian */}
              {cashGivenNumber > 0 && (
                <View className="flex-row justify-between items-center pt-1.5 border-t border-line">
                  <Text className="font-body text-muted text-xs">Uang Kembalian:</Text>
                  <Text
                    className={`font-heading-semibold text-xs ${
                      cashCalculation.isValid ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {cashCalculation.isValid
                      ? formatRupiah(cashCalculation.change)
                      : cashCalculation.error}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="mb-3 bg-amber-500/10 p-2.5 rounded-chip border border-amber-500/20 flex-row items-center">
              <Ionicons name="information-circle-outline" size={18} color="#B45309" />
              <Text className="font-body text-amber-800 text-[11px] ml-2 flex-1">
                Arahkan pelanggan scan kode QRIS kedai di meja kasir. Tekan tombol di bawah setelah dana masuk.
              </Text>
            </View>
          )}

          {/* Tombol Proses Bayar */}
          <Button
            title={
              submittingOrder
                ? 'Memproses...'
                : `Bayar Sekarang • ${formatRupiah(total)}`
            }
            onPress={handleProcessOrder}
            disabled={submittingOrder || (paymentMethod === 'Tunai' && !cashCalculation.isValid)}
            icon={<Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
          />
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header Utama Kasir */}
      <ScreenHeader
        title="Terminal Kasir POS"
        subtitle="Fantasi Coffee Point of Sale"
        onOpenSidebar={openSidebar}
        rightAction={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Keluar dari sesi kasir"
            onPress={handleLogout}
            className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="log-out-outline" size={15} color="#FFFFFF" />
            <Text className="font-body-medium text-white text-xs ml-1.5">Keluar</Text>
          </TouchableOpacity>
        }
      />

      {/* Main Content Layout (Split Screen di Tablet, Single Column di Phone) */}
      <View className="flex-1 flex-row">
        {/* Katalog Menu (Left Side) */}
        <View className="flex-1">
          {/* Baris Pencarian & Profil Petugas */}
          <View className="p-3 bg-surface border-b border-line flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center bg-background border border-line rounded-chip px-3 py-1.5">
              <Ionicons name="search" size={16} color="#9CA3AF" />
              <TextInput
                placeholder="Cari kopi, manual brew, pastry..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 ml-2 text-xs font-body text-text py-0"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Badge Sesi Kasir */}
            <View className="hidden md:flex flex-row items-center bg-background px-3 py-1.5 rounded-chip border border-line">
              <Ionicons name="person-circle" size={16} color="#D1001F" />
              <Text className="font-body text-text text-xs ml-1.5" numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          </View>

          {/* Baris Filter Kategori Horizontal */}
          <View className="bg-surface border-b border-line py-2 px-3">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-chip mr-2 border ${
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
                    onPress={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-chip mr-2 border ${
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
              numColumns={isTablet ? 3 : 2}
              key={isTablet ? 'grid-3' : 'grid-2'}
              contentContainerStyle={{
                padding: 12,
                paddingBottom: isTablet ? 40 : 120, // Beri jarak bottom bar jika di smartphone
              }}
              renderItem={({ item }) => {
                const isUnavailable = item.status === 'Tidak Tersedia';
                const cartMatch = cart.find((c) => c.productId === item.id);
                const isToggling = togglingProductId === item.id;

                return (
                  <View
                    className={`flex-1 m-1.5 bg-surface border rounded-card p-3 shadow-sm justify-between ${
                      isUnavailable ? 'border-line bg-slate-50/70' : 'border-line'
                    }`}
                    style={{ minHeight: 128 }}
                  >
                    {/* Header Kartu: Ikon Menu & Tombol Toggle Status */}
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="w-8 h-8 rounded-card bg-primary/10 items-center justify-center">
                        <Ionicons name="cafe" size={16} color="#D1001F" />
                      </View>

                      {/* Tombol Toggle Ketersediaan Khusus Kasir */}
                      <TouchableOpacity
                        accessibilityRole="switch"
                        accessibilityLabel={`Ubah status ${item.name}`}
                        onPress={() => handleToggleProductStatus(item)}
                        disabled={isToggling}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className={`flex-row items-center px-2 py-0.5 rounded-full border ${
                          isUnavailable
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <View
                          className={`w-2 h-2 rounded-full mr-1.5 ${
                            isUnavailable ? 'bg-rose-600' : 'bg-emerald-600'
                          }`}
                        />
                        <Text
                          className={`text-[10px] font-heading-semibold ${
                            isUnavailable ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {isToggling ? '...' : isUnavailable ? 'Habis' : 'Tersedia'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Area Klik Menu: Menambah Item ke Keranjang */}
                    <TouchableOpacity
                      onPress={() => handleAddToCart(item)}
                      activeOpacity={0.7}
                      className="flex-1 justify-between"
                    >
                      <View>
                        <Text
                          className={`font-heading-semibold text-xs leading-4 ${
                            isUnavailable ? 'text-muted line-through' : 'text-text'
                          }`}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                      </View>

                      <View className="mt-2 pt-2 border-t border-line/60 flex-row justify-between items-center">
                        <Text
                          className={`font-heading text-xs ${
                            isUnavailable ? 'text-muted' : 'text-primary'
                          }`}
                        >
                          {formatRupiah(item.price)}
                        </Text>
                        {isUnavailable ? (
                          <View className="px-1.5 py-0.5 rounded-chip bg-rose-100/70">
                            <Text className="font-body text-rose-600 text-[9px]">Kosong</Text>
                          </View>
                        ) : (
                          <View className="w-6 h-6 rounded-chip bg-primary/10 items-center justify-center">
                            <Ionicons name="add" size={14} color="#D1001F" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Badge Item Quantity di Keranjang */}
                    {cartMatch && (
                      <View className="absolute -top-1.5 -left-1.5 bg-primary rounded-full w-5 h-5 items-center justify-center z-10 shadow-sm border border-white">
                        <Text className="text-white text-[10px] font-heading-semibold">
                          {cartMatch.quantity}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* Panel Keranjang di Sisi Kanan (Khusus Layar Tablet) */}
        {isTablet && (
          <View className="w-[360px] border-l border-line bg-surface">
            {renderCartContent(false)}
          </View>
        )}
      </View>

      {/* Floating Bottom Bar Keranjang (Khusus Layar Smartphone) */}
      {!isTablet && cart.length > 0 && (
        <View className="absolute bottom-4 left-4 right-4 bg-primary rounded-card p-3.5 shadow-xl flex-row justify-between items-center border border-white/20">
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
            onPress={() => setCartModalVisible(true)}
            className="bg-white px-4 py-2 rounded-chip flex-row items-center shadow-sm"
          >
            <Text className="font-heading-semibold text-primary text-xs mr-1">Lihat & Bayar</Text>
            <Ionicons name="chevron-forward" size={14} color="#D1001F" />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal Keranjang & Pembayaran (Untuk Layar Smartphone) */}
      <Modal
        visible={cartModalVisible && !isTablet}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setCartModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 bg-surface"
        >
          {renderCartContent(true)}
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Tambah / Edit Catatan Khusus Item */}
      <Modal
        visible={notesModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-surface rounded-card p-5 w-full max-w-sm border border-line shadow-lg">
            <Text className="font-heading-semibold text-text text-base mb-1">
              Catatan Pesanan Barista
            </Text>
            <Text className="font-body text-muted text-xs mb-3">
              Item: {selectedCartItemForNotes?.productName}
            </Text>

            <TextInput
              placeholder="Contoh: Less sweet, oat milk, es dipisah..."
              placeholderTextColor="#9CA3AF"
              value={tempNotes}
              onChangeText={setTempNotes}
              className="bg-background border border-line rounded-chip p-3 text-xs font-body text-text mb-4"
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
        </View>
      </Modal>

      {/* Modal Struk Digital Transaksi Sukses */}
      <Modal
        visible={receiptModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReceiptModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center p-5">
          <View className="bg-surface rounded-card p-6 w-full max-w-md border border-line shadow-2xl">
            {/* Header Nota */}
            <View className="items-center mb-4 pb-4 border-b border-dashed border-line">
              <View className="w-12 h-12 rounded-full bg-emerald-500/10 items-center justify-center mb-2 border border-emerald-500/20">
                <Ionicons name="checkmark-done" size={24} color="#047857" />
              </View>
              <Text className="font-heading text-text text-lg">Transaksi Berhasil!</Text>
              <Text className="font-body text-muted text-xs">Fantasi Coffee POS Terminal</Text>
            </View>

            {/* Rincian Nota Transaksi */}
            {completedOrder && (
              <ScrollView className="max-h-72 mb-4" showsVerticalScrollIndicator={false}>
                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">No. Transaksi</Text>
                  <Text className="font-heading-semibold text-text text-xs">
                    {completedOrder.orderNumber}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Pelanggan</Text>
                  <Text className="font-body-medium text-text text-xs">
                    {completedOrder.customerName}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">Kasir / Waktu</Text>
                  <Text className="font-body text-text text-xs">
                    {completedOrder.createdAt}
                  </Text>
                </View>

                {/* Garis Pembatas */}
                <View className="my-2 border-b border-dashed border-line" />

                {/* List Item */}
                {completedOrder.items.map((item, idx) => (
                  <View key={idx} className="mb-2">
                    <View className="flex-row justify-between">
                      <Text className="font-body-medium text-text text-xs flex-1 mr-2">
                        {item.quantity}x {item.productName}
                      </Text>
                      <Text className="font-body-medium text-text text-xs">
                        {formatRupiah(item.unitPrice * item.quantity)}
                      </Text>
                    </View>
                    {item.notes ? (
                      <Text className="font-body text-muted text-[11px] italic ml-3">
                        * {item.notes}
                      </Text>
                    ) : null}
                  </View>
                ))}

                {/* Ringkasan Finansial */}
                <View className="my-2 border-b border-dashed border-line" />
                <View className="flex-row justify-between mb-1">
                  <Text className="font-heading-semibold text-text text-xs">Total Pembayaran</Text>
                  <Text className="font-heading-semibold text-primary text-sm">
                    {formatRupiah(completedOrder.totalAmount)}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="font-body text-muted text-xs">
                    Metode ({completedOrder.paymentMethod})
                  </Text>
                  <Text className="font-body text-text text-xs">
                    {formatRupiah(completedOrder.cashGiven)}
                  </Text>
                </View>
                {completedOrder.paymentMethod === 'Tunai' && (
                  <View className="flex-row justify-between mb-1">
                    <Text className="font-heading-semibold text-emerald-700 text-xs">
                      Uang Kembalian
                    </Text>
                    <Text className="font-heading-semibold text-emerald-700 text-xs">
                      {formatRupiah(completedOrder.change)}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Tombol Transaksi Baru */}
            <Button
              title="Transaksi Baru"
              icon={<Ionicons name="refresh" size={18} color="#FFFFFF" />}
              onPress={() => {
                setReceiptModalVisible(false);
                setCompletedOrder(null);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
