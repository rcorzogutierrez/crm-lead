import { describe, expect, it } from 'vitest';
import { setLang } from './i18n/i18n';
import { addCounts, cascadeDetail, plainSnapshot } from './deletions.service';

describe('registro de borrados', () => {
  it('quita los campos sin valor de la copia, también dentro de listas y mapas', () => {
    const at = new Date('2026-10-26T12:00:00Z');
    expect(plainSnapshot({ a: 1, b: undefined, c: { d: undefined, e: at }, f: [{ g: undefined, h: 2 }] })).toEqual({
      a: 1,
      c: { e: at },
      f: [{ h: 2 }],
    });
  });

  it('resume lo que arrastra un borrado en cascada, sin los ceros', () => {
    setLang('es');
    const counts = addCounts({ deals: 2, won: 1 }, { history: 14, followUps: 0, invoices: 1 });
    expect(cascadeDetail(counts)).toBe('2 negocios, 1 venta ganada, 14 entradas del historial y 1 factura anulada');
    expect(cascadeDetail({})).toBe('');
  });
});
