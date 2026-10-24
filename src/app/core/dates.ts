const DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Diferencia en días de calendario (b - a). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export function dueState(due: Date | null, now: Date): DueState {
  if (!due) return 'none';
  const diff = dayDiff(now, due);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'soon';
  return 'later';
}

const weekday = new Intl.DateTimeFormat('es', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const full = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

/** Etiqueta corta para una fecha de vencimiento: "Hoy", "Mañana", "Vencido 3 d", "jue 12 mar". */
export function dueLabel(due: Date | null, now: Date): string {
  if (!due) return 'Sin fecha';
  const diff = dayDiff(now, due);
  if (diff < 0) return diff === -1 ? 'Venció ayer' : `Vencido ${-diff} d`;
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff < 7) return weekday.format(due).replace('.', '');
  return dayMonth.format(due).replace('.', '');
}

/** "hace 3 d", "hace 2 h", "ahora". */
export function agoLabel(date: Date | null, now: Date): string {
  if (!date) return 'nunca';
  const ms = now.getTime() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = dayDiff(date, now);
  if (d < 30) return `hace ${d} d`;
  const m = Math.floor(d / 30);
  return m < 12 ? `hace ${m} mes${m > 1 ? 'es' : ''}` : `hace ${Math.floor(m / 12)} año${m >= 24 ? 's' : ''}`;
}

export function timeLabel(d: Date): string {
  return time.format(d);
}

export function fullLabel(d: Date | null): string {
  return d ? full.format(d) : '';
}

/** Valor para <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Atajos de reprogramación: mañana a las 9, en 3 días, próximo lunes. */
export function presetDate(preset: 'tomorrow' | 'in3' | 'nextWeek', now: Date): Date {
  let d: Date;
  if (preset === 'tomorrow') d = addDays(now, 1);
  else if (preset === 'in3') d = addDays(now, 3);
  else {
    const offset = ((8 - now.getDay()) % 7) || 7; // próximo lunes
    d = addDays(now, offset);
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

export const money = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

export function moneyLabel(value: number): string {
  return `$${money.format(value || 0)}`;
}
