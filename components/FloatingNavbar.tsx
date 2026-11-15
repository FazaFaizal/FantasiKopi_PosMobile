import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Ikon cadangan bila layar tidak menyediakan tabBarIcon sendiri. */
const ROUTE_ICONS: Record<string, IoniconName> = {
  dashboard: "grid-outline",
  product: "cafe-outline",
  inventory: "cube-outline",
};

export interface FloatingTabBarProps {
  state: any;
  descriptors: any;
  navigation?: any;
  emitter?: any;
  navigateToTab?: (routeKey: string) => void;
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
}

/**
 * Tab bar mengambang untuk `<Tabs tabBar={...} />` di area Admin.
 * Setiap item menampilkan ikon + label teks agar tujuan terbaca tanpa menebak ikon.
 */
export function FloatingTabBar({ state, descriptors, navigation, emitter, navigateToTab, insets }: FloatingTabBarProps) {
  const currentRoute = state.routes[state.index];
  const currentOptions = (descriptors[currentRoute?.key]?.options || {}) as {
    tabBarStyle?: { display?: string };
  };

  // Layar yang mengatur tabBarStyle display none tidak menampilkan tab bar sama sekali.
  if (currentOptions.tabBarStyle?.display === "none") {
    return null;
  }

  const bottomOffset = Platform.OS === "ios" ? Math.max(insets?.bottom ?? 0, 16) : 16;

  const visibleRoutes = state.routes.filter((route: any) => {
    const options = (descriptors[route.key]?.options || {}) as {
      href?: string | null;
      tabBarItemStyle?: { display?: string };
    };
    if (options.href === null) return false;
    if (options.tabBarItemStyle?.display === "none") return false;
    return true;
  });

  return (
    <View
      style={{ position: "absolute", bottom: bottomOffset, left: 0, right: 0, alignItems: "center", zIndex: 50 }}
      pointerEvents="box-none"
    >
      <View
        className="bg-surface border border-line flex-row items-center p-1.5"
        style={{
          borderRadius: 20,
          width: "92%",
          maxWidth: 420,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: 8,
        }}
      >
        {visibleRoutes.map((route: any) => {
          const isFocused = currentRoute.key === route.key;
          const options = (descriptors[route.key]?.options || {}) as {
            tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
            title?: string;
          };
          const label = options.title || route.name;
          const color = isFocused ? "#FFFFFF" : "#4B5563";

          const onPress = () => {
            const emit = emitter?.emit ?? navigation?.emit;
            const event = emit ? emit({ type: "tabPress", target: route.key, canPreventDefault: true }) : null;
            if (!isFocused && !event?.defaultPrevented) {
              if (navigateToTab) navigateToTab(route.key);
              else navigation?.navigate?.(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: isFocused }}
              onPress={onPress}
              activeOpacity={0.7}
              className={`flex-1 min-h-12 items-center justify-center rounded-chip py-1.5 ${
                isFocused ? "bg-primary" : "bg-transparent"
              }`}
            >
              {typeof options.tabBarIcon === "function" ? (
                options.tabBarIcon({ focused: isFocused, color, size: 20 })
              ) : (
                <Ionicons name={ROUTE_ICONS[route.name] ?? "ellipse-outline"} size={20} color={color} />
              )}
              <Text
                numberOfLines={1}
                className={`text-xs mt-0.5 ${isFocused ? "font-heading-semibold text-white" : "font-body-medium text-text"}`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
