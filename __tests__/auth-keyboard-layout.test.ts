import { Platform } from 'react-native';

export function getAuthKeyboardBehavior(os: typeof Platform.OS): 'padding' | 'height' | undefined {
  return os === 'ios' ? 'padding' : undefined;
}

export function validateLoginInput(email: string, pass: string): { isValid: boolean; emailError?: string; passwordError?: string } {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    return { isValid: false, emailError: 'Email wajib diisi' };
  }
  if (!cleanEmail.includes('@')) {
    return { isValid: false, emailError: 'Format email tidak valid' };
  }
  if (!pass) {
    return { isValid: false, passwordError: 'Password wajib diisi' };
  }
  return { isValid: true };
}

describe('Auth Keyboard & Layout Behavior (TDD)', () => {
  it('returns undefined for Android keyboard behavior to prevent double-resize glitch', () => {
    const androidBehavior = getAuthKeyboardBehavior('android');
    expect(androidBehavior).toBeUndefined();
  });

  it('returns padding for iOS keyboard behavior', () => {
    const iosBehavior = getAuthKeyboardBehavior('ios');
    expect(iosBehavior).toBe('padding');
  });

  it('validates email and password inputs correctly', () => {
    expect(validateLoginInput('', '123456')).toEqual({
      isValid: false,
      emailError: 'Email wajib diisi',
    });

    expect(validateLoginInput('not-an-email', '123456')).toEqual({
      isValid: false,
      emailError: 'Format email tidak valid',
    });

    expect(validateLoginInput('user@fantasicoffee.com', '')).toEqual({
      isValid: false,
      passwordError: 'Password wajib diisi',
    });

    expect(validateLoginInput('user@fantasicoffee.com', 'secret123')).toEqual({
      isValid: true,
    });
  });
});
