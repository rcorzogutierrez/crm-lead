import { authErrorKey, passwordOk } from './auth.service';

describe('authErrorKey', () => {
  it('no revela si el email existe: credenciales malas y usuario inexistente dan el mismo texto', () => {
    expect(authErrorKey({ code: 'auth/invalid-credential' })).toBe('auth.err.credentials');
    expect(authErrorKey({ code: 'auth/user-not-found' })).toBe('auth.err.credentials');
    expect(authErrorKey({ code: 'auth/wrong-password' })).toBe('auth.err.credentials');
  });

  it('traduce los casos con salida propia', () => {
    expect(authErrorKey({ code: 'auth/too-many-requests' })).toBe('auth.err.tooMany');
    expect(authErrorKey({ code: 'auth/email-already-in-use' })).toBe('auth.err.inUse');
    expect(authErrorKey({ code: 'auth/password-does-not-meet-requirements' })).toBe(
      'auth.err.weak',
    );
    expect(authErrorKey({ code: 'auth/expired-action-code' })).toBe('auth.err.link');
    expect(authErrorKey({ code: 'auth/operation-not-allowed' })).toBe('auth.err.passwordOff');
  });

  it('cualquier otro error da el genérico', () => {
    expect(authErrorKey(new Error('x'))).toBe('auth.err.generic');
  });
});

describe('passwordOk', () => {
  it('pide 8 caracteres con letras y números', () => {
    expect(passwordOk('abc12345')).toBe(true);
    expect(passwordOk('Año2026x')).toBe(true);
    expect(passwordOk('abc1234')).toBe(false);
    expect(passwordOk('abcdefgh')).toBe(false);
    expect(passwordOk('12345678')).toBe(false);
  });
});
