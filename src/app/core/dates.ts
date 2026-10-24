import { Lang, intlLocale, lang, t } from './i18n/i18n';

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

interface Formats {
  weekday: Intl.DateTimeFormat;
  dayMonth: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  full: Intl.DateTimeFormat;
  money: Intl.NumberFormat;
}
const cache = new Map<Lang, Formats>();

/** Formateadores Intl del idioma actual (se crean una vez por idioma). */
function fmt(): Formats {
  const current = lang();
  let f = cache.get(current);
  if (!f) {
    const loc = intlLocale();
    f = {
      weekday: new Intl.DateTimeFormat(loc, { weekday: 'short' }),
      dayMonth: new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }),
      time: new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      full: new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }),
      money: new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }),
    };
    cache.set(current, f);
  }
  return f;
}

/** Etiqueta corta para una fecha de vencimiento: "Hoy", "Mañana", "Vencido 3 d", "jue 12 mar" (según idioma). */
export function dueLabel(due: Date | null, now: Date): string {
  if (!due) return t('due.none');
  const diff = dayDiff(now, due);
  if (diff < 0) return diff === -1 ? t('due.yesterday') : t('due.overdueDays', { n: -diff });
  if (diff === 0) return t('due.today');
  if (diff === 1) return t('due.tomorrow');
  if (diff < 7) return fmt().weekday.format(due).replace('.', '');
  return fmt().dayMonth.format(due).replace('.', '');
}

/** "hace 3 d", "hace 2 h", "ahora". */
export function agoLabel(date: Date | null, now: Date): string {
  if (!date) return t('ago.never');
  const ms = now.getTime() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t('ago.now');
  if (min < 60) return t('ago.min', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('ago.hours', { n: h });
  const d = dayDiff(date, now);
  if (d < 30) return t('ago.days', { n: d });
  const m = Math.floor(d / 30);
  if (m < 12) return t(m > 1 ? 'ago.months' : 'ago.month', { n: m });
  const y = Math.floor(m / 12);
  return t(y > 1 ? 'ago.years' : 'ago.year', { n: y });
}

export function timeLabel(d: Date): string {
  return fmt().time.format(d);
}

export function fullLabel(d: Date | null): string {
  return d ? fmt().full.format(d) : '';
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

export function moneyLabel(value: number): string {
  return `$${fmt().money.format(value || 0)}`;
}
