import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { evaluateNavigationGuard } from '../lib/navigation-logic';
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
    const decision = evaluateNavigationGuard({
      isReady,
      session,
      user,
      segments: segments as string[],
    });

    if (decision.action === 'redirect' && decision.targetHref) {
      router.replace(decision.targetHref as never);
    }
  }, [session, user, isReady, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF7F5' }}>
      <Slot />
      {!isReady && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#FFF7F5',
            zIndex: 9999,
          }}
        >
          <ActivityIndicator size="large" color="#D1001F" />
        </View>
      )}
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
