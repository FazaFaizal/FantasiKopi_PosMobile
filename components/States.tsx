import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "./Button";
import { Ionicons } from "@expo/vector-icons";

export function LoadingState({ label = "Memuat data..." }: { label?: string }) {
  return (
    <View
      className="items-center justify-center py-16"
      accessibilityLiveRegion="polite"
    >
      <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
        <ActivityIndicator size="large" color="#D1001F" />
      </View>
      <Text className="font-body-medium text-muted text-sm">{label}</Text>
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  iconName = "file-tray-outline",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-14 px-6 bg-surface rounded-card border border-line my-3">
      <View className="w-16 h-16 rounded-full bg-background items-center justify-center mb-4 border border-line">
        <Ionicons name={iconName} size={30} color="#D1001F" />
      </View>
      <Text className="font-heading-semibold text-text text-lg text-center">
        {title}
      </Text>
      <Text className="font-body text-muted text-sm text-center mt-1.5 leading-5 max-w-[280px]">
        {description}
      </Text>
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          className="mt-5 self-center min-h-11"
        />
      )}
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View
      className="items-center justify-center py-12 px-6 bg-surface rounded-card border border-line my-3"
      accessibilityLiveRegion="polite"
    >
      <View className="w-14 h-14 rounded-full bg-danger-soft items-center justify-center mb-3">
        <Ionicons name="alert-circle-outline" size={30} color="#991B1B" />
      </View>
      <Text className="font-heading-semibold text-danger text-base text-center">
        Terjadi Kendala
      </Text>
      <Text className="font-body text-muted text-sm text-center mt-1.5 leading-5 max-w-[280px]">
        {message}
      </Text>
      <Button
        title="Coba Memuat Lagi"
        variant="outline"
        icon={<Ionicons name="refresh-outline" size={16} color="#D1001F" />}
        onPress={onRetry}
        className="mt-5 self-center min-h-11"
      />
    </View>
  );
}
