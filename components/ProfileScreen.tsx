import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { validatePasswordChange, PASSWORD_MIN_LENGTH } from '../lib/auth-logic';
import { ScreenHeader } from './ScreenHeader';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { useResponsive } from '../hooks/useResponsive';

interface ProfileScreenProps {
  /** Admin/Kasir: buka sidebar. Customer: tidak ada sidebar, pakai backTo. */
  onOpenSidebar?: () => void;
  backTo?: string;
}

/**
 * Profil akun (PRD 28) untuk Admin, Kasir, dan Customer:
 * info akun, ganti password (password lama diverifikasi ulang), dan keluar.
 */
export function ProfileScreen({ onOpenSidebar, backTo }: ProfileScreenProps) {
  const { user, signOut } = useAuth();
  const { isTablet } = useResponsive();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const roleTone = user?.role === 'Admin' ? 'accent' : user?.role === 'Kasir' ? 'warning' : 'neutral';
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-';

  const handleChangePassword = async () => {
    if (!user?.email) return;
    const check = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (!check.isValid) {
      setErrors(check.errors as Record<string, string>);
      return;
    }

    setSaving(true);
    try {
      // Verifikasi password lama dulu agar ponsel yang tertinggal dalam keadaan login
      // tidak bisa dipakai orang lain untuk mengganti password.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyErr) {
        setErrors({ currentPassword: 'Password lama salah' });
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      Alert.alert('Password Diperbarui', 'Gunakan password baru saat masuk berikutnya.');
    } catch (err: any) {
      Alert.alert('Gagal Mengganti Password', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Keluar dari Akun', 'Apakah Anda yakin ingin keluar?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: signOut },
    ]);
  };

  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Profil Saya" subtitle="Akun & Keamanan" onOpenSidebar={onOpenSidebar} backTo={backTo} />

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          style={isTablet ? { maxWidth: 640, width: '100%', alignSelf: 'center' } : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info akun */}
          <View className="bg-surface border border-line rounded-card p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-3">
                <Ionicons name="person" size={22} color="#D1001F" />
              </View>
              <View className="flex-1">
                <Text className="font-heading-semibold text-text text-base" numberOfLines={1}>
                  {user?.full_name || user?.email || '-'}
                </Text>
                {user?.full_name ? (
                  <Text className="font-body text-muted text-xs" numberOfLines={1}>
                    {user.email}
                  </Text>
                ) : null}
                <View className="flex-row items-center mt-1 gap-1.5">
                  <Badge label={user?.role || '-'} tone={roleTone} />
                  <Badge label={user?.status || '-'} tone={user?.status === 'Aktif' ? 'success' : 'danger'} />
                </View>
              </View>
            </View>
            <Text className="font-body text-muted text-xs">Terdaftar sejak {joined}</Text>
          </View>

          {/* Ganti password */}
          <View className="bg-surface border border-line rounded-card p-4 mb-4">
            <Text className="font-heading-semibold text-text text-sm mb-1">Ganti Password</Text>
            <Text className="font-body text-muted text-xs mb-3">
              Minimal {PASSWORD_MIN_LENGTH} karakter dan berbeda dari password lama.
            </Text>
            <Input
              label="Password lama"
              value={currentPassword}
              onChangeText={(t) => {
                setCurrentPassword(t);
                clearError('currentPassword');
              }}
              secureToggle
              autoCapitalize="none"
              error={errors.currentPassword}
            />
            <Input
              label="Password baru"
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                clearError('newPassword');
              }}
              secureToggle
              autoCapitalize="none"
              error={errors.newPassword}
            />
            <Input
              label="Ulangi password baru"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                clearError('confirmPassword');
              }}
              secureToggle
              autoCapitalize="none"
              error={errors.confirmPassword}
            />
            <Button
              title="Simpan Password Baru"
              accessibilityLabel="Simpan password baru"
              isLoading={saving}
              onPress={handleChangePassword}
              icon={<Ionicons name="key-outline" size={16} color="#FFFFFF" />}
            />
          </View>

          {/* Keluar */}
          <Button
            title="Keluar dari Akun"
            accessibilityLabel="Keluar dari akun"
            variant="outline"
            onPress={handleLogout}
            icon={<Ionicons name="log-out-outline" size={16} color="#D1001F" />}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
