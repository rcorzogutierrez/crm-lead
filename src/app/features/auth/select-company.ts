import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideBuilding2, LucideCheck, LucideChevronRight } from '@lucide/angular';
import { statusHome } from '../../core/auth.guards';
import { AuthService, MyTenant } from '../../core/auth.service';
import { t } from '../../core/i18n/i18n';
import { TenantService } from '../../core/tenant.service';
import { UiService } from '../../core/ui.service';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

/**
 * "¿En qué empresa entras?": la primera vez que entra en este navegador alguien que está
 * en varias empresas, y al cambiar de empresa desde el riel o el menú de cuenta.
 */
@Component({
  selector: 'app-select-company',
  imports: [RouterLink, LangSwitch, Logo, LucideBuilding2, LucideCheck, LucideChevronRight],
  template: `
    <div class="relative flex min-h-dvh items-center justify-center px-6 py-16">
      <app-lang-switch class="absolute top-4 right-4" />
      <div class="w-full max-w-md">
        <app-logo [size]="36" />
        <h1 class="page-title mt-6">{{ t('choose.title') }}</h1>
        <p class="mt-2 text-ink-2">
          {{ t('choose.body') }} <span class="font-semibold text-ink">{{ auth.user()?.email }}</span>
        </p>
        <ul class="sheet mt-6 divide-y divide-rule overflow-hidden">
          @for (c of auth.tenants(); track c.id) {
            @let here = isCurrent(c);
            <li>
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-sheet-2 focus-visible:bg-sheet-2"
                [attr.aria-current]="here ? 'true' : null"
                (click)="enter(c)"
              >
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-sheet-2 text-ink-2" aria-hidden="true">
                  <svg lucideBuilding2 [size]="18" [strokeWidth]="1.75"></svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ c.name }}</span>
                  @if (here) {
                    <span class="block text-xs text-ink-2">{{ t('choose.current') }}</span>
                  }
                </span>
                @if (here) {
                  <svg lucideCheck [size]="18" class="shrink-0 text-pen" aria-hidden="true"></svg>
                } @else {
                  <svg lucideChevronRight [size]="18" class="shrink-0 text-ink-3" aria-hidden="true"></svg>
                }
              </button>
            </li>
          }
        </ul>
        <div class="mt-6 flex flex-wrap gap-2">
          @if (auth.status() === 'member') {
            <a routerLink="/today" class="btn-secondary">{{ t('common.cancel') }}</a>
          }
          @if (auth.platformAdmin()) {
            <a routerLink="/platform" class="btn-ghost">{{ t('pending.platform') }}</a>
          }
          <button type="button" class="btn-ghost" (click)="signOut()">{{ t('pending.other') }}</button>
        </div>
      </div>
    </div>
  `,
})
export class SelectCompany {
  protected readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  protected readonly t = t;

  constructor() {
    effect(() => {
      const s = this.auth.status();
      // Aquí se llega eligiendo (`choose`) o para cambiar siendo miembro; el resto, a su pantalla.
      if (s === 'member' || s === 'choose' || s === 'loading') return;
      const home = statusHome(s);
      if (home) void this.router.navigateByUrl(home);
    });
  }

  protected isCurrent(c: MyTenant): boolean {
    return this.auth.status() === 'member' && this.tenant.id() === c.id;
  }

  protected async enter(c: MyTenant): Promise<void> {
    this.ui.captureOpen.set(false);
    if (!this.isCurrent(c)) {
      this.auth.enterTenant(c.id);
      await this.auth.settled();
    }
    if (this.auth.status() === 'member') void this.router.navigateByUrl('/today');
  }

  protected signOut(): void {
    void this.auth.signOut(this.auth.status() === 'member' ? 'manual' : null);
  }
}
