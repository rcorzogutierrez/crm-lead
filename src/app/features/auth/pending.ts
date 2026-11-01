import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { statusHome } from '../../core/auth.guards';
import { AuthService } from '../../core/auth.service';
import { t } from '../../core/i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch';

@Component({
  selector: 'app-pending',
  imports: [LangSwitch, RouterLink],
  template: `
    <div class="relative flex min-h-dvh items-center justify-center px-6 py-16">
      <app-lang-switch class="absolute top-4 right-4" />
      <div class="w-full max-w-md">
        @if (auth.suspended()) {
          <h1 class="page-title">{{ t('pending.suspendedTitle') }}</h1>
          <p class="mt-3 text-ink-2">{{ t('pending.suspendedBody') }}</p>
        } @else {
          <h1 class="page-title">{{ t('pending.title') }}</h1>
          <p class="mt-3 text-ink-2">
            {{ t('pending.signedAs') }} <span class="font-semibold text-ink">{{ auth.user()?.email }}</span>{{ t('pending.notInTeam') }}
            {{ t('pending.askAdmin') }} <span class="font-semibold text-ink">{{ t('nav.team') }}</span>.
          </p>
        }
        <div class="mt-8 flex flex-wrap gap-2">
          @if (!auth.suspended()) {
            <button type="button" class="btn-primary" [disabled]="checking()" (click)="recheck()">{{ checking() ? t('pending.checking') : t('pending.recheck') }}</button>
          }
          @if (auth.platformAdmin()) {
            <a routerLink="/platform" class="btn-secondary">{{ t('pending.platform') }}</a>
          }
          <button type="button" class="btn-ghost" (click)="signOut()">{{ t('pending.other') }}</button>
        </div>
      </div>
    </div>
  `,
})
export class Pending {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly checking = signal(false);
  protected readonly t = t;

  constructor() {
    effect(() => {
      const home = statusHome(this.auth.status());
      if (home && home !== '/pending') void this.router.navigateByUrl(home);
    });
  }

  protected async recheck(): Promise<void> {
    this.checking.set(true);
    await this.auth.recheck();
    this.checking.set(false);
  }

  protected signOut(): void {
    void this.auth.signOut();
  }
}
