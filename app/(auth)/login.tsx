import React, { useState } from "react";
import {
  View,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function handleLogin() {
    let isValid = true;
    setEmailError("");
    setPasswordError("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailError("Email wajib diisi");
      isValid = false;
    } else if (!cleanEmail.includes("@")) {
      setEmailError("Format email tidak valid");
      isValid = false;
    }

    if (!password) {
      setPasswordError("Password wajib diisi");
      isValid = false;
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        Alert.alert("Gagal Masuk", error.message);
      }
    } catch (err: any) {
      Alert.alert(
        "Kesalahan Sistem",
        err?.message || "Terjadi kesalahan saat menghubungi server.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFF7F5" }}
      edges={["top", "bottom", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              width: "100%",
              maxWidth: 440,
              alignSelf: "center",
            }}
          >
            {/* Brand Header */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-card bg-primary items-center justify-center mb-2.5 shadow-sm">
                <Ionicons name="cafe" size={28} color="#FFFFFF" />
              </View>
              <Text className="font-heading text-primary text-2xl text-center">
                Fantasi Coffee
              </Text>
              <Text className="font-body text-muted text-xs text-center mt-1">
                Sistem Point of Sale dan Operasional
              </Text>
            </View>

            {/* Card Form */}
            <View className="bg-surface rounded-card p-6 border border-line shadow-sm">
              <Text className="font-heading-semibold text-text text-xl mb-1">
                Masuk ke Akun
              </Text>
              <Text className="font-body text-muted text-xs mb-6">
                Gunakan email dan password terdaftar Anda
              </Text>

              <Input
                label="Alamat Email"
                placeholder="nama@fantasicoffee.com"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                error={emailError}
                leftIcon={
                  <Ionicons name="mail-outline" size={18} color="#6B7280" />
                }
              />

              <Input
                label="Password"
                placeholder="Masukkan password akun"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError("");
                }}
                secureToggle
                error={passwordError}
                leftIcon={
                  <Ionicons name="lock-closed-outline" size={18} color="#6B7280" />
                }
              />

              <Button
                title="Masuk Sekarang"
                variant="primary"
                className="mt-2"
                isLoading={loading}
                icon={<Ionicons name="log-in-outline" size={18} color="#FFFFFF" />}
                onPress={handleLogin}
              />
            </View>

            {/* Register Footer */}
            <View className="mt-6 flex-row justify-center items-center">
              <Text className="font-body text-muted text-sm">Pelanggan baru? </Text>
              <Link
                href="/(auth)/register"
                className="font-heading-semibold text-primary text-sm py-2"
              >
                Daftar Akun Customer
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
