import { t } from './i18n/i18n';
import { Lead, LeadPricing, PriceTier, ServiceItem, salePrice } from './models';

/**
 * Un negocio puede llevar varios servicios en la misma compra ("paquete + tour").
 * El primero vive en los campos de siempre del lead (`serviceId`, `quantity`, `unitPrice`…)
 * y los demás en `extras`; la categoría (bronce/plata/oro) es de toda la compra y `value`
 * es la suma de las líneas. Así los negocios de un solo servicio no cambian.
 */
export interface DealLine {
  serviceId: string;
  serviceName: string;
  quantity: number;
  /** Precio oficial por unidad pactado (copiado del catálogo al cotizar). */
  unitPrice: number;
  /** Precio oficial nuevo que se decidió no aplicar a esta línea (para no volver a avisar). */
  ack: number | null;
}

/** Línea en edición: solo lo que elige el vendedor. */
export interface EditLine {
  serviceId: string;
  quantity: number;
}

/** Tope de cantidad por línea (evita un error de tecleo con ceros de más). */
export const MAX_QUANTITY = 100_000;

/**
 * Cantidad válida de lo tecleado: mayor que cero, con hasta dos decimales (2,5 metros,
 * 1,5 horas); null si no sirve. Las reglas aceptan cualquier número positivo.
 */
export function parseQuantity(raw: unknown): number | null {
  const n = Math.round(Number(typeof raw === 'string' ? raw.replace(',', '.') : raw) * 100) / 100;
  return Number.isFinite(n) && n > 0 && n <= MAX_QUANTITY ? n : null;
}

/** Máximo de servicios por negocio: las reglas validan uno por uno y tienen un tope de cálculo. */
export const MAX_LINES = 4;

/** Líneas del negocio; vacío si se registró sin servicio. */
export function dealLines(l: Pick<Lead, 'serviceId' | 'serviceName' | 'quantity' | 'unitPrice' | 'priceAck' | 'extras'>): DealLine[] {
  if (!l.serviceId) return [];
  const main: DealLine = { serviceId: l.serviceId, serviceName: l.serviceName, quantity: l.quantity, unitPrice: l.unitPrice, ack: l.priceAck };
  return [main, ...l.extras];
}

/** Suma de las líneas con el % de la categoría, cada una redondeada a centavos. */
export function linesValue(lines: readonly Pick<DealLine, 'unitPrice' | 'quantity'>[], pct: number): number {
  return Math.round(lines.reduce((sum, x) => sum + salePrice(x.unitPrice, x.quantity, pct), 0) * 100) / 100;
}

/** Suma del precio oficial (sin categoría). */
export function linesOfficial(lines: readonly Pick<DealLine, 'unitPrice' | 'quantity'>[]): number {
  return Math.round(lines.reduce((sum, x) => sum + x.unitPrice * x.quantity, 0) * 100) / 100;
}

/** Campos de precio del lead a partir de sus líneas. */
export function linesPricing(lines: readonly DealLine[], tier: PriceTier, tierPct: number): LeadPricing & { priceAck: number | null } {
  const [main, ...extras] = lines;
  return {
    serviceId: main.serviceId,
    serviceName: main.serviceName,
    quantity: main.quantity,
    unitPrice: main.unitPrice,
    priceAck: main.ack,
    extras: extras.map((x) => ({ ...x })),
    tier,
    tierPct,
    value: linesValue(lines, tierPct),
  };
}

/**
 * Convierte lo elegido en líneas con precio. Un servicio que ya estaba en el negocio conserva
 * su precio pactado (y su aviso descartado) si sigue en la misma posición, como piden las
 * reglas; uno nuevo o movido toma el oficial vigente.
 */
export function pricedLines(edit: readonly EditLine[], catalog: ReadonlyMap<string, ServiceItem>, before: readonly DealLine[] = []): DealLine[] {
  const out: DealLine[] = [];
  for (const e of edit) {
    const svc = catalog.get(e.serviceId);
    if (!svc) continue;
    const quantity = svc.unit ? (parseQuantity(e.quantity) ?? 1) : 1;
    const prev = before[out.length];
    const kept = prev?.serviceId === svc.id ? prev : undefined;
    out.push({
      serviceId: svc.id,
      serviceName: svc.name,
      quantity,
      unitPrice: kept ? kept.unitPrice : svc.price,
      ack: kept ? kept.ack : null,
    });
  }
  return out;
}

/** Nombre corto del negocio: su servicio principal y cuántos más lleva. */
export function dealTitle(l: Pick<Lead, 'serviceName' | 'extras'>): string {
  if (!l.serviceName) return '';
  return l.extras.length ? t('deal.titleMore', { name: l.serviceName, n: l.extras.length }) : l.serviceName;
}

/** Todos los servicios del negocio, para listas y búsquedas. */
export function dealServices(l: Pick<Lead, 'serviceName' | 'extras'>): string {
  return [l.serviceName, ...l.extras.map((x) => x.serviceName)].filter(Boolean).join(' + ');
}

/** Líneas cuyo precio oficial cambió desde que se cotizaron y aún no se decidió qué hacer. */
export function staleLines(lines: readonly DealLine[], catalog: ReadonlyMap<string, ServiceItem>): { index: number; name: string; from: number; to: number }[] {
  const out: { index: number; name: string; from: number; to: number }[] = [];
  lines.forEach((x, index) => {
    const svc = catalog.get(x.serviceId);
    if (svc && svc.price !== x.unitPrice && svc.price !== x.ack) out.push({ index, name: x.serviceName, from: x.unitPrice, to: svc.price });
  });
  return out;
}
