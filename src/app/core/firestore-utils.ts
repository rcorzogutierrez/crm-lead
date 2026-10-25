import { Signal, signal } from '@angular/core';
import { DocumentData, Query, Timestamp, onSnapshot } from 'firebase/firestore';
import { t } from './i18n/i18n';

/** Convierte un Timestamp de Firestore (o null) a Date. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export interface LiveQuery<T> {
  data: Signal<T[]>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  stop: () => void;
}

/** Escucha una consulta en tiempo real y la expone como signals. Se cierra con `stop()`. */
export function liveQuery<T>(query: Query<DocumentData>, map: (id: string, data: DocumentData) => T): LiveQuery<T> {
  const data = signal<T[]>([]);
  const loading = signal(true);
  const error = signal<string | null>(null);
  const stop = onSnapshot(
    query,
    { includeMetadataChanges: false },
    (snap) => {
      data.set(snap.docs.map((d) => map(d.id, d.data({ serverTimestamps: 'estimate' }))));
      loading.set(false);
      error.set(null);
    },
    (err) => {
      console.error(err);
      error.set(firestoreErrorMessage(err));
      loading.set(false);
    },
  );
  return { data: data.asReadonly(), loading: loading.asReadonly(), error: error.asReadonly(), stop };
}

export function firestoreErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'permission-denied':
      return t('db.permission');
    case 'unavailable':
      return t('db.offline');
    case 'failed-precondition':
      return t('db.index');
    default:
      return t('db.generic');
  }
}
