import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * react-native-web tidak mengimplementasikan Alert.alert (tidak melakukan apa-apa),
 * sehingga konfirmasi keluar/hapus/batal dan pesan error tidak muncul di build web.
 * Di web, alert dipetakan ke window.alert / window.confirm.
 * Dialog dengan lebih dari dua tombol hanya menawarkan tombol non-batal pertama.
 */
export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');

    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancel = buttons.find((b) => b.style === 'cancel');
    const action = buttons.find((b) => b !== cancel);
    if (window.confirm(text)) {
      action?.onPress?.();
    } else {
      cancel?.onPress?.();
    }
  };
}
