import React, { useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Error states
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const router = useRouter();

  async function handleRegister() {
    let isValid = true;
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setNameError('Nama lengkap wajib diisi');
      isValid = false;
    }

    if (!cleanEmail) {
      setEmailError('Email wajib diisi');
      isValid = false;
    } else if (!cleanEmail.includes('@')) {
      setEmailError('Format email tidak valid');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password wajib diisi');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password minimal 6 karakter');
      isValid = false;
    }

    if (password !== confirmPassword) {
      setConfirmError('Konfirmasi password tidak cocok');
      isValid = false;
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name: cleanName,
          },
        },
      });

      if (error) {
        Alert.alert('Registrasi Gagal', error.message);
      } else {
        Alert.alert(
          'Registrasi Berhasil',
          'Akun Customer Anda telah siap digunakan.',
          [
            {
              text: 'Masuk Sekarang',
              onPress: () => {
                if (!data.session) {
                  router.replace('/(auth)/login');
                }
              },
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Kesalahan Sistem', err?.message || 'Terjadi kesalahan saat registrasi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#FFF7F5' }}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              justifyContent: 'center',
              width: '100%',
              maxWidth: 440,
              alignSelf: 'center',
            }}
          >
            {/* Brand Header */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-card bg-primary items-center justify-center mb-2 shadow-sm">
                <Ionicons name="cafe" size={26} color="#FFFFFF" />
              </View>
              <Text className="font-heading text-primary text-2xl text-center">Daftar Akun Baru</Text>
              <Text className="font-body text-muted text-xs text-center mt-1">
                Bergabung dengan Fantasi Coffee sebagai Customer
              </Text>
            </View>

            {/* Form Card */}
            <View className="bg-surface rounded-card p-6 border border-line shadow-sm">
              <Input
                label="Nama Lengkap"
                placeholder="Contoh: Rian Pratama"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (nameError) setNameError('');
                }}
                error={nameError}
                leftIcon={<Ionicons name="person-outline" size={18} color="#6B7280" />}
              />

              <Input
                label="Alamat Email"
                placeholder="nama@email.com"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                error={emailError}
                leftIcon={<Ionicons name="mail-outline" size={18} color="#6B7280" />}
              />

              <Input
                label="Password"
                placeholder="Minimal 6 karakter"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                secureToggle
                error={passwordError}
                leftIcon={<Ionicons name="lock-closed-outline" size={18} color="#6B7280" />}
              />

              <Input
                label="Konfirmasi Password"
                placeholder="Ulangi password di atas"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (confirmError) setConfirmError('');
                }}
                secureToggle
                error={confirmError}
                leftIcon={<Ionicons name="shield-checkmark-outline" size={18} color="#6B7280" />}
              />

              <View className="bg-background rounded-chip p-3 mb-4 border border-line">
                <Text className="font-body text-muted text-xs leading-4">
                  Akun pendaftaran mandiri otomatis berstatus Customer. Hak akses Kasir dan Admin ditetapkan oleh Admin Fantasi Coffee.
                </Text>
              </View>

              <Button
                title="Daftarkan Akun"
                variant="primary"
                isLoading={loading}
                icon={<Ionicons name="person-add-outline" size={18} color="#FFFFFF" />}
                onPress={handleRegister}
              />
            </View>

            {/* Footer */}
            <View className="mt-6 flex-row justify-center items-center">
              <Text className="font-body text-muted text-sm">Sudah memiliki akun? </Text>
              <Link href="/(auth)/login" className="font-heading-semibold text-primary text-sm py-2">
                Masuk ke Akun
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

