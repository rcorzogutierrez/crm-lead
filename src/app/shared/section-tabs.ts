import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18nKey, t } from '../core/i18n/i18n';

export interface SectionTab {
  path: string;
  label: I18nKey;
  /** Solo la ve un admin. */
  admin?: boolean;
}

/** Vistas de una misma sección del menú (Negocios: lista / tablero; Ajustes: servicios / equipo / empresa / registro). */
@Component({
  selector: 'app-section-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="segmented" [attr.aria-label]="t(label())">
      @for (tab of visible(); track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive=""
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="segment"
          >{{ t(tab.label) }}</a
        >
      }
    </nav>
  `,
})
export class SectionTabs {
  readonly tabs = input.required<readonly SectionTab[]>();
  /** Nombre accesible del grupo de vistas. */
  readonly label = input.required<I18nKey>();
  protected readonly t = t;
  private readonly auth = inject(AuthService);
  protected readonly visible = computed(() => this.tabs().filter((tab) => !tab.admin || this.auth.isAdmin()));
}

export const DEAL_TABS: readonly SectionTab[] = [
  { path: '/leads', label: 'deals.list' },
  { path: '/pipeline', label: 'deals.board' },
];

export const SETTINGS_TABS: readonly SectionTab[] = [
  { path: '/services', label: 'nav.services' },
  { path: '/team', label: 'nav.team' },
  { path: '/company', label: 'nav.company' },
  { path: '/deletions', label: 'nav.deletions', admin: true },
];
