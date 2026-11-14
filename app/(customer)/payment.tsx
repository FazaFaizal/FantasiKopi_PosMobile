import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/States';
import { formatRupiah } from '../../lib/formatters';
import { OrderRecord, formatCountdown, getPaymentTimeLeftMs } from '../../lib/order-logic';
import { classifyPaymentNavigation } from '../../lib/payment-gateway-logic';

type PaymentOrder = Pick<
  OrderRecord,
  'id' | 'order_number' | 'total_amount' | 'order_status' | 'payment_status' | 'payment_due_at' | 'payment_channel'
>;

const ORDER_COLUMNS = 'id, order_number, total_amount, order_status, payment_status, payment_due_at, payment_channel';

/**
 * Pembayaran QRIS online di dalam aplikasi: halaman Midtrans Snap ditampilkan lewat WebView
 * (tanpa tab browser). Status lunas/batal diikuti dari database (webhook Midtrans → realtime),
 * bukan dari isi halaman Midtrans.
 */
export default function PaymentScreen() {
  const router = useRouter();
  const { orderId, url } = useLocalSearchParams<{ orderId?: string; url?: string }>();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [webError, setWebError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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

  const handleNavigation = useCallback((targetUrl: string) => {
    const kind = classifyPaymentNavigation(targetUrl);
    if (kind === 'load') return true;
    if (kind === 'external') {
      // Mis. tombol "buka aplikasi GoPay/ShopeePay" di halaman Midtrans.
      Linking.openURL(targetUrl).catch(() =>
        Alert.alert('Aplikasi Tidak Ditemukan', 'Aplikasi pembayaran tidak terpasang. Simpan atau scan QR untuk membayar.')
      );
    }
    return false;
  }, []);

  const renderBody = () => {
    if (!orderId || !url) {
      return (
        <ErrorState
          message="Halaman pembayaran tidak ditemukan. Buka kembali dari Pesanan Saya."
          onRetry={() => router.replace('/(customer)/orders')}
        />
      );
    }
    if (paid) {
      return (
        <View className="flex-1 items-center justify-center px-8" accessibilityLiveRegion="polite">
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
        <View className="flex-1 items-center justify-center px-8" accessibilityLiveRegion="polite">
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
    if (webError) {
      return (
        <ErrorState
          message={webError}
          onRetry={() => {
            setWebError('');
            setReloadKey((k) => k + 1);
          }}
        />
      );
    }
    return (
      <WebView
        key={reloadKey}
        source={{ uri: url }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(req) => handleNavigation(req.url)}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 items-center justify-center bg-background">
            <ActivityIndicator color="#D1001F" />
            <Text className="font-body text-muted text-xs mt-2">Memuat halaman pembayaran...</Text>
          </View>
        )}
        onError={(e) => setWebError(e.nativeEvent.description || 'Gagal memuat halaman pembayaran.')}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setWebError('Halaman pembayaran sedang bermasalah. Coba lagi.');
        }}
      />
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Bayar QRIS" subtitle={order?.order_number ?? 'Pembayaran online'} backTo="/(customer)/orders" />

      {order && !paid && !closed && (
        <View className="flex-row items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200">
          <Text className="font-heading-semibold text-amber-800 text-sm">{formatRupiah(Number(order.total_amount))}</Text>
          {left !== null && (
            <Text className="font-heading-semibold text-amber-800 text-xs" accessibilityLiveRegion="polite">
              Sisa waktu {formatCountdown(left)}
            </Text>
          )}
        </View>
      )}

      <View className="flex-1">{renderBody()}</View>
    </View>
  );
}
