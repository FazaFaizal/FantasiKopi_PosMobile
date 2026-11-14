import { useState, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Hook untuk memantau status konektivitas internet perangkat secara real-time.
 * Sesuai PRD Section 32 (Offline Handling).
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    // 1. Ambil status awal
    NetInfo.fetch().then((state) => {
      const connected =
        state.isConnected !== null && state.isConnected !== false;
      const reachable =
        state.isInternetReachable === null || state.isInternetReachable !== false;
      setIsOnline(connected && reachable);
    });

    // 2. Berlangganan perubahan status jaringan
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected !== null && state.isConnected !== false;
      const reachable =
        state.isInternetReachable === null || state.isInternetReachable !== false;
      setIsOnline(connected && reachable);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { isOnline };
}
