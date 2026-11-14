import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { LoadingState } from './States';

interface ShiftRequiredNoticeProps {
  loading: boolean;
  onOpenCash: () => void;
  onRetry: () => void;
}

/** Ditampilkan di POS saat belum ada sif kasir aktif (POS terkunci). */
export function ShiftRequiredNotice({ loading, onOpenCash, onRetry }: ShiftRequiredNoticeProps) {
  if (loading) return <LoadingState label="Memeriksa sif kasir..." />;

  return (
    <View className="flex-1 items-center justify-center p-6">
      <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
        <Ionicons name="lock-closed-outline" size={30} color="#D1001F" />
      </View>
      <Text className="font-heading text-text text-lg text-center">Sif kasir belum dibuka</Text>
      <Text className="font-body text-muted text-sm text-center mt-1 mb-5" style={{ maxWidth: 360 }}>
        Buka sif terlebih dahulu dan hitung modal awal di laci. Transaksi dan pembayaran akan tercatat ke sif tersebut.
      </Text>
      <Button
        title="Buka Sif di Kas Harian"
        onPress={onOpenCash}
        icon={<Ionicons name="lock-open-outline" size={16} color="#FFFFFF" />}
      />
      <Text accessibilityRole="button" onPress={onRetry} className="font-body-medium text-primary text-xs mt-4 p-2">
        Sudah dibuka? Periksa ulang
      </Text>
    </View>
  );
}
