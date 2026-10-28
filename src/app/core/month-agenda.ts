import { addDays, dayDiff, startOfDay } from './dates';
import { CHANNELS, ContactChannel, FollowUp } from './models';
import { Range, dayParam, weekStart } from './reports';

/** Un día del mes en la agenda: cuántas acciones tiene por canal y si va cargado o con vencidas. */
export interface MonthDay {
  date: Date;
  /** "AAAA-MM-DD", para abrir ese día en la agenda. */
  key: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  /** Acciones del día (pendientes y hechas) por canal, en el orden de `CHANNELS`; solo los canales con alguna. */
  counts: { channel: ContactChannel; n: number }[];
  total: number;
  done: number;
  /** Pendientes de un día que ya pasó. */
  late: number;
  /** Bastante más que un día normal del mes: conviene repartir. */
  heavy: boolean;
  /** Carga del día respecto al más cargado del mes, 0–100. */
  load: number;
}

export interface MonthAgenda {
  days: MonthDay[];
  total: number;
  done: number;
  late: number;
  /** El día del mes con más acciones (null si el mes está vacío). */
  peak: MonthDay | null;
}

/** Un día cuenta como cargado si tiene al menos esto y el doble de la media del mes. */
const HEAVY_MIN = 5;

/** Semanas completas (lunes a domingo) que cubren el mes de `month`. */
export function monthRange(month: Date): Range {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { start: weekStart(first), end: addDays(weekStart(last), 7) };
}

/**
 * Agenda del mes: cada día con sus acciones pendientes y hechas por canal. Función pura sobre
 * los follow-ups pendientes (en memoria) y los hechos del rango (consulta en vivo del mes).
 */
export function monthAgenda(
  month: Date,
  pending: readonly FollowUp[],
  done: readonly FollowUp[],
  now: Date,
): MonthAgenda {
  const range = monthRange(month);
  const today = startOfDay(now);
  const byDay = new Map<string, { pending: FollowUp[]; done: FollowUp[] }>();
  const bucket = (f: FollowUp) => {
    const key = dayParam(f.dueAt);
    let b = byDay.get(key);
    if (!b) byDay.set(key, (b = { pending: [], done: [] }));
    return b;
  };
  for (const f of pending)
    if (f.dueAt >= range.start && f.dueAt < range.end) bucket(f).pending.push(f);
  for (const f of done) if (f.dueAt >= range.start && f.dueAt < range.end) bucket(f).done.push(f);

  const days: MonthDay[] = [];
  for (let date = range.start; date < range.end; date = addDays(date, 1)) {
    const key = dayParam(date);
    const b = byDay.get(key) ?? { pending: [], done: [] };
    const all = [...b.pending, ...b.done];
    const diff = dayDiff(today, date);
    days.push({
      date,
      key,
      inMonth: date.getMonth() === month.getMonth(),
      isToday: diff === 0,
      isPast: diff < 0,
      counts: CHANNELS.map((c) => ({
        channel: c.id,
        n: all.filter((f) => f.channel === c.id).length,
      })).filter((c) => c.n > 0),
      total: all.length,
      done: b.done.length,
      late: diff < 0 ? b.pending.length : 0,
      heavy: false,
      load: 0,
    });
  }

  const inMonth = days.filter((d) => d.inMonth);
  const busy = inMonth.filter((d) => d.total > 0);
  const max = Math.max(0, ...busy.map((d) => d.total));
  const mean = busy.length ? busy.reduce((s, d) => s + d.total, 0) / busy.length : 0;
  const heavyFrom = Math.max(HEAVY_MIN, Math.ceil(mean * 2));
  for (const d of days) {
    d.load = max ? Math.round((d.total / max) * 100) : 0;
    d.heavy = d.total >= heavyFrom;
  }
  const peak = busy.reduce<MonthDay | null>((p, d) => (!p || d.total > p.total ? d : p), null);
  return {
    days,
    total: inMonth.reduce((s, d) => s + d.total, 0),
    done: inMonth.reduce((s, d) => s + d.done, 0),
    late: inMonth.reduce((s, d) => s + d.late, 0),
    peak,
  };
}
