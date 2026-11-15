import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/States';
import { formatRupiah } from '../../lib/formatters';
import { OrderRecord, formatCountdown, getPaymentTimeLeftMs } from '../../lib/order-logic';
import { isSandboxQrUrl } from '../../lib/payment-gateway-logic';

type PaymentOrder = Pick<
  OrderRecord,
  'id' | 'order_number' | 'total_amount' | 'order_status' | 'payment_status' | 'payment_due_at' | 'payment_channel'
>;

const ORDER_COLUMNS = 'id, order_number, total_amount, order_status, payment_status, payment_due_at, payment_channel';

/**
 * Pembayaran QRIS online di dalam aplikasi: hanya gambar QR dari Midtrans, dengan nominal
 * dan hitung mundur bergaya aplikasi. Status lunas/batal diikuti dari database
 * (webhook Midtrans → realtime), bukan dari aplikasi.
 */
export default function PaymentScreen() {
  const router = useRouter();
  const { orderId, qrUrl } = useLocalSearchParams<{ orderId?: string; qrUrl?: string }>();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState(false);
  const [qrKey, setQrKey] = useState(0);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    const { data } = await supabase.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
    if (data) setOrder(data as PaymentOrder);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
    if (!orderId) return;
    const channel = supabase
      .channel(`payment-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        setOrder((prev) => (prev ? { ...prev, ...(payload.new as Partial<PaymentOrder>) } : (payload.new as PaymentOrder)));
      })
      .subscribe();
    // Cadangan bila realtime terlambat.
    const poll = setInterval(loadOrder, 5000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [orderId, loadOrder]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const paid = order?.payment_status === 'Paid';
  const left = order ? getPaymentTimeLeftMs(order, now) : null;
  const closed = order?.order_status === 'Cancelled' || (left !== null && left <= 0);
  const urgent = left !== null && left < 60_000;

  const renderBody = () => {
    if (!orderId || !qrUrl) {
      return (
        <ErrorState
          message="QRIS tidak ditemukan. Buka kembali dari Pesanan Saya."
          onRetry={() => router.replace('/(customer)/orders')}
        />
      );
    }
    if (paid) {
      return (
        <View className="items-center px-8 pt-16" accessibilityLiveRegion="polite">
          <View className="w-20 h-20 rounded-full bg-success-soft items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={48} color="#166534" />
          </View>
          <Text className="font-heading-bold text-text text-xl text-center">Pembayaran Berhasil</Text>
          <Text className="font-body text-muted text-sm text-center mt-2 mb-6">
            Pesanan {order?.order_number} sudah lunas dan sedang disiapkan.
          </Text>
          <Button title="Lihat Pesanan Saya" onPress={() => router.replace('/(customer)/orders')} />
        </View>
      );
    }
    if (closed) {
      return (
        <View className="items-center px-8 pt-16" accessibilityLiveRegion="polite">
          <View className="w-20 h-20 rounded-full bg-danger-soft items-center justify-center mb-4">
            <Ionicons name="time-outline" size={44} color="#991B1B" />
          </View>
          <Text className="font-heading-bold text-text text-xl text-center">Batas Waktu Pembayaran Habis</Text>
          <Text className="font-body text-muted text-sm text-center mt-2 mb-6">
            Pesanan dibatalkan otomatis karena QRIS tidak dibayar. Silakan pesan kembali.
          </Text>
          <Button title="Kembali ke Menu" onPress={() => router.replace('/(customer)/product')} />
        </View>
      );
    }

    return (
      <View className="w-full max-w-md self-center px-4 pt-4 pb-10">
        {/* Nominal & hitung mundur */}
        <View className="bg-surface rounded-card border border-line p-4 items-center mb-4">
          <Text className="font-body text-muted text-xs">Total Pembayaran</Text>
          <Text className="font-heading-bold text-primary text-3xl mt-1">
            {order ? formatRupiah(Number(order.total_amount)) : '-'}
          </Text>
          {left !== null && (
            <View
              accessibilityLiveRegion="polite"
              className={`flex-row items-center mt-3 px-3 py-1.5 rounded-full ${urgent ? 'bg-danger-soft' : 'bg-amber-50'}`}
            >
              <Ionicons name="time-outline" size={14} color={urgent ? '#991B1B' : '#B45309'} />
              <Text className={`font-heading-semibold text-xs ml-1.5 ${urgent ? 'text-danger' : 'text-amber-800'}`}>
                Selesaikan dalam {formatCountdown(left)}
              </Text>
            </View>
          )}
        </View>

        {/* Gambar QR dari Midtrans */}
        <View className="bg-white rounded-card border border-line p-5 items-center">
          <Text className="font-heading-bold text-text text-base tracking-widest mb-1">QRIS</Text>
          <Text className="font-body text-muted text-[11px] mb-3">{order?.order_number ?? ''}</Text>
          <View className="w-64 h-64 items-center justify-center">
            {qrError ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setQrError(false);
                  setQrLoading(true);
                  setQrKey((k) => k + 1);
                }}
                className="items-center min-h-11 justify-center"
              >
                <Ionicons name="refresh" size={28} color="#D1001F" />
                <Text className="font-body text-danger text-xs mt-2 text-center">QR gagal dimuat. Ketuk untuk memuat ulang.</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Image
                  key={qrKey}
                  source={{ uri: qrUrl }}
                  accessibilityLabel={`Kode QRIS untuk membayar ${order ? formatRupiah(Number(order.total_amount)) : ''}`}
                  style={{ width: 256, height: 256 }}
                  resizeMode="contain"
                  onLoadEnd={() => setQrLoading(false)}
                  onError={() => {
                    setQrLoading(false);
                    setQrError(true);
                  }}
                />
                {qrLoading && (
                  <View className="absolute inset-0 items-center justify-center">
                    <ActivityIndicator color="#D1001F" />
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Petunjuk */}
        <View className="bg-surface rounded-card border border-line p-4 mt-4">
          <Text className="font-heading-semibold text-text text-sm mb-2">Cara membayar</Text>
          {[
            'Buka aplikasi e-wallet atau m-banking yang mendukung QRIS.',
            'Scan kode QR di atas, lalu konfirmasi pembayaran.',
            'Pesanan otomatis diproses setelah pembayaran berhasil.',
          ].map((step, i) => (
            <View key={step} className="flex-row mb-1.5">
              <Text className="font-heading-semibold text-primary text-xs w-5">{i + 1}.</Text>
              <Text className="font-body text-text text-xs flex-1 leading-4">{step}</Text>
            </View>
          ))}
          <Text className="font-body text-muted text-[11px] mt-1 leading-4">
            Memesan dari HP yang sama? Screenshot QR ini, lalu pilih &quot;scan dari galeri&quot; di aplikasi pembayaranmu.
          </Text>
        </View>

        {/* Mode uji: bagikan tautan QR ke simulator Midtrans */}
        {isSandboxQrUrl(qrUrl) && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => Share.share({ message: qrUrl })}
            className="mt-4 min-h-11 flex-row items-center justify-center border border-dashed border-line rounded-chip px-3"
          >
            <Ionicons name="share-outline" size={16} color="#4B5563" />
            <Text className="font-body-medium text-muted text-xs ml-1.5">Bagikan link QR (mode uji / simulator)</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Bayar QRIS" subtitle={order?.order_number ?? 'Pembayaran online'} backTo="/(customer)/orders" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{renderBody()}</ScrollView>
    </View>
  );
}
