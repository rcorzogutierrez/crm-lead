import { Routes } from '@angular/router';
import { guestGuard, memberGuard } from './core/auth.guards';

/** `title` es una clave de traducción; `I18nTitleStrategy` la traduce y añade el nombre de la app. */
export const routes: Routes = [
  {
    path: 'entrar',
    canActivate: [guestGuard],
    title: 'login.title',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'acceso-pendiente',
    title: 'pending.tab',
    loadComponent: () => import('./features/auth/pending').then((m) => m.Pending),
  },
  {
    path: '',
    canActivate: [memberGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
      {
        path: 'hoy',
        title: 'nav.today',
        loadComponent: () => import('./features/today/today').then((m) => m.Today),
      },
      {
        path: 'leads',
        title: 'nav.leads',
        loadComponent: () => import('./features/leads/leads-list').then((m) => m.LeadsList),
      },
      {
        path: 'leads/:id',
        title: 'list.lead',
        loadComponent: () => import('./features/lead-detail/lead-detail').then((m) => m.LeadDetail),
      },
      {
        path: 'pipeline',
        title: 'nav.pipeline',
        loadComponent: () => import('./features/pipeline/pipeline').then((m) => m.Pipeline),
      },
      {
        path: 'equipo',
        title: 'nav.team',
        loadComponent: () => import('./features/team/team').then((m) => m.Team),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
