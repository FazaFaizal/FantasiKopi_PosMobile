import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Padding bawah untuk bottom sheet: padding dasar + area gesture home (iPhone)
 * atau navigation bar (Android), agar tombol aksi tidak tertimpa sistem.
 */
export function useSheetBottomPadding(base: number): number {
  const insets = useSafeAreaInsets();
  return base + insets.bottom;
}
