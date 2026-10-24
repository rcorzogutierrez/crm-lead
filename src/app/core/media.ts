import { DestroyRef, Signal, inject, signal } from '@angular/core';

/**
 * `true` mientras se cumpla la media query. Sirve cuando móvil y escritorio necesitan
 * DOM distinto (no solo ocultarlo con CSS), por ejemplo un editor con ids que no deben repetirse.
 * Llamar en contexto de inyección.
 */
export function mediaQuery(query: string): Signal<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return signal(false).asReadonly();
  const mql = window.matchMedia(query);
  const matches = signal(mql.matches);
  const onChange = (e: MediaQueryListEvent) => matches.set(e.matches);
  mql.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', onChange));
  return matches.asReadonly();
}
