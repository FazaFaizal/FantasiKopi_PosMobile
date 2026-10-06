import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  rightAction?: React.ReactNode;
  onOpenSidebar?: () => void;
}

export function ScreenHeader({
  title,
  subtitle,
  backTo,
  rightAction,
  onOpenSidebar,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="bg-primary-dark px-4 pb-3.5 shadow-sm"
      style={{ paddingTop: Math.max(insets.top + 8, 18) }}
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
