import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT,
  RATE_WINDOW_MS,
  parseToken,
  pickAssignee,
  rateWindow,
  repeatNote,
  secretMatches,
  sha256Hex,
  validatePayload,
} from './intake-core';

const SECRET = 'a'.repeat(20) + 'B1_-'.repeat(4);

describe('parseToken', () => {
  it('lee empresa, clave y secreto', () => {
    expect(parseToken(`Bearer acme.k1.${SECRET}`)).toEqual({ tenantId: 'acme', keyId: 'k1', secret: SECRET });
  });
  it('rechaza cabeceras sin Bearer, con partes de más o secretos cortos', () => {
    expect(parseToken(undefined)).toBeNull();
    expect(parseToken(`acme.k1.${SECRET}`)).toBeNull();
    expect(parseToken(`Bearer acme.k1.x.${SECRET}`)).toBeNull();
    expect(parseToken('Bearer acme.k1.corto')).toBeNull();
    expect(parseToken(`Bearer ac/me.k1.${SECRET}`)).toBeNull();
  });
});

describe('secretMatches', () => {
  it('compara contra el hash SHA-256 guardado', () => {
    const hash = sha256Hex(SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(secretMatches(SECRET, hash)).toBe(true);
    expect(secretMatches(SECRET + 'x', hash)).toBe(false);
    expect(secretMatches(SECRET, undefined)).toBe(false);
    expect(secretMatches(SECRET, 'abc')).toBe(false);
  });
});

describe('validatePayload', () => {
  const ok = { name: '  Ana Pérez ', email: 'ANA@Ejemplo.com', message: 'Hola\nquiero info' };

  it('limpia espacios, pasa el email a minúsculas y rellena lo que falta', () => {
    const r = validatePayload({ ...ok, extra: 'se ignora' });
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({ name: 'Ana Pérez', email: 'ana@ejemplo.com', phone: '', message: 'Hola\nquiero info' }),
    });
    expect(r.ok && 'extra' in r.data).toBe(false);
  });

  it('pide nombre y al menos email o teléfono', () => {
    expect(validatePayload({ name: 'A', email: 'a@b.co' })).toEqual({ ok: false, error: 'name' });
    expect(validatePayload({ name: 'Ana' })).toEqual({ ok: false, error: 'contact' });
    expect(validatePayload({ name: 'Ana', phone: '+1 (305) 555-0101' }).ok).toBe(true);
  });

  it('rechaza formatos y tamaños inválidos', () => {
    expect(validatePayload(null)).toEqual({ ok: false, error: 'body' });
    expect(validatePayload([ok])).toEqual({ ok: false, error: 'body' });
    expect(validatePayload({ ...ok, email: 'no-es-email' })).toEqual({ ok: false, error: 'email' });
    expect(validatePayload({ ...ok, phone: '12' })).toEqual({ ok: false, error: 'phone' });
    expect(validatePayload({ ...ok, name: 3 })).toEqual({ ok: false, error: 'name' });
    expect(validatePayload({ ...ok, message: 'x'.repeat(2001) })).toEqual({ ok: false, error: 'message' });
    expect(validatePayload({ ...ok, page: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'page' });
    expect(validatePayload({ ...ok, submissionId: '../x' })).toEqual({ ok: false, error: 'submissionId' });
  });

  it('quita caracteres de control', () => {
    const r = validatePayload({ ...ok, name: 'Ana\u0000 Pérez' });
    expect(r.ok && r.data.name).toBe('Ana  Pérez');
  });
});

describe('rateWindow', () => {
  it('abre ventana nueva y cuenta dentro de ella', () => {
    expect(rateWindow(1000, null, 0)).toEqual({ allowed: true, windowStart: 1000, windowCount: 1 });
    expect(rateWindow(2000, 1000, 1)).toEqual({ allowed: true, windowStart: 1000, windowCount: 2 });
  });
  it('corta al llegar al límite y reabre pasado el minuto', () => {
    expect(rateWindow(2000, 1000, RATE_LIMIT).allowed).toBe(false);
    expect(rateWindow(1000 + RATE_WINDOW_MS, 1000, RATE_LIMIT)).toEqual({
      allowed: true,
      windowStart: 1000 + RATE_WINDOW_MS,
      windowCount: 1,
    });
  });
});

describe('pickAssignee', () => {
  const active = (uid: string) => uid !== 'ines';
  it('prefiere al dueño del contacto, luego al de la clave, luego a un admin', () => {
    expect(pickAssignee('luis', 'pedro', ['ana'], active)).toBe('luis');
    expect(pickAssignee('ines', 'pedro', ['ana'], active)).toBe('pedro');
    expect(pickAssignee(null, null, ['zoe', 'ana'], active)).toBe('ana');
    expect(pickAssignee(null, 'ines', [], active)).toBeNull();
  });
});

describe('repeatNote', () => {
  it('resume interés y mensaje', () => {
    const p = validatePayload({ name: 'Ana', phone: '3055550101', interest: 'Auto', message: 'Llamar tarde' });
    expect(p.ok && repeatNote('Web', p.data)).toBe('Nuevo formulario web (Web): Auto — Llamar tarde');
  });
});
