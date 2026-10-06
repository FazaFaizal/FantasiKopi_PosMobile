import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { useAuth } from "../../lib/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function UnauthorizedScreen() {
  const { signOut, user } = useAuth();
  const router = useRouter();

  const handleReturnToHome = () => {
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }
    if (user.role === "Admin") {
      router.replace("/(admin)/dashboard");
    } else if (user.role === "Kasir") {
      router.replace("/(kasir)/pos");
    } else {
      router.replace("/(customer)/product");
    }
  };

  return (
    <View className="flex-1 justify-center items-center px-6 bg-background">
      <View className="w-full max-w-sm bg-surface rounded-card p-6 border border-line shadow-sm items-center">
        {/* Shield Icon */}
        <View className="w-18 h-18 rounded-full bg-primary/10 items-center justify-center mb-4 border border-primary/20">
          <Ionicons name="shield-outline" size={40} color="#D1001F" />
        </View>

        <Text className="text-2xl font-heading text-text text-center">
          Akses Dibatasi
        </Text>
        <Text className="text-muted font-body text-sm text-center mt-2 leading-5">
          Halaman yang Anda tuju memerlukan izin khusus. Akun Anda saat ini
          tidak memiliki hak akses ke modul ini.
        </Text>

        {/* User Role Info Pill */}
        {user && (
          <View className="w-full bg-background rounded-chip p-3 my-5 border border-line items-center">
            <Text className="font-body text-xs text-muted mb-1">
              Masuk Sebagai:
            </Text>
            <Text
              className="font-heading-semibold text-sm text-text"
              numberOfLines={1}
            >
              {user.email}
            </Text>
            <View className="mt-2">
              <Badge
                label={`Role: ${user.role}`}
                tone={
                  user.role === "Admin"
                    ? "accent"
                    : user.role === "Kasir"
                      ? "warning"
                      : "neutral"
                }
                icon={<Ionicons name="key-outline" size={12} color="#D1001F" />}
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className="w-full gap-2.5">
          <Button
            title={`Buka Beranda ${user?.role || "Aplikasi"}`}
            variant="primary"
            icon={
              <Ionicons name="arrow-back-outline" size={18} color="#FFFFFF" />
            }
            onPress={handleReturnToHome}
          />
          <Button
            title="Keluar / Ganti Akun"
            variant="outline"
            icon={<Ionicons name="log-out-outline" size={18} color="#D1001F" />}
            onPress={signOut}
          />
        </View>
      </View>
    </View>
  );
}
