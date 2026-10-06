import React from 'react';
import { View, Text } from 'react-native';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../lib/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function InactiveScreen() {
  const { signOut, user } = useAuth();

  return (
    <View className="flex-1 justify-center items-center px-6 bg-background">
      <View className="w-full max-w-sm bg-surface rounded-card p-6 border border-line shadow-sm items-center">
        {/* Warning Icon */}
        <View className="w-18 h-18 rounded-full bg-amber-500/10 items-center justify-center mb-4 border border-amber-500/20">
          <Ionicons name="pause-circle-outline" size={42} color="#B45309" />
        </View>

        <Text className="text-2xl font-heading text-text text-center">Akun Dinonaktifkan</Text>
        <Text className="text-muted font-body text-sm text-center mt-2 leading-5">
          Akun Anda telah dinonaktifkan oleh Administrator Fantasi Coffee. Akses operasional sistem ditangguhkan sementara.
        </Text>

        {user && (
          <View className="w-full bg-background rounded-chip p-3.5 my-5 border border-line items-center">
            <Text className="font-body text-xs text-muted mb-1">Identitas Akun:</Text>
            <Text className="font-heading-semibold text-sm text-text" numberOfLines={1}>
              {user.email}
            </Text>
            <View className="mt-2">
              <Badge
                label="Status: Nonaktif"
                tone="danger"
                icon={<Ionicons name="alert-circle" size={12} color="#991B1B" />}
              />
            </View>
          </View>
        )}

        <View className="w-full bg-amber-500/10 rounded-chip p-3 mb-5 border border-amber-500/20">
          <Text className="font-body text-amber-900 text-xs text-center leading-4">
            Silakan hubungi Manajer atau Pengurus Fantasi Coffee apabila Anda merasa penonaktifan ini tidak disengaja.
          </Text>
        </View>

        <View className="w-full">
          <Button
            title="Keluar dari Akun"
            variant="primary"
            icon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
            onPress={signOut}
          />
        </View>
      </View>
    </View>
  );
}

