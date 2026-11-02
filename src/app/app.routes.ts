import { Routes } from '@angular/router';
import { adminGuard, chooseGuard, guestGuard, memberGuard, platformGuard } from './core/auth.guards';
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
    path: 'verify',
    title: 'verify.tab',
    loadComponent: () => import('./features/auth/verify').then((m) => m.Verify),
  },
  {
    // Enlaces de los correos de acceso (confirmar email, contraseña nueva)
    path: 'auth/action',
    title: 'action.tab',
    loadComponent: () => import('./features/auth/auth-action').then((m) => m.AuthAction),
  },
  {
    path: 'pending',
    title: 'pending.tab',
    loadComponent: () => import('./features/auth/pending').then((m) => m.Pending),
  },
  {
    // Elegir empresa: quien está en varias, al entrar por primera vez en este navegador o para cambiar.
    path: 'select-company',
    canActivate: [chooseGuard],
    title: 'choose.tab',
    loadComponent: () => import('./features/auth/select-company').then((m) => m.SelectCompany),
  },
  {
    // Super-admin: empresas de la plataforma (fuera del riel: no es de ninguna empresa).
    path: 'platform',
    canActivate: [platformGuard],
    title: 'platform.title',
    loadComponent: () => import('./features/platform/platform-page').then((m) => m.PlatformPage),
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
        path: 'sites',
        title: 'nav.sites',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/sites/sites-page').then((m) => m.SitesPage),
      },
      {
        path: 'sites/guide',
        title: 'sites.guideLink',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/sites/sites-guide').then((m) => m.SitesGuide),
      },
      {
        path: 'deletions',
        title: 'nav.deletions',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/deletions/deletions-page').then((m) => m.DeletionsPage),
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
