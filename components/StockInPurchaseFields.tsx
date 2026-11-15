import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './Input';
import { formatRupiah } from '../lib/formatters';
import { buildPurchaseExpenseDescription, parseRupiahInput } from '../lib/inventory-logic';

interface StockInPurchaseFieldsProps {
  isPurchase: boolean;
  onTogglePurchase: (next: boolean) => void;
  amountText: string;
  onChangeAmount: (text: string) => void;
  amountError?: string;
  itemName: string;
  unit: string;
  quantityText: string;
}

/**
 * Opsi "Stock In ini adalah pembelian" (#4). Jika dicentang, Stock In sekaligus
 * mencatat expense Raw Material bertanggal hari ini (uang keluar pada hari itu).
 */
export function StockInPurchaseFields({
  isPurchase,
  onTogglePurchase,
  amountText,
  onChangeAmount,
  amountError,
  itemName,
  unit,
  quantityText,
}: StockInPurchaseFieldsProps) {
  const quantity = Number((quantityText || '').trim().replace(',', '.'));
  const amount = parseRupiahInput(amountText);
  const previewDescription =
    quantity > 0 ? buildPurchaseExpenseDescription(itemName, quantity, unit) : `Pembelian ${itemName}`;

  return (
    <View className="mb-2">
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isPurchase }}
        accessibilityLabel="Catat juga sebagai biaya pembelian"
        onPress={() => onTogglePurchase(!isPurchase)}
        className="flex-row items-center mb-3 min-h-11"
      >
        <Ionicons
          name={isPurchase ? 'checkbox' : 'square-outline'}
          size={22}
          color={isPurchase ? '#D1001F' : '#6B7280'}
        />
        <View className="ml-2 flex-1">
          <Text className="font-body-medium text-text text-sm">Ini pembelian, catat sebagai biaya</Text>
          <Text className="font-body text-muted text-xs">
            Masuk ke Expense hari ini (Raw Material). Kosongkan jika bukan pembelian.
          </Text>
        </View>
      </TouchableOpacity>

      {isPurchase && (
        <>
          <Input
            label="Total Harga Pembelian *"
            placeholder="Contoh: 90.000"
            value={amountText}
            onChangeText={onChangeAmount}
            keyboardType="number-pad"
            error={amountError}
            leftIcon={<Ionicons name="cash-outline" size={18} color="#6B7280" />}
          />
          <View className="bg-background border border-line rounded-card p-3 mb-2">
            <Text className="font-body text-muted text-xs">Akan dicatat sebagai expense:</Text>
            <Text className="font-body-medium text-text text-xs mt-0.5">{previewDescription}</Text>
            <Text className="font-heading-semibold text-primary text-sm mt-0.5">
              {amount > 0 ? formatRupiah(amount) : 'Belum diisi'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
