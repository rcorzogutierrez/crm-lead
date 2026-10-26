import { describe, expect, it } from 'vitest';
import {
  invoiceBalance,
  invoiceLabel,
  invoiceLines,
  invoiceTotals,
  payState,
  receivables,
} from './invoice-math';
import { ServiceItem } from './models';

const svc = (id: string, price: number, unit: string, taxable = true): ServiceItem => ({ id, kind: 'service', name: id, description: '', price, unit, active: true, taxable });
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

describe('cobro de la factura', () => {
  const now = new Date(2026, 9, 26, 15);
  const inv = (
    total: number,
    paid: number,
    dueAt: Date | null = null,
    status: 'issued' | 'void' = 'issued',
  ) => ({ total, paid, dueAt, status });

  it('estado según lo pagado y el vencimiento', () => {
    expect(payState(inv(100, 0), now)).toBe('issued');
    expect(payState(inv(100, 40), now)).toBe('partial');
    expect(payState(inv(100, 100), now)).toBe('paid');
    expect(payState(inv(100, 99.999), now)).toBe('paid');
    expect(payState(inv(100, 40, new Date(2026, 9, 25, 12)), now)).toBe('overdue');
    // Vence hoy: todavía no está vencida.
    expect(payState(inv(100, 0, new Date(2026, 9, 26, 12)), now)).toBe('issued');
    expect(payState(inv(100, 100, new Date(2026, 9, 1, 12)), now)).toBe('paid');
    expect(payState(inv(100, 0, null, 'void'), now)).toBe('void');
  });

  it('saldo nunca negativo, con centavos', () => {
    expect(invoiceBalance(inv(2204.2, 1000.1))).toBe(1204.1);
    expect(invoiceBalance(inv(100, 120))).toBe(0);
  });

  it('por cobrar: sin pagadas ni anuladas, vencidas primero', () => {
    const r = receivables(
      [
        inv(100, 0, new Date(2026, 10, 5)),
        inv(50, 50),
        inv(80, 30, new Date(2026, 9, 20)),
        inv(70, 0, null, 'void'),
        inv(40, 0),
      ],
      now,
    );
    expect(r.rows.map((x) => x.balance)).toEqual([50, 100, 40]);
    expect(r.total).toBe(190);
    expect(r.overdue).toBe(50);
    expect(r.overdueCount).toBe(1);
  });
});
