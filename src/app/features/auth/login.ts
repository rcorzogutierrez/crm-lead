import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideCheck, LucideClock } from '@lucide/angular';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { IDLE_MINUTES, IdleService } from '../../core/idle.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { AuthBoard } from './auth-board';
import { LoginSheet } from './login-sheet';
import { LoginBrand } from './login-brand';

/**
 * Entrar ("Pizarra"), sobre el tablero de acceso (`AuthBoard`): la marca en grande (`LoginBrand`),
 * titular con la palabra final rotando (llamada → seguimiento → propuesta; cada cambio trae una cita
 * nueva al fondo) y, debajo, la hoja de entrar (`LoginSheet`: Google o email y contraseña).
 */
@Component({
  selector: 'app-login',
  imports: [LoginBrand, AuthBoard, LoginSheet, RouterLink, LucideCheck, LucideClock],
  template: `
    <app-auth-board [beat]="word()" brand>
      <app-login-brand [beat]="word()" />
      <!-- Tras un cierre por inactividad, el motivo va encima del titular -->
      @if (idle.endedByIdle()) {
        <div class="login-in login-notice mx-auto mb-6 flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-left" style="--d: 60ms" role="status">
          <svg lucideClock [size]="20" class="mt-0.5 shrink-0 text-highlight" aria-hidden="true"></svg>
          <p class="text-sm leading-snug">
            <strong class="block font-semibold text-rail-ink">{{ t('idle.notice.title') }}</strong>
            <span class="text-rail-muted">{{ t('idle.notice.body', { n: idleMinutes }) }}</span>
          </p>
        </div>
      }

      <h1 class="login-in date-face text-[clamp(2rem,4.6vw,3.375rem)] leading-[1.04] font-bold tracking-tight text-balance" style="--d: 120ms">
        {{ t('login.headline') }}
        <span class="sr-only">{{ t(words[1]) }}</span>
        <span class="login-words" aria-hidden="true">
          @for (w of words; track w; let i = $index) {
            <span [class]="i === word() ? 'is-on' : i === prev() ? 'is-off' : ''">{{ t(w) }}</span>
          }
        </span>
      </h1>

      <app-login-sheet class="login-in mx-auto mt-7 block w-full max-w-[25.5rem] sm:mt-8" style="--d: 220ms" />

      @if (!signup()) {
        <p class="login-in mt-5 text-[0.875rem] text-rail-muted" style="--d: 320ms">
          {{ t('login.firstTime') }}
          <a routerLink="/login" [queryParams]="{ mode: 'signup' }" class="login-link font-semibold text-rail-ink">{{ t('login.createPw') }}</a>
        </p>
      }

      <!-- Las garantías solo caben con altura de sobra: en un portátil bajo mandan la hoja y el enlace -->
      <ul class="mt-5 hidden flex-wrap justify-center gap-x-5 gap-y-2 text-[0.8125rem] text-rail-muted sm:[@media(min-height:760px)]:flex">
        @for (k of trust; track k; let i = $index) {
          <li class="login-in inline-flex items-center gap-1.5" [style.--d.ms]="420 + i * 90">
            <svg lucideCheck [size]="14" [strokeWidth]="2.5" class="login-check"></svg>{{ t(k) }}
          </li>
        }
      </ul>
    </app-auth-board>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  protected readonly idle = inject(IdleService);
  protected readonly idleMinutes = IDLE_MINUTES;
  private readonly router = inject(Router);
  /** Creando contraseña: el enlace "¿Primera vez?" sobra. */
  protected readonly signup = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((p) => p.get('mode') === 'signup')), {
    initialValue: false,
  });
  protected readonly t = t;

  protected readonly words: readonly I18nKey[] = ['login.word.call', 'login.word.followup', 'login.word.proposal'];
  protected readonly trust: readonly I18nKey[] = ['login.trust.invite', 'login.trust.secure', 'login.trust.mobile'];

  /** Palabra visible del titular y la que acaba de salir (para animar su salida). */
  protected readonly word = signal(0);
  protected readonly prev = signal(-1);

  constructor() {
    effect(() => {
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/today');
      if (s === 'pending') void this.router.navigateByUrl('/pending');
      if (s === 'unverified') void this.router.navigateByUrl('/verify');
    });

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = setInterval(() => {
        this.prev.set(this.word());
        this.word.update((i) => (i + 1) % this.words.length);
      }, 2600);
      inject(DestroyRef).onDestroy(() => clearInterval(id));
    }
  }
}
