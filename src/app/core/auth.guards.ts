import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, AuthStatus } from './auth.service';

/** Pantalla que corresponde a cada estado de la sesión (`null` mientras carga). */
export function statusHome(status: AuthStatus): string | null {
  switch (status) {
    case 'member':
      return '/today';
    case 'choose':
      return '/select-company';
    case 'pending':
      return '/pending';
    case 'unverified':
      return '/verify';
    case 'signedOut':
      return '/login';
    default:
      return null;
  }
}

/** Solo miembros activos del equipo. */
export const memberGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  return auth.status() === 'member' ? true : router.parseUrl(statusHome(auth.status()) ?? '/login');
};

/** Pantallas públicas: si ya es miembro, lo manda a la agenda. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  const s = auth.status();
  return s === 'member' || s === 'choose' ? router.parseUrl(statusHome(s)!) : true;
};

/** Elegir empresa: solo quien está en varias y aún no eligió (o quiere cambiar). */
export const chooseGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  const s = auth.status();
  if (s === 'choose' || (s === 'member' && auth.tenants().length > 1)) return true;
  return router.parseUrl(statusHome(s) ?? '/login');
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  return auth.isAdmin() ? true : router.parseUrl('/today');
};

/** Panel de la plataforma: solo el super-admin, sea o no miembro de alguna empresa. */
export const platformGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  if (auth.platformAdmin()) return true;
  return router.parseUrl(statusHome(auth.status()) ?? '/login');
};
