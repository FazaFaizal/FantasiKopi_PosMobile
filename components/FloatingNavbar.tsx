import React, { useState } from "react";
import { View, TouchableOpacity, Platform } from "react-native";
import House from "lucide-react-native/icons/house";
import Send from "lucide-react-native/icons/send";
import Plus from "lucide-react-native/icons/plus";
import Heart from "lucide-react-native/icons/heart";
import User from "lucide-react-native/icons/user";
import Coffee from "lucide-react-native/icons/coffee";
import Layers from "lucide-react-native/icons/layers";
import Package from "lucide-react-native/icons/package";
import Users from "lucide-react-native/icons/users";
import Receipt from "lucide-react-native/icons/receipt";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import type { LucideIcon } from "lucide-react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Home = House;

export type BottomTabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

export interface TabItem {
  id: string;
  label?: string;
  icon: LucideIcon;
  fillActive?: boolean;
}

export type NavbarVariant = "light" | "coffee-dark";

interface NavbarThemeConfig {
  containerClass: string;
  activeBtnClass: string;
  activeIconColor: string;
  inactiveIconColor: string;
  containerStyle: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

const THEMES: Record<NavbarVariant, NavbarThemeConfig> = {
  light: {
    containerClass: "bg-surface border border-line",
    activeBtnClass: "bg-primary",
    activeIconColor: "#FFFFFF",
    inactiveIconColor: "#6B7280",
    containerStyle: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 14,
      elevation: 8,
    },
  },
  "coffee-dark": {
    containerClass: "bg-[#1E1113] border border-[#3D2024]",
    activeBtnClass: "bg-primary",
    activeIconColor: "#FFFFFF",
    inactiveIconColor: "#A8A29E",
    containerStyle: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 10,
    },
  },
};

const DEFAULT_DEMO_TABS: TabItem[] = [
  { id: "home", label: "Home", icon: Home, fillActive: true },
  { id: "send", label: "Send", icon: Send },
  { id: "add", label: "Add", icon: Plus },
  { id: "heart", label: "Heart", icon: Heart },
  { id: "user", label: "User", icon: User },
];

interface FloatingNavbarProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabItem[];
  className?: string;
  variant?: NavbarVariant;
}

/**
 * Standalone Floating Navbar Component (Pill Design)
 * Matches Fantasi Coffee POS design system & color palette
 */
export default function FloatingNavbar({
  activeTab: controlledActiveTab,
  onTabChange,
  tabs = DEFAULT_DEMO_TABS,
  className = "",
  variant = "light",
}: FloatingNavbarProps) {
  const [internalActiveTab, setInternalActiveTab] = useState("home");
  const insets = useSafeAreaInsets();
  const theme = THEMES[variant];

  const currentTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

  const handlePress = (tabId: string) => {
    if (controlledActiveTab === undefined) {
      setInternalActiveTab(tabId);
    }
    onTabChange?.(tabId);
  };

  const bottomOffset = Platform.OS === "ios" ? Math.max(insets.bottom, 16) : 20;

  return (
    <View
      style={{
        position: "absolute",
        bottom: bottomOffset,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 50,
      }}
      className={className}
    >
      {/* Main Navbar Container */}
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 9999,
            paddingHorizontal: 8,
            paddingVertical: 6,
            maxWidth: 420,
            width: "92%",
            backgroundColor: variant === "coffee-dark" ? "#1E1113" : "#FFFFFF",
            borderWidth: 1,
            borderColor: variant === "coffee-dark" ? "#3D2024" : "#E5E7EB",
          },
          theme.containerStyle,
        ]}
        className={theme.containerClass}
      >
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const IconComponent = tab.icon;

          return (
            <TouchableOpacity
              key={tab.id}
              accessibilityRole="button"
              accessibilityLabel={tab.label || tab.id}
              accessibilityState={{ selected: isActive }}
              onPress={() => handlePress(tab.id)}
              activeOpacity={0.7}
              style={{
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                backgroundColor: isActive ? "#D1001F" : "transparent",
                paddingHorizontal: isActive ? 22 : 12,
                paddingVertical: 10,
              }}
              className={isActive ? `${theme.activeBtnClass} rounded-full` : "rounded-full"}
            >
              <IconComponent
                color={isActive ? theme.activeIconColor : theme.inactiveIconColor}
                size={tab.id === "add" ? 24 : 22}
                fill={isActive && tab.fillActive ? theme.activeIconColor : "transparent"}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Icon dictionary for Expo Router routes
const ROUTE_ICONS: Record<string, { icon: LucideIcon; fillActive?: boolean }> = {
  dashboard: { icon: LayoutDashboard, fillActive: false },
  pos: { icon: Receipt, fillActive: false },
  product: { icon: Coffee, fillActive: false },
  category: { icon: Layers, fillActive: false },
  inventory: { icon: Package, fillActive: false },
  employee: { icon: Users, fillActive: false },
  home: { icon: Home, fillActive: true },
};

export interface FloatingTabBarProps extends BottomTabBarProps {
  variant?: NavbarVariant;
}

/**
 * Custom TabBar implementation for Expo Router `<Tabs tabBar={...} />`
 * Perfectly aligned horizontal floating pill capsule matching Fantasi Coffee POS
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  insets,
  variant = "light",
}: FloatingTabBarProps) {
  const bottomOffset = Platform.OS === "ios" ? Math.max(insets?.bottom ?? 0, 16) : 20;
  const isDark = variant === "coffee-dark";

  // Filter out screens with href: null or display: none (hidden tabs)
  const visibleRoutes = state.routes.filter((route) => {
    const descriptor = descriptors[route.key];
    const options = (descriptor?.options || {}) as Record<string, unknown> & {
      href?: string | null;
      tabBarItemStyle?: { display?: string };
    };
    if (options.href === null) return false;
    if (options.tabBarItemStyle?.display === "none") return false;
    return true;
  });

  const isFewTabs = visibleRoutes.length <= 3;
  const activeIconColor = "#FFFFFF";
  const inactiveIconColor = isDark ? "#A8A29E" : "#6B7280";

  return (
    <View
      style={{
        position: "absolute",
        bottom: bottomOffset,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: isFewTabs ? "space-around" : "space-between",
          borderRadius: 9999,
          paddingHorizontal: 8,
          paddingVertical: 6,
          width: isFewTabs ? 240 : "92%",
          maxWidth: isFewTabs ? 260 : 420,
          backgroundColor: isDark ? "#1E1113" : "#FFFFFF",
          borderWidth: 1,
          borderColor: isDark ? "#3D2024" : "#E5E7EB",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: 8,
        }}
        className={isDark ? "bg-[#1E1113] border border-[#3D2024]" : "bg-surface border border-line"}
      >
        {visibleRoutes.map((route) => {
          const isFocused = state.routes[state.index].key === route.key;
          const descriptor = descriptors[route.key];
          const options = (descriptor?.options || {}) as Record<string, unknown> & {
            tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
            title?: string;
          };
          const iconMeta = ROUTE_ICONS[route.name] || { icon: Home, fillActive: false };
          const IconComponent = iconMeta.icon;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const iconColor = isFocused ? activeIconColor : inactiveIconColor;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={options.title || route.name}
              accessibilityState={{ selected: isFocused }}
              onPress={onPress}
              activeOpacity={0.7}
              style={{
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                backgroundColor: isFocused ? "#D1001F" : "transparent",
                paddingHorizontal: isFocused
                  ? isFewTabs
                    ? 28
                    : 20
                  : isFewTabs
                  ? 18
                  : 12,
                paddingVertical: 10,
              }}
              className={isFocused ? "bg-primary rounded-full" : "rounded-full"}
            >
              {typeof options.tabBarIcon === "function" ? (
                options.tabBarIcon({
                  focused: isFocused,
                  color: iconColor,
                  size: 22,
                })
              ) : (
                <IconComponent
                  color={iconColor}
                  size={22}
                  fill={isFocused && iconMeta.fillActive ? activeIconColor : "transparent"}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export interface FloatingTabIconProps {
  icon: LucideIcon;
  focused: boolean;
  color?: string;
  size?: number;
  fillActive?: boolean;
  isCompact?: boolean;
}

/**
 * Capsule Pill Tab Icon Component for Expo Router Tabs
 * Renders an active pill capsule (#D1001F) without sharp rectangular cell borders
 */
export function FloatingTabIcon({
  icon: Icon,
  focused,
  color,
  size = 22,
  fillActive = false,
  isCompact = false,
}: FloatingTabIconProps) {
  if (focused) {
    return (
      <View
        className={`items-center justify-center rounded-full bg-primary flex-row ${
          isCompact ? "px-7 py-2.5" : "px-5 py-2.5"
        }`}
        style={{
          borderRadius: 9999,
          backgroundColor: "#D1001F",
          shadowColor: "#D1001F",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Icon
          size={size}
          color="#FFFFFF"
          fill={fillActive ? "#FFFFFF" : "transparent"}
        />
      </View>
    );
  }

  return (
    <View
      className={`items-center justify-center rounded-full ${
        isCompact ? "px-4 py-2.5" : "px-3 py-2.5"
      }`}
    >
      <Icon
        size={size}
        color={color || "#6B7280"}
        fill="transparent"
      />
    </View>
  );
}

export interface FloatingTabOptionsConfig {
  variant?: NavbarVariant;
  isCompact?: boolean;
}

/**
 * Standard Expo Router Bottom Tabs screenOptions generator for Floating Navbar.
 * Uses official React Navigation tabBarStyle without external navigation context errors.
 */
export function getFloatingTabScreenOptions(config?: FloatingTabOptionsConfig) {
  const isDark = config?.variant === "coffee-dark";
  const isCompact = config?.isCompact ?? false;

  return {
    headerShown: false,
    tabBarShowLabel: false,
    tabBarActiveTintColor: "#FFFFFF",
    tabBarInactiveTintColor: isDark ? "#A8A29E" : "#6B7280",
    tabBarStyle: {
      position: "absolute" as const,
      bottom: Platform.OS === "ios" ? 28 : 20,
      left: isCompact ? 60 : 20,
      right: isCompact ? 60 : 20,
      height: 64,
      backgroundColor: isDark ? "#1E1113" : "#FFFFFF",
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: isDark ? "#3D2024" : "#E5E7EB",
      borderTopWidth: 0,
      elevation: 8,
      shadowColor: isDark ? "#000000" : "#1F2937",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 16,
      paddingHorizontal: 8,
      paddingBottom: 0,
      alignItems: "center" as const,
      justifyContent: "space-around" as const,
    },
    tabBarItemStyle: {
      height: 64,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: 0,
      margin: 0,
    },
  };
}
