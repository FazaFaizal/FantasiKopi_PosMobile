import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Pilihan tunggal (role, status). Terpilih memakai fill primary; tidak terpilih memakai garis.
export function ChoiceGroup<T extends string>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  return (
    <View className="mb-4">
      <Text className="font-body-medium text-text text-sm mb-2">{label}</Text>
      <View className="flex-row gap-2">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(opt.value)}
              className={`flex-1 min-h-12 rounded-button items-center justify-center border ${
                selected ? 'bg-primary border-primary' : 'bg-surface border-line'
              }`}
            >
              <Text className={`font-heading-semibold text-sm ${selected ? 'text-white' : 'text-text'}`}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
