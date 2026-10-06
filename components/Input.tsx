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
          className={`w-full min-h-12 bg-surface border ${
            error ? 'border-primary' : 'border-line'
          } rounded-input px-4 py-3 font-body text-base text-text ${
            leftIcon ? 'pl-11' : ''
          } ${secureToggle ? 'pr-12' : ''} ${className || ''}`}
          placeholderTextColor="#6B7280"
          secureTextEntry={isHidden}
          {...props}
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
        <Text className="font-body text-primary text-xs mt-1.5">{error}</Text>
      ) : hint ? (
        <Text className="font-body text-muted text-xs mt-1.5">{hint}</Text>
      ) : null}
    </View>
  );
}

