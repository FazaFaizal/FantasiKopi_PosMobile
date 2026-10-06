import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Database } from '../../types/database';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LoadingState, EmptyState, ErrorState } from '../../components/States';
import { useAuth } from '../../lib/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { computeStockStatus } from '../../lib/inventory-logic';
import { useResponsive } from '../../hooks/useResponsive';

type InventoryItem = Database['public']['Tables']['inventory_items']['Row'];
type StockMovement = Database['public']['Tables']['stock_movements']['Row'];

export default function KasirInventoryScreen() {
  const { user } = useAuth();
  const { isTablet, columns } = useResponsive();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'Aman' | 'Low Stock' | 'Out of Stock'>('Semua');

  // Modal 1: Tambah / Edit Bahan Baku
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('gram');
  const [minStock, setMinStock] = useState('0');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState('');
  const [submittingItem, setSubmittingItem] = useState(false);

  // Modal 2: Catat Pergerakan Stok
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [selectedItemForMovement, setSelectedItemForMovement] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<'Stock In' | 'Stock Out' | 'Stock Adjustment'>('Stock In');
  const [quantity, setQuantity] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [movementError, setMovementError] = useState('');
  const [submittingMovement, setSubmittingMovement] = useState(false);

  // Modal 3: Riwayat Pergerakan Stok
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedItemHistory, setSelectedItemHistory] = useState<InventoryItem | null>(null);
  const [movementsHistory, setMovementsHistory] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat data bahan baku.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const openAddItemModal = () => {
    setEditingItem(null);
    setName('');
    setUnit('gram');
    setMinStock('100');
    setNotes('');
    setNameError('');
    setItemModalVisible(true);
  };

  const openEditItemModal = (it: InventoryItem) => {
    setEditingItem(it);
    setName(it.name);
    setUnit(it.unit);
    setMinStock(it.min_stock.toString());
    setNotes(it.notes || '');
    setNameError('');
    setItemModalVisible(true);
  };

  const handleSaveItem = async () => {
    setNameError('');
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError('Nama bahan baku wajib diisi');
      return;
    }

    const numMin = Number(minStock);
    if (isNaN(numMin) || numMin < 0) {
      Alert.alert('Validasi', 'Minimum stock harus berupa angka valid (>= 0)');
      return;
    }

    setSubmittingItem(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventory_items')
          .update({
            name: cleanName,
            unit: unit.trim().toLowerCase(),
            min_stock: numMin,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        Alert.alert('Sukses', 'Data bahan baku berhasil diperbarui.');
      } else {
        const { error } = await supabase
          .from('inventory_items')
          .insert({
            name: cleanName,
            unit: unit.trim().toLowerCase(),
            current_stock: 0,
            min_stock: numMin,
            notes: notes.trim() || null,
            is_deleted: false,
          });

        if (error) throw error;
        Alert.alert('Sukses', 'Bahan baku baru berhasil ditambahkan.');
      }

      setItemModalVisible(false);
      fetchInventory();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSubmittingItem(false);
    }
  };

  const openMovementModal = (it: InventoryItem, defaultType: 'Stock In' | 'Stock Out' | 'Stock Adjustment' = 'Stock In') => {
    setSelectedItemForMovement(it);
    setMovementType(defaultType);
    setQuantity('');
    setMovementNotes('');
    setMovementError('');
    setMovementModalVisible(true);
  };

  const handleSaveMovement = async () => {
    if (!selectedItemForMovement) return;
    setMovementError('');

    const numQty = Number(quantity);
    if (!quantity || isNaN(numQty) || numQty <= 0) {
      setMovementError('Jumlah perubahan harus lebih besar dari 0');
      return;
    }

    const current = Number(selectedItemForMovement.current_stock);
    let after = current;

    if (movementType === 'Stock In') {
      after = current + numQty;
    } else if (movementType === 'Stock Out') {
      if (current < numQty) {
        setMovementError(`Stok tidak mencukupi. Stok saat ini: ${current} ${selectedItemForMovement.unit}`);
        return;
      }
      after = current - numQty;
      if (!movementNotes.trim()) {
        setMovementError('Keterangan wajib diisi untuk Stock Out (misal: Pemakaian barista, Rusak)');
        return;
      }
    } else if (movementType === 'Stock Adjustment') {
      after = numQty;
      if (!movementNotes.trim()) {
        setMovementError('Keterangan wajib diisi untuk Stock Opname');
        return;
      }
    }

    setSubmittingMovement(true);
    try {
      const { error: moveErr } = await supabase
        .from('stock_movements')
        .insert({
          inventory_id: selectedItemForMovement.id,
          item_name: selectedItemForMovement.name,
          item_unit: selectedItemForMovement.unit,
          movement_type: movementType,
          quantity: numQty,
          stock_before: current,
          stock_after: after,
          notes: movementNotes.trim() || null,
          user_id: user?.id || null,
          user_name: user?.email || 'Staf Kasir',
        });

      if (moveErr) throw moveErr;

      await supabase
        .from('inventory_items')
        .update({
          current_stock: after,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItemForMovement.id);

      Alert.alert('Sukses', `Mutasi stok ${movementType} berhasil dicatat.`);
      setMovementModalVisible(false);
      fetchInventory();
    } catch (err: any) {
      Alert.alert('Gagal Mencatat Mutasi', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSubmittingMovement(false);
    }
  };

  const openHistoryModal = async (it: InventoryItem) => {
    setSelectedItemHistory(it);
    setHistoryModalVisible(true);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('inventory_id', it.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMovementsHistory(data || []);
    } catch (err: any) {
      Alert.alert('Gagal Memuat Riwayat', err?.message || 'Terjadi kesalahan.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredItems = items.filter((it) => {
    const status = computeStockStatus(Number(it.current_stock), Number(it.min_stock));
    if (statusFilter !== 'Semua' && status.label !== statusFilter) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      it.unit.toLowerCase().includes(q) ||
      (it.notes && it.notes.toLowerCase().includes(q))
    );
  });

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const cur = Number(item.current_stock);
    const min = Number(item.min_stock);
    const st = computeStockStatus(cur, min);

    return (
      <View
        className="bg-surface rounded-card p-4 mb-3.5 border border-line shadow-sm"
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-2">
            <Text className="font-heading-semibold text-text text-base" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="font-body text-muted text-xs mt-0.5">
              Satuan: <Text className="font-body-medium text-text">{item.unit}</Text> | Min: {min} {item.unit}
            </Text>
          </View>

          <Badge label={st.label} tone={st.tone} />
        </View>

        {/* Stock Numbers Indicator */}
        <View className="bg-background rounded-chip p-3 mb-3 border border-line flex-row items-center justify-between">
          <View>
            <Text className="font-body text-muted text-xs">Stok Saat Ini:</Text>
            <Text className="font-heading text-text text-xl mt-0.5">
              {cur} <Text className="text-sm font-body text-muted">{item.unit}</Text>
            </Text>
          </View>

          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => openMovementModal(item, 'Stock In')}
              className="bg-success-soft px-3 py-2 rounded-button border border-success/30 flex-row items-center"
            >
              <Ionicons name="add-circle-outline" size={16} color="#166534" />
              <Text className="font-heading-semibold text-success text-xs ml-1">Masuk</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openMovementModal(item, 'Stock Out')}
              className="bg-danger-soft px-3 py-2 rounded-button border border-danger/30 flex-row items-center"
            >
              <Ionicons name="remove-circle-outline" size={16} color="#991B1B" />
              <Text className="font-heading-semibold text-danger text-xs ml-1">Keluar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Actions (Delete button excluded per PRD 11.3) */}
        <View className="flex-row justify-between items-center pt-2.5 border-t border-line">
          <TouchableOpacity
            onPress={() => openHistoryModal(item)}
            className="flex-row items-center py-1"
          >
            <Ionicons name="time-outline" size={15} color="#D1001F" />
            <Text className="font-heading-semibold text-primary text-xs ml-1">Riwayat Stok</Text>
          </TouchableOpacity>

          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => openMovementModal(item, 'Stock Adjustment')}
              className="px-2.5 py-1.5 rounded-button bg-background border border-line flex-row items-center"
            >
              <Ionicons name="swap-vertical-outline" size={14} color="#1F2937" />
              <Text className="font-body-medium text-text text-xs ml-1">Opname</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openEditItemModal(item)}
              className="px-2.5 py-1.5 rounded-button bg-background border border-line flex-row items-center"
            >
              <Ionicons name="create-outline" size={14} color="#1F2937" />
              <Text className="font-body-medium text-text text-xs ml-1">Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Stok Bahan Kasir"
        subtitle="Pencatatan Stok Masuk & Keluar Barista"
        backTo="/(kasir)/pos"
      />

      <View
        className="flex-1 px-5 pt-4"
        style={isTablet ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : undefined}
      >
        {/* Search bar & Add Item Button */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari bahan baku..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-body text-sm text-text ml-2"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
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
            onPress={openAddItemModal}
          />
        </View>

        {/* Status Filter Tabs */}
        <View className="flex-row gap-2 mb-4">
          {(['Semua', 'Aman', 'Low Stock', 'Out of Stock'] as const).map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                accessibilityRole="button"
                onPress={() => setStatusFilter(st)}
                className={`flex-1 min-h-10 rounded-chip items-center justify-center border ${
                  active ? 'bg-primary border-primary' : 'bg-surface border-line'
                }`}
              >
                <Text className={`font-body-medium text-xs ${active ? 'text-white' : 'text-text'}`}>
                  {st}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content list with states */}
        {loading ? (
          <LoadingState label="Memuat data bahan baku..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchInventory} />
        ) : (
          <FlatList
            key={columns}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            refreshing={loading}
            onRefresh={fetchInventory}
            ListEmptyComponent={
              <EmptyState
                title={searchQuery ? 'Bahan Tidak Ditemukan' : 'Belum Ada Bahan Baku'}
                iconName="cube-outline"
                description="Tidak ada bahan baku yang cocok dengan filter pencarian."
                actionLabel="Tambah Bahan Baku Baru"
                onAction={openAddItemModal}
              />
            }
          />
        )}
      </View>

      {/* Modal 1: Form Tambah / Edit Bahan Baku */}
      <Modal
        visible={itemModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setItemModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View className={`flex-1 bg-black/50 ${isTablet ? 'justify-center items-center px-6' : 'justify-end'}`}>
            <TouchableOpacity
              accessibilityLabel="Tutup dialog"
              className="flex-1"
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setItemModalVisible(false);
              }}
            />
            <View
              className={`bg-surface ${
                isTablet
                  ? 'rounded-card p-6 shadow-xl border border-line'
                  : 'rounded-t-card p-6 border-t border-line'
              }`}
              style={isTablet ? { width: '100%', maxWidth: 580, maxHeight: '85%' } : { maxHeight: '85%' }}
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
                    {editingItem ? 'Edit Bahan Baku' : 'Tambah Bahan Baku Baru'}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setItemModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Input
                  label="Nama Bahan Baku *"
                  placeholder="Contoh: Biji Kopi Robusta"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (nameError) setNameError('');
                  }}
                  error={nameError}
                  leftIcon={<Ionicons name="cube-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Satuan Unit *"
                  placeholder="Contoh: gram, ml, pcs, kg, liter"
                  value={unit}
                  onChangeText={setUnit}
                  autoCapitalize="none"
                  leftIcon={<Ionicons name="speedometer-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Batas Minimum Stock *"
                  placeholder="Batas peringatan Low Stock (contoh: 1000)"
                  value={minStock}
                  onChangeText={setMinStock}
                  keyboardType="numeric"
                  leftIcon={<Ionicons name="alert-circle-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Catatan Bahan (Opsional)"
                  placeholder="Catatan penyimpanan atau supplier"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                  style={{ height: 60, textAlignVertical: 'top' }}
                />

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setItemModalVisible(false)}
                  />
                  <Button
                    title={editingItem ? 'Simpan' : 'Tambah'}
                    variant="primary"
                    className="flex-1"
                    isLoading={submittingItem}
                    icon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    onPress={handleSaveItem}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 2: Catat Mutasi Stok */}
      <Modal
        visible={movementModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMovementModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View className={`flex-1 bg-black/50 ${isTablet ? 'justify-center items-center px-6' : 'justify-end'}`}>
            <TouchableOpacity
              accessibilityLabel="Tutup dialog"
              className="flex-1"
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setMovementModalVisible(false);
              }}
            />
            <View
              className={`bg-surface ${
                isTablet
                  ? 'rounded-card p-6 shadow-xl border border-line'
                  : 'rounded-t-card p-6 border-t border-line'
              }`}
              style={isTablet ? { width: '100%', maxWidth: 580, maxHeight: '85%' } : { maxHeight: '85%' }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                contentContainerStyle={{ paddingBottom: 48 }}
              >
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="font-heading text-text text-xl">Catat Perubahan Stok</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setMovementModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text className="font-body text-muted text-xs mb-4">
                  Bahan: <Text className="font-heading-semibold text-text">{selectedItemForMovement?.name}</Text> (Stok Saat Ini: {selectedItemForMovement?.current_stock} {selectedItemForMovement?.unit})
                </Text>

                <ChoiceGroup
                  label="Jenis Perubahan Stok *"
                  value={movementType}
                  onChange={(val) => setMovementType(val as 'Stock In' | 'Stock Out' | 'Stock Adjustment')}
                  options={[
                    { value: 'Stock In', label: 'Stock In (+)' },
                    { value: 'Stock Out', label: 'Stock Out (-)' },
                    { value: 'Stock Adjustment', label: 'Opname (=)' },
                  ]}
                />

                <Input
                  label={movementType === 'Stock Adjustment' ? 'Stok Aktual Baru Hasil Opname *' : 'Jumlah Perubahan *'}
                  placeholder={`Masukkan angka dalam ${selectedItemForMovement?.unit || 'satuan'}`}
                  value={quantity}
                  onChangeText={(t) => {
                    setQuantity(t);
                    if (movementError) setMovementError('');
                  }}
                  keyboardType="numeric"
                  error={movementError}
                  leftIcon={<Ionicons name="calculator-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label={movementType === 'Stock In' ? 'Keterangan Masuk (Opsional)' : 'Keterangan Perubahan (Wajib) *'}
                  placeholder={
                    movementType === 'Stock In'
                      ? 'Contoh: Restock susu toko'
                      : movementType === 'Stock Out'
                      ? 'Wajib: Pemakaian racikan, Susu basi, tumpah'
                      : 'Wajib: Hasil hitung fisik timbangan'
                  }
                  value={movementNotes}
                  onChangeText={(t) => {
                    setMovementNotes(t);
                    if (movementError) setMovementError('');
                  }}
                  multiline
                  numberOfLines={2}
                  style={{ height: 60, textAlignVertical: 'top' }}
                />

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setMovementModalVisible(false)}
                  />
                  <Button
                    title="Simpan Mutasi"
                    variant="primary"
                    className="flex-1"
                    isLoading={submittingMovement}
                    icon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    onPress={handleSaveMovement}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal 3: Riwayat Mutasi Stok */}
      <Modal
        visible={historyModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View className={`flex-1 bg-black/50 ${isTablet ? 'justify-center items-center px-6' : 'justify-end'}`}>
          <TouchableOpacity
            accessibilityLabel="Tutup dialog"
            className="flex-1"
            activeOpacity={1}
            onPress={() => setHistoryModalVisible(false)}
          />
          <View
            className={`bg-surface ${
              isTablet
                ? 'rounded-card p-6 shadow-xl border border-line'
                : 'rounded-t-card p-6 border-t border-line'
            }`}
            style={isTablet ? { width: '100%', maxWidth: 580, height: '80%' } : { height: '80%' }}
          >
            <View className="flex-row justify-between items-center mb-1">
              <Text className="font-heading text-text text-xl">Riwayat Perubahan Stok</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setHistoryModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="min-h-11 min-w-11 items-center justify-center -mr-2"
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="font-body text-muted text-xs mb-4" numberOfLines={1}>
              {selectedItemHistory?.name} (Satuan: {selectedItemHistory?.unit})
            </Text>

            {loadingHistory ? (
              <LoadingState label="Memuat riwayat..." />
            ) : movementsHistory.length === 0 ? (
              <EmptyState
                title="Belum Ada Riwayat"
                iconName="time-outline"
                description="Bahan baku ini belum memiliki riwayat mutasi stok."
              />
            ) : (
              <FlatList
                data={movementsHistory}
                keyExtractor={(m) => m.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item: m }) => {
                  const isIn = m.movement_type === 'Stock In';
                  const isOut = m.movement_type === 'Stock Out';

                  return (
                    <View className="bg-background rounded-card p-3.5 mb-2.5 border border-line">
                      <View className="flex-row justify-between items-center mb-1">
                        <View className="flex-row items-center">
                          <Ionicons
                            name={isIn ? 'arrow-up-circle' : isOut ? 'arrow-down-circle' : 'swap-vertical'}
                            size={18}
                            color={isIn ? '#166534' : isOut ? '#991B1B' : '#B45309'}
                          />
                          <Text className="font-heading-semibold text-text text-sm ml-1.5">
                            {m.movement_type}
                          </Text>
                        </View>
                        <Text className="font-body text-muted text-xs">
                          {new Date(m.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>

                      <View className="flex-row justify-between items-center mt-1">
                        <Text className="font-body text-muted text-xs">
                          Stok: {m.stock_before} &rarr; <Text className="font-heading-semibold text-text">{m.stock_after} {selectedItemHistory?.unit}</Text>
                        </Text>
                        <Text
                          className={`font-heading text-sm ${
                            isIn ? 'text-success' : isOut ? 'text-danger' : 'text-amber-800'
                          }`}
                        >
                          {isIn ? `+${m.quantity}` : isOut ? `-${m.quantity}` : `${m.quantity}`} {selectedItemHistory?.unit}
                        </Text>
                      </View>

                      {m.notes ? (
                        <Text className="font-body text-muted text-xs mt-1.5 bg-surface p-2 rounded-chip border border-line">
                          {m.notes}
                        </Text>
                      ) : null}
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

