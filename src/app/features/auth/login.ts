import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideCheck } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

/**
 * Entrar ("Pizarra"): fondo pizarra con renglones y un brillo índigo que sigue al cursor,
 * titular con la palabra final rotando (llamada → seguimiento → propuesta), acceso con Google
 * con un destello periódico y garantías que entran escalonadas.
 */
@Component({
  selector: 'app-login',
  imports: [Logo, LangSwitch, LucideCheck],
  template: `
    <div class="login-board relative isolate flex min-h-dvh flex-col overflow-hidden text-rail-ink" (pointermove)="follow($event)">
      <span class="login-glow" aria-hidden="true"></span>
      <span class="login-lines" aria-hidden="true"></span>

      <header class="login-in flex items-center justify-between gap-3 px-5 py-5 sm:px-8" style="--d: 0ms">
        <div class="flex items-center gap-2.5">
          <app-logo [size]="36" />
          <span class="date-face text-lg font-bold tracking-tight">CRM Lead</span>
        </div>
        <app-lang-switch tone="rail" />
      </header>

      <main class="flex flex-1 items-center justify-center px-4 pt-6 pb-16 text-center">
        <div class="w-full max-w-3xl">
          <span class="login-in login-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold" style="--d: 60ms">
            <span class="login-badge-dot size-1.5 rounded-full" aria-hidden="true"></span>
            {{ t('login.badge') }}
          </span>

          <h1 class="login-in date-face mt-6 text-[clamp(2.125rem,6vw,4rem)] leading-[1.04] font-bold tracking-tight text-balance" style="--d: 120ms">
            {{ t('login.headline') }}
            <span class="sr-only">{{ t(words[1]) }}</span>
            <span class="login-words" aria-hidden="true">
              @for (w of words; track w; let i = $index) {
                <span [class]="i === word() ? 'is-on' : i === prev() ? 'is-off' : ''">{{ t(w) }}</span>
              }
            </span>
          </h1>

          <p class="login-in mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-rail-muted sm:text-lg" style="--d: 200ms">{{ t('login.pitch') }}</p>

          <button type="button" class="login-in login-google mt-9 inline-flex h-13 items-center gap-3 rounded-full bg-sheet px-7 text-[0.9375rem] font-bold text-ink" style="--d: 280ms" [disabled]="busy()" (click)="signIn()">
            @if (busy()) {
              <span class="size-4 animate-spin rounded-full border-2 border-pen/25 border-t-pen" aria-hidden="true"></span>
            } @else {
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
            }
            {{ busy() ? t('login.opening') : t('login.google') }}
          </button>

          @if (auth.error(); as err) {
            <p class="mx-auto mt-5 max-w-md rounded-lg bg-ribbon-soft px-3 py-2 text-sm font-medium text-ribbon" role="alert">{{ t(err) }}</p>
          }

          <ul class="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[0.8125rem] text-rail-muted">
            @for (k of trust; track k; let i = $index) {
              <li class="login-in inline-flex items-center gap-1.5" [style.--d.ms]="420 + i * 90">
                <svg lucideCheck [size]="14" [strokeWidth]="2.5" class="login-check"></svg>{{ t(k) }}
              </li>
            }
          </ul>
        </div>
      </main>
    </div>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
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
    });

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = setInterval(() => {
        this.prev.set(this.word());
        this.word.update((i) => (i + 1) % this.words.length);
      }, 2600);
      inject(DestroyRef).onDestroy(() => clearInterval(id));
    }
  }

  /** El brillo índigo sigue al puntero con retardo suave (la transición está en CSS). */
  protected follow(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const el = event.currentTarget as HTMLElement;
    el.style.setProperty('--gx', `${event.clientX}px`);
    el.style.setProperty('--gy', `${event.clientY}px`);
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    await this.auth.signInWithGoogle();
    this.busy.set(false);
  }
}
