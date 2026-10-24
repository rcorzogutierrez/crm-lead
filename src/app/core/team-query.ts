import { Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { DocumentData, Query } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { LiveQuery, liveQuery } from './firestore-utils';

/**
 * Consulta en vivo que solo corre mientras el usuario es miembro del equipo.
 * Debe crearse en un contexto de inyección (p. ej. el constructor de un servicio).
 */
export function teamQuery<T>(
  build: () => Query<DocumentData>,
  map: (id: string, data: DocumentData) => T,
  when: () => boolean = () => true,
): { data: Signal<T[]>; loading: Signal<boolean>; error: Signal<string | null> } {
  const auth = inject(AuthService);
  const current = signal<LiveQuery<T> | null>(null);

  effect((onCleanup) => {
    if (auth.status() !== 'member' || !when()) {
      current.set(null);
      return;
    }
    const q = untracked(() => liveQuery(build(), map));
    current.set(q);
    onCleanup(() => q.stop());
  });

  return {
    data: computed(() => current()?.data() ?? []),
    loading: computed(() => current()?.loading() ?? true),
    error: computed(() => current()?.error() ?? null),
  };
}
