import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import '../global.css';

function RootLayoutNav() {
  const { session, user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
  });

  const isReady = !isLoading && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (!isReady) return;

    const segList = segments as string[];
    const inAuthGroup = segList[0] === '(auth)';
    const isAtRoot = segList.length === 0 || segList[0] === 'index';

    if (!session || !user) {
      // Belum login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (user) {
      // Sudah login, periksa status keaktifan akun
      if (user.status === 'Nonaktif') {
        if (!inAuthGroup) router.replace('/(auth)/inactive');
        return;
      }

      // Arahkan ke rute default role jika berada di grup auth atau di root
      if (inAuthGroup || isAtRoot) {
        if (user.role === 'Admin') {
          router.replace('/(admin)/dashboard');
        } else if (user.role === 'Kasir') {
          router.replace('/(kasir)/pos');
        } else if (user.role === 'Customer') {
          router.replace('/(customer)/product');
        }
      } else {
        // Pembatasan akses antar role
        const currentGroup = segList[0];
        if (currentGroup === '(admin)' && user.role !== 'Admin') {
          router.replace('/(auth)/unauthorized');
        }
        if (currentGroup === '(kasir)' && user.role !== 'Kasir') {
          router.replace('/(auth)/unauthorized');
        }
        if (currentGroup === '(customer)' && user.role !== 'Customer') {
          router.replace('/(auth)/unauthorized');
        }
      }
    }
  }, [session, user, isReady, segments, router]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF7F5' }}>
        <ActivityIndicator size="large" color="#D1001F" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF7F5' }}>
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
