export type DeviceType = 'phone' | 'tablet';
export type OrientationType = 'portrait' | 'landscape';
export type OrientationMode = 'auto' | 'portrait' | 'landscape';

export interface ModalLayoutConfig {
  isCentered: boolean;
  maxWidth: number | string;
  containerClass: string;
}

/**
 * Determines whether the device is a phone or tablet based on screen dimensions.
 * Breakpoint: Devices whose smallest dimension is at least 600dp are tablets.
 */
export function getDeviceType(width: number, height: number): DeviceType {
  const smallestDimension = Math.min(width, height);
  return smallestDimension >= 600 ? 'tablet' : 'phone';
}

/**
 * Determines current orientation based on width and height.
 */
export function getOrientation(width: number, height: number): OrientationType {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Calculates recommended number of columns for cards or grid items.
 */
export function getGridColumns(width: number): number {
  if (width >= 1000) {
    return 3;
  }
  if (width >= 600) {
    return 2;
  }
  return 1;
}

/**
 * Computes modal presentation style:
 * Tablets receive centered, width-constrained dialogs.
 * Phones receive bottom sheets.
 */
export function getModalLayout(width: number, deviceType: DeviceType): ModalLayoutConfig {
  if (deviceType === 'tablet') {
    return {
      isCentered: true,
      maxWidth: 600,
      containerClass: 'flex-1 justify-center items-center bg-black/60 px-4',
    };
  }

  return {
    isCentered: false,
    maxWidth: '100%',
    containerClass: 'flex-1 justify-end bg-black/50',
  };
}

/**
 * Cycles through rotation modes:
 * Auto (sensor) -> Landscape -> Portrait -> Auto
 */
export function getNextOrientationMode(current: OrientationMode): OrientationMode {
  switch (current) {
    case 'auto':
      return 'landscape';
    case 'landscape':
      return 'portrait';
    case 'portrait':
      return 'auto';
  }
}

/**
 * Applies orientation lock using expo-screen-orientation with graceful fallback.
 */
export async function applyOrientationLock(mode: OrientationMode): Promise<void> {
  try {
    let ScreenOrientation: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ScreenOrientation = require('expo-screen-orientation');
    } catch {
      // Graceful fallback when running in Node.js / Jest or web environment
      return;
    }

    if (!ScreenOrientation || !ScreenOrientation.lockAsync) {
      return;
    }

    switch (mode) {
      case 'landscape':
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        break;
      case 'portrait':
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        break;
      case 'auto':
      default:
        await ScreenOrientation.unlockAsync();
        break;
    }
  } catch (error) {
    // Graceful fallback on web or unsupported devices
    console.warn('Orientation lock error:', error);
  }
}
