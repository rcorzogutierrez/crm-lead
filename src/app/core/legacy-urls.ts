import { inject } from '@angular/core';
import { CanActivateFn, Params, Router, Routes } from '@angular/router';

/**
 * Las URLs pasaron a inglés. Estas redirecciones mantienen vivos los marcadores y enlaces
 * guardados con las rutas antiguas en español (`/hoy`, `/clientes/:id`, `?filtro=sin-accion`…).
 * El `pathMatch` por defecto (prefijo) conserva el resto de la ruta: `/clientes/abc` → `/contacts/abc`.
 */
export const LEGACY_ROUTES: Routes = [
  { path: 'entrar', redirectTo: 'login' },
  { path: 'acceso-pendiente', redirectTo: 'pending' },
  { path: 'hoy', redirectTo: 'today' },
  { path: 'clientes', redirectTo: 'contacts' },
  { path: 'servicios', redirectTo: 'services' },
  { path: 'equipo', redirectTo: 'team' },
];

/** Parámetro antiguo → nuevo, con la traducción de sus valores fijos. */
const LEGACY_PARAMS: Record<string, { to: string; values?: Record<string, string> }> = {
  buscar: { to: 'search' },
  etapa: { to: 'stage', values: { abiertos: 'open', todos: 'all' } },
  origen: { to: 'source' },
  responsable: { to: 'assignee', values: { yo: 'me' } },
  filtro: { to: 'filter', values: { 'sin-accion': 'no-action', precio: 'price-change' } },
  tipo: { to: 'type', values: { todos: 'all', clientes: 'customers', prospectos: 'prospects', 'sin-abiertas': 'idle' } },
};

/** Si la URL trae filtros con nombres en español, redirige a la misma vista con los nombres nuevos. */
export const legacyParamsGuard: CanActivateFn = (route, state) => {
  const old = Object.keys(route.queryParams).filter((k) => k in LEGACY_PARAMS);
  if (!old.length) return true;
  const queryParams: Params = { ...route.queryParams };
  for (const key of old) {
    const { to, values } = LEGACY_PARAMS[key];
    const value = String(queryParams[key]);
    delete queryParams[key];
    queryParams[to] = values?.[value] ?? value;
  }
  const path = state.url.split(/[?#]/)[0];
  return inject(Router).createUrlTree([path], { queryParams });
};
