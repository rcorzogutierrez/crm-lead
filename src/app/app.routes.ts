import { Routes } from '@angular/router';
import { guestGuard, memberGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: 'entrar',
    canActivate: [guestGuard],
    title: 'Entrar · CRM Lead',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'acceso-pendiente',
    title: 'Acceso pendiente · CRM Lead',
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
        title: 'Hoy · CRM Lead',
        loadComponent: () => import('./features/today/today').then((m) => m.Today),
      },
      {
        path: 'leads',
        title: 'Leads · CRM Lead',
        loadComponent: () => import('./features/leads/leads-list').then((m) => m.LeadsList),
      },
      {
        path: 'leads/:id',
        title: 'Lead · CRM Lead',
        loadComponent: () => import('./features/lead-detail/lead-detail').then((m) => m.LeadDetail),
      },
      {
        path: 'pipeline',
        title: 'Pipeline · CRM Lead',
        loadComponent: () => import('./features/pipeline/pipeline').then((m) => m.Pipeline),
      },
      {
        path: 'equipo',
        title: 'Equipo · CRM Lead',
        loadComponent: () => import('./features/team/team').then((m) => m.Team),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
