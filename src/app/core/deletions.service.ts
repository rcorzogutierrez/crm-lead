import { Service, inject } from '@angular/core';
import { DocumentData, WriteBatch, collection, doc, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { I18nKey, intlLocale, t } from './i18n/i18n';
import { teamQuery } from './team-query';

export type DeletionKind = 'contact' | 'lead' | 'activity' | 'service' | 'member' | 'invoice';

/** Entrada del registro de borrados (`deletions/{id}`): qué, quién, cuándo y una copia de los datos. */
export interface Deletion {
  id: string;
  kind: DeletionKind;
  refId: string;
  label: string;
  /** Lo que arrastró el borrado ("3 negocios, 12 notas…"), en el idioma de quien borró. */
  detail: string;
  snapshot: Record<string, unknown>;
  by: string;
  byName: string;
  at: Date | null;
}

export interface DeletionInput {
  kind: DeletionKind;
  refId: string;
  label: string;
  detail?: string;
  snapshot: object;
}

/** Firestore no acepta `undefined`: se quitan los campos sin valor, también dentro de listas y mapas. */
export function plainSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainSnapshot);
  if (value && typeof value === 'object' && !(value instanceof Date) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, plainSnapshot(v)]),
    );
  }
  return value;
}

/** Lo que se lleva un borrado en cascada. */
export interface CascadeCounts {
  deals?: number;
  won?: number;
  history?: number;
  followUps?: number;
  invoices?: number;
}

export function addCounts(a: CascadeCounts, b: CascadeCounts): CascadeCounts {
  const keys = ['deals', 'won', 'history', 'followUps', 'invoices'] as const;
  return Object.fromEntries(keys.map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));
}

/** "2 negocios, 1 venta ganada y 14 entradas del historial" (vacío si no arrastra nada). */
export function cascadeDetail(c: CascadeCounts): string {
  const parts: string[] = [];
  const add = (n: number | undefined, one: I18nKey, many: I18nKey) => {
    if (n) parts.push(n === 1 ? t(one) : t(many, { n }));
  };
  add(c.deals, 'deletion.deals1', 'deletion.dealsN');
  add(c.won, 'deletion.won1', 'deletion.wonN');
  add(c.history, 'deletion.history1', 'deletion.historyN');
  add(c.followUps, 'deletion.followUps1', 'deletion.followUpsN');
  add(c.invoices, 'deletion.invoices1', 'deletion.invoicesN');
  return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(parts);
}

function mapDeletion(id: string, d: DocumentData): Deletion {
  return {
    id,
    kind: d['kind'] ?? 'lead',
    refId: d['refId'] ?? '',
    label: d['label'] ?? '',
    detail: d['detail'] ?? '',
    snapshot: (d['snapshot'] ?? {}) as Record<string, unknown>,
    by: d['by'] ?? '',
    byName: d['byName'] ?? '',
    at: toDate(d['at']),
  };
}

/**
 * Registro de borrados. Cada borrado escribe su entrada en el mismo lote, así que no hay
 * borrado sin entrada; las reglas no dejan editarla ni borrarla. Solo el admin lo lee.
 */
@Service()
export class DeletionsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly live = teamQuery(
    () => query(collection(this.db, 'deletions'), orderBy('at', 'desc'), limit(300)),
    mapDeletion,
    () => this.auth.isAdmin(),
  );

  readonly entries = this.live.data;
  readonly loading = this.live.loading;
  readonly error = this.live.error;

  /** Añade la entrada al lote que borra. */
  record(batch: WriteBatch, input: DeletionInput): void {
    const user = this.auth.user();
    batch.set(doc(collection(this.db, 'deletions')), {
      kind: input.kind,
      refId: input.refId,
      label: input.label.slice(0, 300),
      detail: (input.detail ?? '').slice(0, 1000),
      snapshot: plainSnapshot(input.snapshot),
      by: this.auth.uid(),
      byName: (user?.displayName || user?.email || '').slice(0, 200),
      at: serverTimestamp(),
    });
  }
}
