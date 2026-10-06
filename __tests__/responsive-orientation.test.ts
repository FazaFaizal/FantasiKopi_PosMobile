import {
  getDeviceType,
  getOrientation,
  getGridColumns,
  getModalLayout,
  getNextOrientationMode,
  applyOrientationLock,
  OrientationMode,
} from '../lib/orientation-logic';

describe('Responsive and Orientation Logic (TDD Red-Green)', () => {
  describe('getDeviceType', () => {
    it('identifies standard smartphone screens as phone', () => {
      expect(getDeviceType(390, 844)).toBe('phone'); // iPhone 12/13/14
      expect(getDeviceType(412, 915)).toBe('phone'); // Pixel 7
      expect(getDeviceType(360, 800)).toBe('phone'); // Galaxy S20
    });

    it('identifies tablet screens in portrait and landscape as tablet', () => {
      expect(getDeviceType(768, 1024)).toBe('tablet'); // iPad portrait
      expect(getDeviceType(1024, 768)).toBe('tablet'); // iPad landscape
      expect(getDeviceType(800, 1280)).toBe('tablet'); // Android 10" portrait
      expect(getDeviceType(1280, 800)).toBe('tablet'); // Android 10" landscape
      expect(getDeviceType(1366, 1024)).toBe('tablet'); // iPad Pro 12.9"
    });
  });

  describe('getOrientation', () => {
    it('detects portrait orientation when height is greater than width', () => {
      expect(getOrientation(390, 844)).toBe('portrait');
      expect(getOrientation(768, 1024)).toBe('portrait');
    });

    it('detects landscape orientation when width is greater than height', () => {
      expect(getOrientation(844, 390)).toBe('landscape');
      expect(getOrientation(1024, 768)).toBe('landscape');
      expect(getOrientation(1280, 800)).toBe('landscape');
    });
  });

  describe('getGridColumns', () => {
    it('returns 1 column for smartphones in portrait', () => {
      expect(getGridColumns(390)).toBe(1);
      expect(getGridColumns(412)).toBe(1);
    });

    it('returns 2 columns for tablet portrait and phones in landscape', () => {
      expect(getGridColumns(768)).toBe(2); // Tablet portrait
      expect(getGridColumns(844)).toBe(2); // Large phone landscape
    });

    it('returns 3 columns for tablet in landscape (width >= 1000)', () => {
      expect(getGridColumns(1024)).toBe(3);
      expect(getGridColumns(1280)).toBe(3);
    });
  });

  describe('getModalLayout', () => {
    it('returns bottom-sheet configuration for phones', () => {
      const layout = getModalLayout(390, 'phone');
      expect(layout.isCentered).toBe(false);
      expect(layout.maxWidth).toBe('100%');
      expect(layout.containerClass).toContain('justify-end');
    });

    it('returns centered dialog configuration for tablets', () => {
      const layout = getModalLayout(1024, 'tablet');
      expect(layout.isCentered).toBe(true);
      expect(layout.maxWidth).toBe(600);
      expect(layout.containerClass).toContain('justify-center');
    });
  });

  describe('getNextOrientationMode', () => {
    it('cycles through auto -> landscape -> portrait -> auto', () => {
      const step1 = getNextOrientationMode('auto');
      expect(step1).toBe('landscape');

      const step2 = getNextOrientationMode('landscape');
      expect(step2).toBe('portrait');

      const step3 = getNextOrientationMode('portrait');
      expect(step3).toBe('auto');
    });
  });

  describe('applyOrientationLock', () => {
    it('handles auto, landscape, and portrait modes gracefully without throwing', async () => {
      await expect(applyOrientationLock('auto')).resolves.not.toThrow();
      await expect(applyOrientationLock('landscape')).resolves.not.toThrow();
      await expect(applyOrientationLock('portrait')).resolves.not.toThrow();
    });
  });
});
