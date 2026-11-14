import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRupiah } from '../lib/formatters';
import { CUSTOMER_PAYMENT_TIMEOUT_MINUTES } from '../lib/order-logic';
import type { IncomingCustomerOrder } from '../hooks/useAwaitingCustomerOrders';

interface IncomingOrderBannerProps {
  order: IncomingCustomerOrder | null;
  onOpen: () => void;
  onDismiss: () => void;
}

/** Durasi banner tampil sebelum tertutup sendiri. */
const AUTO_HIDE_MS = 12_000;

/**
 * Notifikasi di atas layar mana pun (POS, Kas, dst.) saat customer membuat pesanan
 * dari aplikasi, agar kasir segera menerima pembayarannya sebelum batas waktu habis.
 */
export function IncomingOrderBanner({ order, onOpen, onDismiss }: IncomingOrderBannerProps) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!order) return;
    const timer = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [order, onDismiss]);

  if (!order) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50, alignItems: 'center' }}
    >
      <View
        accessibilityLiveRegion="assertive"
        className="w-full max-w-lg bg-surface border border-primary/40 rounded-card shadow-lg flex-row items-center pl-3"
      >
        <View className="w-9 h-9 rounded-full bg-primary items-center justify-center mr-3">
          <Ionicons name="notifications" size={18} color="#FFFFFF" />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Pesanan baru ${order.order_number}, buka daftar pesanan`}
          onPress={() => {
            onDismiss();
            onOpen();
          }}
          className="flex-1 py-3"
        >
          <Text className="font-heading-semibold text-text text-sm" numberOfLines={1}>
            {order.paidOnline ? 'Pesanan online lunas' : 'Pesanan baru'}: {order.order_number}
          </Text>
          <Text className="font-body text-muted text-xs mt-0.5" numberOfLines={1}>
            {order.customer_name || 'Pelanggan'} · {formatRupiah(order.total_amount)} · {order.payment_method}
          </Text>
          <Text className="font-body-medium text-primary text-xs mt-0.5">
            {order.paidOnline
              ? 'Sudah dibayar QRIS online · Ketuk untuk menyiapkan'
              : `Terima pembayaran dalam ${CUSTOMER_PAYMENT_TIMEOUT_MINUTES} menit · Ketuk untuk membuka`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Tutup notifikasi pesanan baru"
          onPress={onDismiss}
          className="w-11 h-11 items-center justify-center"
        >
          <Ionicons name="close" size={18} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
