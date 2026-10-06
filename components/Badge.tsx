import React from 'react';
import { Text, View } from 'react-native';

export type BadgeTone = 'success' | 'danger' | 'neutral' | 'accent' | 'warning';

const TONES: Record<BadgeTone, { box: string; text: string }> = {
  success: { box: 'bg-success-soft border border-success/30', text: 'text-success' },
  danger: { box: 'bg-danger-soft border border-danger/30', text: 'text-danger' },
  warning: { box: 'bg-warning-soft border border-warning/30', text: 'text-warning' },
  neutral: { box: 'bg-surface border border-line', text: 'text-text' },
  accent: { box: 'bg-primary-soft border border-primary/20', text: 'text-primary' },
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View className={`px-2.5 py-1 rounded-chip self-start flex-row items-center ${t.box}`}>
      {icon && <View style={{ marginRight: 4 }}>{icon}</View>}
      <Text className={`font-body-medium text-xs ${t.text}`}>{label}</Text>
    </View>
  );
}

export function statusTone(status: string): BadgeTone {
  return status === 'Aktif' ? 'success' : 'danger';
}

