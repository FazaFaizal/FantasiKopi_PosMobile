import React from "react";
import { Tabs } from "expo-router";
import Receipt from "lucide-react-native/icons/receipt";
import Package from "lucide-react-native/icons/package";
import { FloatingTabBar } from "../../components/FloatingNavbar";

export default function KasirLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: "Terminal POS",
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Bahan Baku",
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
