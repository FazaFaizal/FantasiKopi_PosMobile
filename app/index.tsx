import { Redirect, useRootNavigationState } from 'expo-router';

export default function Index() {
  const rootNavigationState = useRootNavigationState();

  // Pastikan root navigator sudah ter-mount sepenuhnya sebelum mengeksekusi redirect
  if (!rootNavigationState?.key) {
    return null;
  }

  return <Redirect href="/(auth)/login" />;
}
