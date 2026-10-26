import { describe, expect, it } from 'vitest';
import { invoiceLabel, invoiceLines, invoiceTotals } from './invoice-math';
import { ServiceItem } from './models';

const svc = (id: string, price: number, unit: string, taxable = true): ServiceItem => ({ id, name: id, description: '', price, unit, active: true, taxable });
const catalog = new Map([
  ['web', svc('web', 1000, 'unidad')],
  ['tour', svc('tour', 180, 'persona', false)],
]);
const base = { serviceName: '', quantity: 1, unitPrice: 0, priceAck: null, extras: [], tierPct: 3, value: 0, detail: '' };

describe('factura', () => {
  it('cada línea con su precio de venta; la suma es el valor del negocio', () => {
    const lines = invoiceLines(
      {
        ...base,
        serviceId: 'web',
        serviceName: 'Web',
        quantity: 2,
        unitPrice: 1000,
        extras: [{ serviceId: 'tour', serviceName: 'Tour', quantity: 1, unitPrice: 180, ack: null }],
        value: 2245.4,
      },
      catalog,
    );
    expect(lines.map((l) => [l.unitPrice, l.amount, l.taxable])).toEqual([
      [1030, 2060, true],
      [185.4, 185.4, false],
    ]);
    const totals = invoiceTotals(lines, 7);
    expect(totals).toEqual({ subtotal: 2245.4, taxable: 2060, taxRate: 7, tax: 144.2, total: 2389.6 });
  });

  it('el impuesto se redondea a centavos', () => {
    expect(invoiceTotals([{ amount: 99.99, taxable: true }], 6.5)).toMatchObject({ tax: 6.5, total: 106.49 });
  });

  it('un negocio sin servicio sale como una línea por su valor', () => {
    const lines = invoiceLines({ ...base, serviceId: null, value: 500, detail: 'Asesoría' }, catalog);
    expect(lines).toEqual([{ name: 'Asesoría', quantity: 1, unit: '', unitPrice: 500, amount: 500, taxable: true }]);
  });

  it('número con prefijo y cuatro cifras', () => {
    expect(invoiceLabel({ prefix: 'INV-', number: 7 })).toBe('INV-0007');
    expect(invoiceLabel({ prefix: '', number: 12345 })).toBe('12345');
  });
});
