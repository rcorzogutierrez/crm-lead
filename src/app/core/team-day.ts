import { dayDiff } from './dates';
import { FollowUp, Lead, Member, isClosed, wonDate } from './models';

/** Cómo va el día de un vendedor (vista del admin en Hoy, "Todo el equipo"). */
export interface TeamDayRow {
  uid: string;
  name: string;
  photo: string | null;
  /** Follow-ups de hoy ya hechos. */
  done: number;
  /** Lo de hoy: hechos más pendientes. */
  planned: number;
  /** Pendientes de días anteriores. */
  overdue: number;
  /** Negocios abiertos sin próxima acción. */
  orphans: number;
  wonCount: number;
  wonTotal: number;
}

/**
 * Una fila por miembro activo (y por cualquier responsable con algo hoy aunque ya no esté activo),
 * ordenadas por nombre. Función pura sobre lo que la app ya escucha.
 */
export function teamDay(
  members: readonly Member[],
  pending: readonly FollowUp[],
  doneToday: readonly FollowUp[],
  leads: readonly Lead[],
  now: Date,
): TeamDayRow[] {
  const rows = new Map<string, TeamDayRow>();
  const row = (uid: string) => {
    let r = rows.get(uid);
    if (!r) {
      const m = members.find((x) => x.uid === uid);
      r = { uid, name: m?.displayName || m?.email || '—', photo: m?.photoURL ?? null, done: 0, planned: 0, overdue: 0, orphans: 0, wonCount: 0, wonTotal: 0 };
      rows.set(uid, r);
    }
    return r;
  };
  for (const m of members) if (m.active) row(m.uid);
  for (const f of pending) {
    const diff = dayDiff(now, f.dueAt);
    if (diff === 0) row(f.assigneeId).planned++;
    else if (diff < 0) row(f.assigneeId).overdue++;
  }
  for (const f of doneToday) {
    if (dayDiff(now, f.dueAt) !== 0) continue;
    const r = row(f.assigneeId);
    r.done++;
    r.planned++;
  }
  for (const l of leads) {
    if (!isClosed(l.stage) && !l.nextFollowUpAt) row(l.assigneeId).orphans++;
    if (l.stage === 'won' && dayDiff(now, wonDate(l) ?? new Date(0)) === 0) {
      const r = row(l.assigneeId);
      r.wonCount++;
      r.wonTotal += l.value;
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
