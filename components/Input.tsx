import React, { useState } from 'react';
import { TextInput, TextInputProps, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
  secureToggle?: boolean;
  leftIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  containerClassName,
  className,
  secureToggle,
  secureTextEntry,
  leftIcon,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isHidden = secureToggle ? !showPassword : secureTextEntry;

  return (
    <View className={`mb-4 w-full ${containerClassName || ''}`}>
      {label && <Text className="text-text font-body-medium text-sm mb-2">{label}</Text>}
      <View className="relative justify-center">
        {leftIcon && (
          <View className="absolute left-3.5 z-10 items-center justify-center pointer-events-none">
            {leftIcon}
          </View>
        )}
        <TextInput
          accessibilityLabel={label}
          className={`w-full bg-surface border ${
            error ? 'border-danger' : 'border-line-strong'
          } rounded-input px-4 font-body text-text ${
            leftIcon ? 'pl-11' : ''
          } ${secureToggle ? 'pr-12' : ''} ${className || ''}`}
          placeholderTextColor="#6B7280"
          secureTextEntry={isHidden}
          {...props}
          // Ukuran teks lewat style, bukan kelas text-base: kelas itu ikut memasang lineHeight 24,
          // dan di Android TextInput ber-lineHeight memotong bagian atas/bawah huruf.
          style={[
            {
              fontSize: 16,
              minHeight: 48,
              paddingVertical: props.multiline ? 12 : 0,
              textAlignVertical: props.multiline ? 'top' : 'center',
              includeFontPadding: false,
            },
            props.style,
          ]}
        />
        {secureToggle && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="absolute right-3.5 py-2 px-1 z-10 items-center justify-center"
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        // Error tidak hanya lewat warna: ikon + teks, dan diumumkan ke pembaca layar.
        <View className="flex-row items-start mt-1.5" accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Ionicons name="alert-circle" size={14} color="#991B1B" style={{ marginTop: 1, marginRight: 4 }} />
          <Text className="font-body text-danger text-xs flex-1">{error}</Text>
        </View>
      ) : hint ? (
        <Text className="font-body text-muted text-xs mt-1.5">{hint}</Text>
      ) : null}
    </View>
  );
}

