import { useWindowDimensions, Dimensions } from 'react-native';
import { useState, useCallback } from 'react';
import {
  getDeviceType,
  getOrientation,
  getGridColumns,
  getModalLayout,
  getNextOrientationMode,
  applyOrientationLock,
  DeviceType,
  OrientationType,
  OrientationMode,
  ModalLayoutConfig,
} from '../lib/orientation-logic';

export interface ResponsiveInfo {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: OrientationType;
  isTablet: boolean;
  isLandscape: boolean;
  columns: number;
  modalLayout: ModalLayoutConfig;
  orientationMode: OrientationMode;
  toggleOrientation: () => Promise<void>;
  setOrientationMode: (mode: OrientationMode) => Promise<void>;
}

const DEFAULT_DIMENSIONS = { width: 390, height: 844 };

export function useResponsive(): ResponsiveInfo {
  const windowDims =
    typeof useWindowDimensions === 'function'
      ? useWindowDimensions()
      : (typeof Dimensions !== 'undefined' && Dimensions.get ? Dimensions.get('window') : DEFAULT_DIMENSIONS);

  const width = windowDims?.width || DEFAULT_DIMENSIONS.width;
  const height = windowDims?.height || DEFAULT_DIMENSIONS.height;
  const [orientationMode, setOrientationModeState] = useState<OrientationMode>('auto');

  const deviceType: DeviceType = getDeviceType(width, height);
  const orientation: OrientationType = getOrientation(width, height);
  const isTablet = deviceType === 'tablet';
  const isLandscape = orientation === 'landscape';
  const columns = getGridColumns(width);
  const modalLayout = getModalLayout(width, deviceType);

  const toggleOrientation = useCallback(async () => {
    const nextMode = getNextOrientationMode(orientationMode);
    setOrientationModeState(nextMode);
    await applyOrientationLock(nextMode);
  }, [orientationMode]);

  const setOrientationMode = useCallback(async (mode: OrientationMode) => {
    setOrientationModeState(mode);
    await applyOrientationLock(mode);
  }, []);

  return {
    width,
    height,
    deviceType,
    orientation,
    isTablet,
    isLandscape,
    columns,
    modalLayout,
    orientationMode,
    toggleOrientation,
    setOrientationMode,
  };
}
