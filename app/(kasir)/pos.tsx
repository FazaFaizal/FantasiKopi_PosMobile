import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';

export default function KasirPOS() {
  const { signOut, user } = useAuth();
  const router = useRouter();
  const { isTablet } = useResponsive();

  const [inventorySummary, setInventorySummary] = useState({
    total: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchInventoryStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('inventory_items')
        .select('id, is_deleted, current_stock, min_stock')
        .eq('is_deleted', false);

      const items = data || [];
      let low = 0;
      let out = 0;

      items.forEach((item) => {
        if (Number(item.current_stock) <= 0) {
          out += 1;
        } else if (Number(item.current_stock) <= Number(item.min_stock)) {
          low += 1;
        }
      });

      setInventorySummary({
        total: items.length,
        lowStock: low,
        outOfStock: out,
      });
    } catch (err: any) {
      console.error('Error fetching inventory summary for kasir:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInventoryStatus();
  }, [fetchInventoryStatus]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInventoryStatus();
  };

  const handleLogout = () => {
    Alert.alert('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari sesi kasir?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Terminal POS Kasir"
        subtitle="Fantasi Coffee Point of Sale"
        rightAction={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Keluar dari sesi kasir"
            onPress={handleLogout}
            className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-chip"
          >
            <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
            <Text className="font-body-medium text-white text-xs ml-1.5">Keluar</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: isTablet ? 28 : 20,
          paddingBottom: 110,
          maxWidth: 1200,
          width: '100%',
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D1001F']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Kasir Profile Hero Card */}
        <View className="bg-surface rounded-card p-5 border border-line shadow-sm mb-5 flex-row items-center">
          <View className="w-13 h-13 rounded-chip bg-amber-500/10 items-center justify-center mr-3.5 border border-amber-500/20">
            <Ionicons name="storefront-outline" size={26} color="#B45309" />
          </View>
          <View className="flex-1">
            <Text className="font-body text-muted text-xs">Petugas Kasir Bertugas</Text>
            <Text className="font-heading-semibold text-text text-base" numberOfLines={1}>
              {user?.email}
            </Text>
            <View className="flex-row gap-2 mt-1.5">
              <Badge
                label="Role: Kasir"
                tone="warning"
                icon={<Ionicons name="storefront" size={12} color="#B45309" />}
              />
              <Badge label="Status: Aktif" tone="success" />
            </View>
          </View>
        </View>

        {/* Iteration 2 Feature Card: Kelola Bahan Baku */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push('/(kasir)/inventory')}
          activeOpacity={0.8}
          className="bg-surface rounded-card p-5 border border-line shadow-sm mb-5"
        >
          <View className="flex-row items-start mb-2">
            <View className="w-12 h-12 rounded-card bg-emerald-500/10 items-center justify-center mr-3.5 border border-emerald-500/20">
              <Ionicons name="cube-outline" size={24} color="#047857" />
            </View>
            <View className="flex-1 mr-2">
              <View className="flex-row items-center">
                <Text className="font-heading-semibold text-text text-base">Kelola Stok Bahan Baku</Text>
                <View className="ml-2">
                  <Badge label="Iterasi 2" tone="accent" />
                </View>
              </View>
              <Text className="font-body text-muted text-xs mt-1 leading-4">
                Catat barang masuk dari supplier, pemakaian harian, dan opname stok fisik kedai.
              </Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View className="bg-background rounded-chip p-3 mt-2 flex-row justify-between items-center border border-line">
            <Text className="font-body text-muted text-xs">
              Total Bahan: <Text className="font-heading-semibold text-text">{inventorySummary.total}</Text>
            </Text>
            {inventorySummary.lowStock > 0 || inventorySummary.outOfStock > 0 ? (
              <View className="flex-row items-center">
                <Ionicons name="warning" size={14} color="#D97706" />
                <Text className="font-body-medium text-warning text-xs ml-1">
                  {inventorySummary.lowStock + inventorySummary.outOfStock} perlu restock
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={14} color="#166534" />
                <Text className="font-body-medium text-success text-xs ml-1">Stok Aman</Text>
              </View>
            )}
          </View>

          <View className="mt-3 pt-3 border-t border-line flex-row justify-between items-center">
            <Text className="font-body text-muted text-xs">Catat mutasi stok masuk / keluar</Text>
            <View className="flex-row items-center">
              <Text className="font-heading-semibold text-primary text-xs mr-1">Buka Inventaris</Text>
              <Ionicons name="chevron-forward" size={14} color="#D1001F" />
            </View>
          </View>
        </TouchableOpacity>

        {/* Milestone Card - POS System Roadmap */}
        <View className="bg-surface rounded-card p-5 border border-line shadow-sm mb-5">
          <View className="flex-row items-center mb-2">
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-2.5">
              <Ionicons name="receipt-outline" size={18} color="#D1001F" />
            </View>
            <Text className="font-heading-semibold text-text text-base">Terminal Kasir POS</Text>
          </View>
          <Text className="font-body text-muted text-xs leading-5">
            Fitur transaksi kasir, input pesanan meja/takeaway, perhitungan diskon, dan pembayaran tunai/QRIS akan aktif di Iterasi 3.
          </Text>

          <View className="mt-4 pt-4 border-t border-line">
            <Text className="font-heading-semibold text-text text-sm mb-2">Jadwal Tahapan:</Text>

            <View className="flex-row items-start mb-2">
              <Ionicons
                name="checkmark-circle"
                size={16}
                color="#166534"
                style={{ marginTop: 2, marginRight: 8 }}
              />
              <View className="flex-1">
                <Text className="font-heading-semibold text-text text-xs">Iterasi 1: Autentikasi & Akun</Text>
                <Text className="font-body text-muted text-xs">Selesai terverifikasi</Text>
              </View>
            </View>

            <View className="flex-row items-start mb-2">
              <Ionicons
                name="play-circle"
                size={16}
                color="#D1001F"
                style={{ marginTop: 2, marginRight: 8 }}
              />
              <View className="flex-1">
                <Text className="font-heading-semibold text-primary text-xs">
                  Iterasi 2: Katalog Produk & Stok Bahan Baku (Aktif)
                </Text>
                <Text className="font-body text-muted text-xs">
                  Akses modul inventaris melalui tab bar di bawah atau tombol di atas.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <Ionicons
                name="time-outline"
                size={16}
                color="#6B7280"
                style={{ marginTop: 2, marginRight: 8 }}
              />
              <View className="flex-1">
                <Text className="font-heading-semibold text-muted text-xs">
                  Iterasi 3: Transaksi Kasir, Keranjang & Pembayaran
                </Text>
                <Text className="font-body text-muted text-xs">Akan dikerjakan pada iterasi berikutnya</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Logout Card */}
        <View className="bg-surface rounded-card p-5 border border-line shadow-sm">
          <Text className="font-heading-semibold text-text text-base mb-1">Manajemen Sesi</Text>
          <Text className="font-body text-muted text-xs mb-4">
            Pastikan keluar dari sesi aplikasi kasir setelah selesai bertugas di kedai.
          </Text>
          <Button
            title="Keluar dari Sesi Kasir"
            variant="outline"
            icon={<Ionicons name="log-out-outline" size={18} color="#D1001F" />}
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </View>
  );
}
