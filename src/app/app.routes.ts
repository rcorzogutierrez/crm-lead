import { Routes } from '@angular/router';
import { guestGuard, memberGuard } from './core/auth.guards';
import { LEGACY_ROUTES, legacyParamsGuard } from './core/legacy-urls';

/** `title` es una clave de traducción; `I18nTitleStrategy` la traduce y añade el nombre de la app. */
export const routes: Routes = [
  ...LEGACY_ROUTES,
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'login.title',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'pending',
    title: 'pending.tab',
    loadComponent: () => import('./features/auth/pending').then((m) => m.Pending),
  },
  {
    path: '',
    canActivate: [memberGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'today' },
      {
        path: 'today',
        title: 'nav.today',
        loadComponent: () => import('./features/today/today').then((m) => m.Today),
      },
      {
        path: 'contacts',
        canActivate: [legacyParamsGuard],
        title: 'nav.contacts',
        loadComponent: () => import('./features/contacts/contacts-list').then((m) => m.ContactsList),
      },
      {
        path: 'contacts/:id',
        title: 'contacts.customer',
        loadComponent: () => import('./features/contacts/contact-detail').then((m) => m.ContactDetail),
      },
      {
        path: 'leads',
        canActivate: [legacyParamsGuard],
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
        path: 'reports',
        title: 'nav.reports',
        loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'services',
        title: 'nav.services',
        loadComponent: () => import('./features/services/services-page').then((m) => m.ServicesPage),
      },
      {
        path: 'team',
        title: 'nav.team',
        loadComponent: () => import('./features/team/team').then((m) => m.Team),
      },
      {
        path: 'company',
        title: 'nav.company',
        loadComponent: () => import('./features/company/company-page').then((m) => m.CompanyPage),
      },
      {
        path: 'invoices/:id',
        title: 'invoice.title',
        loadComponent: () => import('./features/invoices/invoice-page').then((m) => m.InvoicePage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
