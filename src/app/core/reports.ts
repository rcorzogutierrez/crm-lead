import { addDays, dayDiff, startOfDay } from './dates';
import { dealLines } from './deal-lines';
import { FollowUp, ITEM_KINDS, ItemKind, Lead, LeadSource, OPEN_STAGES, PriceTier, Stage, TIERS, isClosed, salePrice, wonDate } from './models';

/**
 * Cálculos de los reportes. Funciones puras sobre los leads y follow-ups que la app ya
 * escucha en memoria (un equipo pequeño cabe completo), así se prueban sin Firestore.
 */

export type Period = 'week' | 'month' | 'quarter';

/** Intervalo [start, end): `end` es el primer instante que ya no cuenta. */
export interface Range {
  start: Date;
  end: Date;
}

/** Días sin contacto a partir de los cuales un negocio abierto se considera quieto. */
export const STALLED_DAYS = 14;

/** Lunes de la semana de `d`, a las 00:00. */
export function weekStart(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function weekRange(d: Date): Range {
  const start = weekStart(d);
  return { start, end: addDays(start, 7) };
}

/** Semana, mes o trimestre (de calendario) que contiene `now`. */
export function periodRange(period: Period, now: Date): Range {
  if (period === 'week') return weekRange(now);
  const months = period === 'month' ? 1 : 3;
  const first = period === 'month' ? now.getMonth() : now.getMonth() - (now.getMonth() % 3);
  return { start: new Date(now.getFullYear(), first, 1), end: new Date(now.getFullYear(), first + months, 1) };
}

/** El periodo del mismo tipo inmediatamente anterior. */
export function previousRange(period: Period, range: Range): Range {
  if (period === 'week') return { start: addDays(range.start, -7), end: range.start };
  const months = period === 'month' ? 1 : 3;
  const s = range.start;
  return { start: new Date(s.getFullYear(), s.getMonth() - months, 1), end: s };
}

/** Rango de días elegido a mano, ambos incluidos; da igual el orden en que lleguen. */
export function customRange(a: Date, b: Date): Range {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return { start: startOfDay(from), end: addDays(startOfDay(to), 1) };
}

/** Los mismos días justo antes de `range` (para comparar un rango personalizado). */
export function precedingRange(range: Range): Range {
  return { start: addDays(range.start, -rangeDays(range)), end: range.start };
}

/** Días de calendario que abarca el rango. */
export function rangeDays(range: Range): number {
  return dayDiff(range.start, range.end);
}

/** "AAAA-MM-DD" (fecha local) de la URL; null si no es una fecha válida. */
export function parseDay(value: string | null | undefined): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Fecha local como "AAAA-MM-DD" (URL e `<input type="date">`). */
export function dayParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "AAAA-MM" de la URL: el día 1 de ese mes, o null si no es un mes válido. */
export function parseMonth(value: string | null | undefined): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/** Mes local como "AAAA-MM". */
export function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function inRange(d: Date | null, r: Range): boolean {
  return !!d && d >= r.start && d < r.end;
}

/** Cuándo se perdió: `lostAt`; los leads anteriores a ese campo usan su última edición. */
export function lostDate(l: Lead): Date | null {
  return l.stage === 'lost' ? (l.lostAt ?? l.updatedAt) : null;
}

/** Último contacto del lead, o su alta si nunca se le contactó. */
export function lastTouch(l: Lead): Date | null {
  return l.lastContactAt ?? l.createdAt;
}

export interface SourceCount {
  source: LeadSource;
  count: number;
  /** De los que entraron por ese origen, cuántos están ganados hoy. */
  won: number;
}

export interface DayCount {
  day: Date;
  count: number;
}

export interface StalledLead {
  lead: Lead;
  days: number;
}

/** Informe de la semana (vista del admin): lo que pasó en `range` y lo que está pendiente ahora. */
export interface WeekReport {
  created: Lead[];
  bySource: SourceCount[];
  won: Lead[];
  wonTotal: number;
  lost: Lead[];
  /** Pendiente ahora (no depende de la semana elegida). */
  overdue: FollowUp[];
  orphans: Lead[];
  stalled: StalledLead[];
  upcoming: DayCount[];
}

export function weekReport(leads: Lead[], pending: FollowUp[], range: Range, now: Date): WeekReport {
  const created = leads.filter((l) => inRange(l.createdAt, range));
  const counts = new Map<LeadSource, SourceCount>();
  for (const l of created) {
    const c = counts.get(l.source) ?? { source: l.source, count: 0, won: 0 };
    c.count++;
    if (l.stage === 'won') c.won++;
    counts.set(l.source, c);
  }
  const bySource = [...counts.values()].sort((a, b) => b.count - a.count);

  const won = wonIn(leads, range).sort((a, b) => wonDate(a)!.getTime() - wonDate(b)!.getTime());
  const lost = leads
    .filter((l) => inRange(lostDate(l), range))
    .sort((a, b) => lostDate(a)!.getTime() - lostDate(b)!.getTime());

  const open = leads.filter((l) => !isClosed(l.stage));
  const stalled = open
    .map((lead) => ({ lead, days: lastTouch(lead) ? dayDiff(lastTouch(lead)!, now) : 0 }))
    .filter((s) => s.days > STALLED_DAYS)
    .sort((a, b) => b.days - a.days);

  const tomorrow = addDays(startOfDay(now), 1);
  const upcoming = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(tomorrow, i);
    return { day, count: pending.filter((f) => dayDiff(day, f.dueAt) === 0).length };
  });

  return {
    created,
    bySource,
    won,
    wonTotal: sum(won),
    lost,
    overdue: pending.filter((f) => dayDiff(now, f.dueAt) < 0),
    orphans: open.filter((l) => !l.nextFollowUpAt),
    stalled,
    upcoming,
  };
}

export interface StageTotal {
  stage: Stage;
  count: number;
  value: number;
}

export interface TierCount {
  tier: PriceTier;
  count: number;
}

/** Números de un vendedor en un periodo (sobre sus propios leads). */
export interface MyNumbers {
  wonCount: number;
  wonTotal: number;
  prevTotal: number;
  /** Variación porcentual frente al periodo anterior; null si antes no hubo ventas. */
  change: number | null;
  open: StageTotal[];
  openCount: number;
  openValue: number;
  tiers: TierCount[];
  orphans: number;
}

export function myNumbers(leads: Lead[], range: Range, prev: Range): MyNumbers {
  const won = wonIn(leads, range);
  const prevTotal = sum(wonIn(leads, prev));
  const wonTotal = sum(won);
  const openLeads = leads.filter((l) => !isClosed(l.stage));
  const open = OPEN_STAGES.map((s) => {
    const inStage = openLeads.filter((l) => l.stage === s.id);
    return { stage: s.id, count: inStage.length, value: sum(inStage) };
  });
  // Solo las ventas con servicio del catálogo tienen categoría.
  const tiers = TIERS.map((x) => ({ tier: x.id, count: won.filter((l) => l.serviceId && l.tier === x.id).length }));
  return {
    wonCount: won.length,
    wonTotal,
    prevTotal,
    change: prevTotal > 0 ? Math.round(((wonTotal - prevTotal) / prevTotal) * 100) : null,
    open,
    openCount: openLeads.length,
    openValue: sum(openLeads),
    tiers,
    orphans: openLeads.filter((l) => !l.nextFollowUpAt).length,
  };
}

/** Follow-ups hechos: a tiempo si se completaron el día que tocaban o antes. */
export function followUpScore(done: Pick<FollowUp, 'dueAt' | 'completedAt'>[]): { onTime: number; late: number } {
  let onTime = 0;
  for (const f of done) if (!f.completedAt || dayDiff(f.dueAt, f.completedAt) <= 0) onTime++;
  return { onTime, late: done.length - onTime };
}

export interface KindTotal {
  kind: ItemKind;
  total: number;
}

/**
 * Lo vendido repartido por tipo (servicios, productos, materiales), línea a línea con el % de
 * su categoría. El tipo sale del catálogo actual; lo que ya no está en él, o un negocio sin
 * concepto, cuenta como servicio. Solo los tipos con ventas, en el orden de siempre.
 */
export function salesByKind(won: Lead[], kindOf: (serviceId: string) => ItemKind | undefined): KindTotal[] {
  const totals: Record<ItemKind, number> = { service: 0, product: 0, material: 0 };
  for (const l of won) {
    const lines = dealLines(l);
    if (!lines.length) totals.service += l.value || 0;
    for (const x of lines) totals[kindOf(x.serviceId) ?? 'service'] += salePrice(x.unitPrice, x.quantity, l.tierPct);
  }
  return ITEM_KINDS.filter((k) => totals[k.id] > 0).map((k) => ({ kind: k.id, total: Math.round(totals[k.id] * 100) / 100 }));
}

/** Ventas ganadas dentro del rango. */
export function wonIn(leads: Lead[], range: Range): Lead[] {
  return leads.filter((l) => l.stage === 'won' && inRange(wonDate(l), range));
}

function sum(leads: Lead[]): number {
  return leads.reduce((acc, l) => acc + (l.value || 0), 0);
}
