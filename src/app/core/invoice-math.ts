import { startOfDay } from './dates';
import { dealLines } from './deal-lines';
import { t } from './i18n/i18n';
import { Lead, ServiceItem, salePrice } from './models';

/**
 * Cálculos de la factura, sin Firebase (se prueban aparte). En EE. UU. el impuesto de venta
 * va aparte: el precio de cada servicio nunca lo incluye y solo se suma sobre los servicios
 * que lo llevan.
 */
export interface InvoiceLine {
  name: string;
  quantity: number;
  /** Unidad de cobro ("persona"); vacío = precio único. */
  unit: string;
  /** Precio por unidad que ve el cliente (ya con la categoría; no se muestra el desglose). */
  unitPrice: number;
  /** Importe de la línea, igual al que suma el valor del negocio. */
  amount: number;
  taxable: boolean;
}

export interface InvoiceTotals {
  subtotal: number;
  /** Base imponible: suma de las líneas con impuesto. */
  taxable: number;
  taxRate: number;
  tax: number;
  total: number;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Líneas de la factura de una venta. Cada línea lleva su precio con la categoría aplicada,
 * así la suma es exactamente el valor del negocio. Un negocio sin servicio (anterior al
 * catálogo) sale como una sola línea por su valor.
 */
export function invoiceLines(
  lead: Pick<Lead, 'serviceId' | 'serviceName' | 'quantity' | 'unitPrice' | 'priceAck' | 'extras' | 'tierPct' | 'value' | 'detail'>,
  catalog: ReadonlyMap<string, ServiceItem>,
): InvoiceLine[] {
  const lines = dealLines(lead);
  if (!lines.length) {
    return [{ name: lead.detail || t('invoice.lineFallback'), quantity: 1, unit: '', unitPrice: lead.value, amount: lead.value, taxable: true }];
  }
  return lines.map((x) => {
    const svc = catalog.get(x.serviceId);
    const amount = salePrice(x.unitPrice, x.quantity, lead.tierPct);
    return {
      name: x.serviceName,
      quantity: x.quantity,
      unit: svc?.unit ?? '',
      unitPrice: round2(amount / x.quantity),
      amount,
      taxable: svc?.taxable ?? true,
    };
  });
}

export function invoiceTotals(lines: readonly Pick<InvoiceLine, 'amount' | 'taxable'>[], taxRate: number): InvoiceTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = round2(lines.reduce((s, l) => s + (l.taxable ? l.amount : 0), 0));
  const tax = round2((taxable * taxRate) / 100);
  return { subtotal, taxable, taxRate, tax, total: round2(subtotal + tax) };
}

/** Número que se imprime: prefijo + número con al menos 4 cifras ("INV-0007"). */
export function invoiceLabel(inv: { prefix: string; number: number }): string {
  return `${inv.prefix}${String(inv.number).padStart(4, '0')}`;
}

/**
 * Estado de cobro. Solo se guardan `issued` y `void`; el resto se calcula con lo pagado y el
 * vencimiento: pagada si no queda saldo, vencida si pasó el día de vencimiento con saldo,
 * pagada en parte si hay abonos.
 */
export type PayState = 'issued' | 'partial' | 'paid' | 'overdue' | 'void';

/** Lo que falta por cobrar (nunca negativo). */
export function invoiceBalance(inv: { total: number; paid: number }): number {
  return Math.max(0, round2(inv.total - inv.paid));
}

export function payState(
  inv: { status: 'issued' | 'void'; total: number; paid: number; dueAt: Date | null },
  now: Date,
): PayState {
  if (inv.status === 'void') return 'void';
  if (invoiceBalance(inv) < 0.005) return 'paid';
  // Vence al terminar el día de vencimiento (se guarda a mediodía).
  if (inv.dueAt && startOfDay(inv.dueAt) < startOfDay(now)) return 'overdue';
  return inv.paid > 0 ? 'partial' : 'issued';
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'zelle', 'check', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

interface Receivable {
  status: 'issued' | 'void';
  total: number;
  paid: number;
  dueAt: Date | null;
}

/**
 * Por cobrar: facturas vigentes con saldo, primero las vencidas (la más antigua arriba) y
 * luego por vencimiento (sin fecha al final).
 */
export function receivables<T extends Receivable>(
  invoices: readonly T[],
  now: Date,
): {
  rows: { inv: T; balance: number; state: PayState }[];
  total: number;
  overdue: number;
  overdueCount: number;
} {
  const rows = invoices
    .filter((inv) => inv.status === 'issued' && invoiceBalance(inv) >= 0.005)
    .map((inv) => ({ inv, balance: invoiceBalance(inv), state: payState(inv, now) }))
    .sort((a, b) => {
      const o = Number(b.state === 'overdue') - Number(a.state === 'overdue');
      if (o) return o;
      return (a.inv.dueAt?.getTime() ?? Infinity) - (b.inv.dueAt?.getTime() ?? Infinity);
    });
  const late = rows.filter((r) => r.state === 'overdue');
  return {
    rows,
    total: round2(rows.reduce((s, r) => s + r.balance, 0)),
    overdue: round2(late.reduce((s, r) => s + r.balance, 0)),
    overdueCount: late.length,
  };
}
