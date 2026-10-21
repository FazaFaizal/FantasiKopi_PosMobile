import React from "react";
import { Text, TouchableOpacity, View, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  rightAction?: React.ReactNode;
  onOpenSidebar?: () => void;
  onClose?: () => void;
}

export function ScreenHeader({
  title,
  subtitle,
  backTo,
  rightAction,
  onOpenSidebar,
  onClose,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Pastikan ruang aman (safe area) dari status bar Android, notch, maupun punch-hole kamera
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (StatusBar.currentHeight || 28) : 24
  );

  return (
    <View
      className="bg-primary-dark px-4 pb-4 shadow-sm"
      style={{ paddingTop: topInset + 12 }}
    >
      <View className="flex-row items-center justify-between min-h-11">
        {/* Left Container: Icon Bar + Title & Subtitle (Sejajar Horisontal) */}
        <View className="flex-row items-center flex-1 mr-2">
          {backTo ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Kembali ke menu sebelumnya"
              onPress={() => router.replace(backTo as never)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-10 h-10 rounded-full bg-white/15 items-center justify-center mr-3"
            >
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : onClose ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Tutup modal"
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-10 h-10 rounded-full bg-white/15 items-center justify-center mr-3"
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : onOpenSidebar ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Buka menu navigasi"
              aria-label="Buka menu navigasi"
              onPress={onOpenSidebar}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-10 h-10 rounded-full bg-white/15 items-center justify-center mr-3"
            >
              <Ionicons name="menu-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}

          <View className="flex-1 justify-center">
            <Text
              className="font-heading text-white text-xl leading-tight"
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                className="font-body text-white/80 text-xs mt-0.5 leading-tight"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {rightAction && <View className="flex-shrink-0">{rightAction}</View>}
      </View>
    </View>
  );
}
