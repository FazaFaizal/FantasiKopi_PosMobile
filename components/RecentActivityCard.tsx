import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  ACTIVITY_FILTERS,
  ActivityRow,
  ActivityTone,
  describeActivity,
  formatActivityTime,
} from '../lib/activity-logic';

const TONE_STYLE: Record<ActivityTone, { bg: string; color: string }> = {
  success: { bg: 'bg-success-soft', color: '#166534' },
  warning: { bg: 'bg-warning-soft', color: '#B45309' },
  danger: { bg: 'bg-danger-soft', color: '#991B1B' },
  neutral: { bg: 'bg-background', color: '#4B5563' },
};

interface RecentActivityCardProps {
  /** Naikkan nilainya untuk memuat ulang (mis. saat dashboard di-refresh). */
  refreshKey?: number;
}

/**
 * Aktivitas operasional penting (PRD 27): buka/tutup sif, pembatalan/refund,
 * batal otomatis, koreksi metode bayar, mutasi stok, dan pengeluaran.
 */
export function RecentActivityCard({ refreshKey = 0 }: RecentActivityCardProps) {
  const router = useRouter();
  const [filterKey, setFilterKey] = useState(ACTIVITY_FILTERS[0].key);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const category = ACTIVITY_FILTERS.find((f) => f.key === filterKey)?.category ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase.rpc('get_recent_activity', { p_limit: 15, p_category: category });
    if (error) {
      setErrorMessage(error.message || 'Gagal memuat aktivitas.');
    } else {
      setRows((data as ActivityRow[] | null) || []);
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const now = new Date();

  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-3">
        <Ionicons name="pulse-outline" size={18} color="#1F2937" />
        <Text className="font-heading-semibold text-text text-lg ml-2">Aktivitas Operasional</Text>
      </View>

      <View className="flex-row gap-2 mb-3">
        {ACTIVITY_FILTERS.map((f) => {
          const active = f.key === filterKey;
          return (
            <TouchableOpacity
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilterKey(f.key)}
              className={`flex-1 min-h-11 rounded-chip items-center justify-center border ${
                active ? 'bg-primary border-primary' : 'bg-surface border-line'
              }`}
            >
              <Text className={`font-body-medium text-xs ${active ? 'text-white' : 'text-text'}`}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="bg-surface rounded-card border border-line p-3">
        {loading ? (
          <View className="py-6 items-center">
            <ActivityIndicator color="#D1001F" />
          </View>
        ) : errorMessage ? (
          <TouchableOpacity accessibilityRole="button" onPress={load} className="py-4 items-center min-h-11">
            <Text className="font-body text-danger text-xs text-center">{errorMessage}</Text>
            <Text className="font-heading-semibold text-primary text-xs mt-1">Coba lagi</Text>
          </TouchableOpacity>
        ) : rows.length === 0 ? (
          <Text className="text-muted text-xs text-center py-4 italic">Belum ada aktivitas tercatat.</Text>
        ) : (
          rows.map((row, idx) => {
            const view = describeActivity(row);
            const tone = TONE_STYLE[view.tone];
            return (
              <TouchableOpacity
                key={`${row.kind}-${row.ref_id}-${row.occurred_at}-${idx}`}
                accessibilityRole="button"
                accessibilityLabel={`${view.title}. ${view.detail}`}
                onPress={() => router.replace(view.route as never)}
                className={`flex-row items-start py-2.5 min-h-11 ${idx > 0 ? 'border-t border-line' : ''}`}
              >
                <View className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${tone.bg}`}>
                  <Ionicons name={view.icon as keyof typeof Ionicons.glyphMap} size={17} color={tone.color} />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="font-heading-semibold text-text text-xs" numberOfLines={2}>
                    {view.title}
                  </Text>
                  <Text className="font-body text-muted text-xs mt-0.5" numberOfLines={2}>
                    {view.detail}
                  </Text>
                </View>
                <Text className="font-body text-muted text-xs">{formatActivityTime(row.occurred_at, now)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}
