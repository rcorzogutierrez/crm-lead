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
