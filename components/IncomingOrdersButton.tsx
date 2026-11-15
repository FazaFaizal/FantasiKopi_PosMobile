import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRupiah } from '../lib/formatters';
import { formatCountdown, getPaymentTimeLeftMs } from '../lib/order-logic';
import {
  IncomingOrderRow,
  formatBadgeCount,
  groupIncomingOrders,
} from '../lib/incoming-orders-logic';

interface IncomingOrdersButtonProps {
  orders: IncomingOrderRow[];
  onOpenOrder: (orderId: string) => void;
  onOpenAll: () => void;
}

/**
 * Tombol lonceng di header POS. Badge = pesanan customer yang perlu ditindaklanjuti kasir.
 * Mengetuknya membuka panel berisi daftar pesanan; mengetuk pesanan membuka detailnya.
 */
export function IncomingOrdersButton({ orders, onOpenOrder, onOpenAll }: IncomingOrdersButtonProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Hitung mundur batas bayar hanya berjalan saat panel terbuka.
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const groups = useMemo(() => groupIncomingOrders(orders, now), [orders, now]);
  const badge = formatBadgeCount(groups.total);
  const panelWidth = Math.min(400, width - 24);

  const select = (orderId: string) => {
    setOpen(false);
    onOpenOrder(orderId);
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={groups.total > 0 ? `Pesanan masuk, ${groups.total} perlu ditangani` : 'Pesanan masuk, tidak ada'}
        onPress={() => setOpen(true)}
        className="w-11 h-11 rounded-full bg-white/15 items-center justify-center"
      >
        <Ionicons name={groups.total > 0 ? 'notifications' : 'notifications-outline'} size={20} color="#FFFFFF" />
        {badge ? (
          <View
            className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-white items-center justify-center border border-primary-dark"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className="font-heading text-primary-dark text-xs leading-4">{badge}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tutup daftar pesanan masuk"
            activeOpacity={1}
            onPress={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <View
            className="absolute bg-surface rounded-card border border-line shadow-xl"
            style={{ top: insets.top + 64, right: 12, width: panelWidth, maxHeight: height - insets.top - 96 }}
            accessibilityViewIsModal
          >
            <View className="flex-row items-center justify-between px-4 pt-3 pb-2 border-b border-line">
              <View className="flex-1 mr-2">
                <Text className="font-heading text-text text-base">Pesanan masuk</Text>
                <Text className="font-body text-muted text-xs">
                  {groups.total > 0 ? `${groups.total} pesanan perlu ditangani` : 'Belum ada pesanan dari aplikasi customer'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                onPress={() => setOpen(false)}
                className="w-11 h-11 -mr-2 items-center justify-center"
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
              {groups.total === 0 ? (
                <View className="items-center px-6 py-8">
                  <Ionicons name="notifications-off-outline" size={28} color="#6B7280" />
                  <Text className="font-body text-muted text-sm text-center mt-2">
                    Pesanan customer yang harus dibayar di kasir atau sudah lunas lewat QRIS online akan muncul di sini.
                  </Text>
                </View>
              ) : null}

              {groups.awaitingPayment.length > 0 ? (
                <Section title={`Menunggu pembayaran (${groups.awaitingPayment.length})`}>
                  {groups.awaitingPayment.map((o) => {
                    const left = getPaymentTimeLeftMs(o, now) ?? 0;
                    const urgent = left < 3 * 60_000;
                    return (
                      <OrderRow
                        key={o.id}
                        order={o}
                        onPress={() => select(o.id)}
                        status={`Bayar di kasir · sisa ${formatCountdown(left)}`}
                        statusClass={urgent ? 'text-danger' : 'text-warning'}
                      />
                    );
                  })}
                </Section>
              ) : null}

              {groups.paidOnlineToPrepare.length > 0 ? (
                <Section title={`Lunas online, siapkan (${groups.paidOnlineToPrepare.length})`}>
                  {groups.paidOnlineToPrepare.map((o) => (
                    <OrderRow
                      key={o.id}
                      order={o}
                      onPress={() => select(o.id)}
                      status="Sudah dibayar QRIS online"
                      statusClass="text-success"
                    />
                  ))}
                </Section>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                onOpenAll();
              }}
              className="min-h-12 flex-row items-center justify-center border-t border-line"
            >
              <Text className="font-heading-semibold text-primary text-sm mr-1">Buka Riwayat Transaksi</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1001F" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="pt-3">
      <Text className="font-body-semibold text-muted text-xs px-4 mb-1">{title}</Text>
      {children}
    </View>
  );
}

function OrderRow({
  order,
  status,
  statusClass,
  onPress,
}: {
  order: IncomingOrderRow;
  status: string;
  statusClass: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${order.order_number}, ${order.customer_name || 'Pelanggan'}, ${formatRupiah(
        Number(order.total_amount)
      )}. ${status}. Buka detail`}
      onPress={onPress}
      className="flex-row items-center px-4 py-2.5 min-h-14 border-t border-line"
    >
      <View className="flex-1 mr-2">
        <View className="flex-row items-center">
          <Text className="font-heading-semibold text-text text-sm mr-2">{order.order_number}</Text>
          {order.order_type ? <Text className="font-body text-muted text-xs">{order.order_type}</Text> : null}
        </View>
        <Text className="font-body text-text text-xs mt-0.5" numberOfLines={1}>
          {order.customer_name || 'Pelanggan'} · {order.payment_method || '-'}
        </Text>
        <Text className={`font-body-medium text-xs mt-0.5 ${statusClass}`}>{status}</Text>
      </View>
      <Text className="font-heading-semibold text-primary text-sm mr-1">{formatRupiah(Number(order.total_amount))}</Text>
      <Ionicons name="chevron-forward" size={16} color="#6B7280" />
    </TouchableOpacity>
  );
}
