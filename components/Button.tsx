import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, TouchableOpacityProps, View } from 'react-native';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

const STYLES: Record<Variant, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-primary shadow-sm active:bg-primary-dark', text: 'text-white', spinner: '#FFFFFF' },
  secondary: { box: 'bg-secondary shadow-sm active:bg-secondary-dark', text: 'text-text', spinner: '#1F2937' },
  outline: { box: 'bg-transparent border border-primary active:bg-primary/5', text: 'text-primary', spinner: '#D1001F' },
  ghost: { box: 'bg-transparent active:bg-black/5', text: 'text-primary', spinner: '#D1001F' },
  danger: { box: 'bg-danger shadow-sm active:bg-red-900', text: 'text-white', spinner: '#FFFFFF' },
};

const SIZES: Record<Size, { container: string; text: string }> = {
  sm: { container: 'min-h-10 px-3.5 py-1.5', text: 'text-xs' },
  md: { container: 'min-h-12 px-5 py-2.5', text: 'text-sm' },
  lg: { container: 'min-h-14 px-6 py-3.5', text: 'text-base' },
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  isLoading,
  icon,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const style = STYLES[variant];
  const sizeStyle = SIZES[size];
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!isLoading }}
      activeOpacity={0.75}
      disabled={isDisabled}
      className={`rounded-button items-center justify-center flex-row ${sizeStyle.container} ${style.box} ${
        isDisabled ? 'opacity-50' : ''
      } ${className || ''}`}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={style.spinner} style={{ marginRight: 8 }} />
      ) : icon ? (
        <View style={{ marginRight: 8 }}>{icon}</View>
      ) : null}
      <Text className={`font-heading-semibold text-center ${sizeStyle.text} ${style.text}`}>{title}</Text>
    </TouchableOpacity>
  );
}

