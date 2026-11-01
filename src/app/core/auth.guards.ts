import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Solo miembros activos del equipo. */
export const memberGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  switch (auth.status()) {
    case 'member':
      return true;
    case 'pending':
      return router.parseUrl('/pending');
    case 'unverified':
      return router.parseUrl('/verify');
    default:
      return router.parseUrl('/login');
  }
};

/** Pantallas públicas: si ya es miembro, lo manda a la agenda. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  return auth.status() === 'member' ? router.parseUrl('/today') : true;
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
  switch (auth.status()) {
    case 'member':
      return router.parseUrl('/today');
    case 'pending':
      return router.parseUrl('/pending');
    case 'unverified':
      return router.parseUrl('/verify');
    default:
      return router.parseUrl('/login');
  }
};
