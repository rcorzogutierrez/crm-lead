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
      return router.parseUrl('/acceso-pendiente');
    default:
      return router.parseUrl('/entrar');
  }
};

/** Pantallas públicas: si ya es miembro, lo manda a la agenda. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  return auth.status() === 'member' ? router.parseUrl('/hoy') : true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.settled();
  return auth.isAdmin() ? true : router.parseUrl('/hoy');
};
