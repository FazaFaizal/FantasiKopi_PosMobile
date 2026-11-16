// UAT Uji lintas iterasi (docs/uat-per-iterasi.md bagian 9).
// Hanya X-02 yang punya logika di lib/; skenario lainnya menguji tampilan dan perangkat.
import {
  applyOrientationLock,
  getDeviceType,
  getGridColumns,
  getModalLayout,
  getNextOrientationMode,
  getOrientation,
} from '../lib/orientation-logic';

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
}));

const ScreenOrientation = jest.requireMock('expo-screen-orientation') as {
  lockAsync: jest.Mock;
  unlockAsync: jest.Mock;
};

describe('X-02 Orientasi tablet', () => {
  beforeEach(() => {
    ScreenOrientation.lockAsync.mockClear();
    ScreenOrientation.unlockAsync.mockClear();
  });

  test('pilihan Lanskap dan Potret mengunci layar, Otomatis membuka kunci', async () => {
    await applyOrientationLock('landscape');
    expect(ScreenOrientation.lockAsync).toHaveBeenLastCalledWith('LANDSCAPE');
    await applyOrientationLock('portrait');
    expect(ScreenOrientation.lockAsync).toHaveBeenLastCalledWith('PORTRAIT_UP');
    await applyOrientationLock('auto');
    expect(ScreenOrientation.unlockAsync).toHaveBeenCalledTimes(1);
  });

  test('gagal mengunci layar tidak membuat aplikasi error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    ScreenOrientation.lockAsync.mockRejectedValueOnce(new Error('tidak didukung'));
    await expect(applyOrientationLock('landscape')).resolves.toBeUndefined();
    warn.mockRestore();
  });

  test('tombol orientasi berputar Otomatis → Lanskap → Potret → Otomatis', () => {
    expect(getNextOrientationMode('auto')).toBe('landscape');
    expect(getNextOrientationMode('landscape')).toBe('portrait');
    expect(getNextOrientationMode('portrait')).toBe('auto');
  });

  test('tablet 10 inci dikenali sebagai tablet di kedua posisi', () => {
    expect(getDeviceType(1280, 800)).toBe('tablet');
    expect(getDeviceType(800, 1280)).toBe('tablet');
    expect(getDeviceType(390, 844)).toBe('phone');
  });

  test('posisi layar dan jumlah kolom mengikuti lebar layar', () => {
    expect(getOrientation(1280, 800)).toBe('landscape');
    expect(getOrientation(800, 1280)).toBe('portrait');
    expect(getGridColumns(1280)).toBe(3);
    expect(getGridColumns(800)).toBe(2);
    expect(getGridColumns(390)).toBe(1);
  });

  test('modal tampil di tengah pada tablet dan sebagai bottom sheet pada HP', () => {
    expect(getModalLayout(1280, 'tablet')).toMatchObject({ isCentered: true, maxWidth: 600 });
    expect(getModalLayout(390, 'phone')).toMatchObject({ isCentered: false, maxWidth: '100%' });
  });
});
