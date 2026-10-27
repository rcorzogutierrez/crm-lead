import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { t } from '../../core/i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch';

@Component({
  selector: 'app-pending',
  imports: [LangSwitch],
  template: `
    <div class="relative flex min-h-dvh items-center justify-center px-6 py-16">
      <app-lang-switch class="absolute top-4 right-4" />
      <div class="w-full max-w-md">
        <h1 class="date-face text-[2rem] font-bold">{{ t('pending.title') }}</h1>
        <p class="mt-3 text-ink-2">
          {{ t('pending.signedAs') }} <span class="font-semibold text-ink">{{ auth.user()?.email }}</span>{{ t('pending.notInTeam') }}
          {{ t('pending.askAdmin') }} <span class="font-semibold text-ink">{{ t('nav.team') }}</span>.
        </p>
        <div class="mt-8 flex gap-2">
          <button type="button" class="btn-primary" [disabled]="checking()" (click)="recheck()">{{ checking() ? t('pending.checking') : t('pending.recheck') }}</button>
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
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/today');
      if (s === 'signedOut') void this.router.navigateByUrl('/login');
      if (s === 'unverified') void this.router.navigateByUrl('/verify');
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
