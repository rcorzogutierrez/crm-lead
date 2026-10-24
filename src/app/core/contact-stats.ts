import { increment, serverTimestamp } from 'firebase/firestore';
import { Lead, isClosed } from './models';

/** Versión del resumen: solo se confía en él si el contacto la tiene (lo calculó un admin o nació con ella). */
export const STATS_VERSION = 1;

/** Lo que importa de un lead para el resumen de su contacto. */
export type DealState = Pick<Lead, 'stage' | 'value' | 'assigneeId'>;

/**
 * Cambios para `contacts/{id}` cuando un lead pasa de `before` a `after`
 * (null = no existe: alta o borrado). Se aplica con `batch.update` en el mismo lote que el lead.
 */
export function statsPatch(before: DealState | null, after: DealState | null, setFirstWon: boolean): Record<string, unknown> {
  const open = new Map<string, number>();
  let won = 0;
  let total = 0;
  if (before) {
    if (before.stage === 'won') {
      won--;
      total -= before.value;
    } else if (!isClosed(before.stage)) {
      open.set(before.assigneeId, (open.get(before.assigneeId) ?? 0) - 1);
    }
  }
  if (after) {
    if (after.stage === 'won') {
      won++;
      total += after.value;
    } else if (!isClosed(after.stage)) {
      open.set(after.assigneeId, (open.get(after.assigneeId) ?? 0) + 1);
    }
  }
  const patch: Record<string, unknown> = {};
  if (won) patch['wonCount'] = increment(won);
  if (total) patch['wonTotal'] = increment(total);
  for (const [uid, n] of open) if (n && uid) patch[`openBy.${uid}`] = increment(n);
  if (setFirstWon && after?.stage === 'won' && before?.stage !== 'won') patch['firstWonAt'] = serverTimestamp();
  return patch;
}

/** Resumen inicial de un contacto nuevo cuyo primer lead es `first`. */
export function initialStats(first: DealState): Record<string, unknown> {
  const won = first.stage === 'won';
  const open = !won && !isClosed(first.stage);
  return {
    statsV: STATS_VERSION,
    wonCount: won ? 1 : 0,
    wonTotal: won ? first.value : 0,
    firstWonAt: won ? serverTimestamp() : null,
    openBy: open ? { [first.assigneeId]: 1 } : {},
  };
}
