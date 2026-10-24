import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideBellRing, LucideCheck, LucideMail, LucidePhone, LucideUsers, LucideZap } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

interface DemoRow {
  name: string;
  time: string;
  note: I18nKey;
  icon: 'call' | 'meeting' | 'email';
  done?: boolean;
}

/**
 * Entrar. A la izquierda, la promesa del producto con una vista previa viva de la agenda
 * (datos de ejemplo); a la derecha, el acceso con Google. Todo entra con una transición escalonada.
 */
@Component({
  selector: 'app-login',
  imports: [Logo, LangSwitch, LucidePhone, LucideUsers, LucideMail, LucideCheck, LucideZap, LucideBellRing],
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <!-- Promesa + vista previa -->
      <section class="login-hero relative isolate hidden overflow-hidden text-white lg:flex lg:flex-col">
        <span class="login-blob top-[-10%] left-[-8%] size-[34rem] bg-[oklch(0.52_0.22_275/0.55)]" aria-hidden="true"></span>
        <span class="login-blob bottom-[-18%] right-[-10%] size-[38rem] bg-[oklch(0.58_0.2_305/0.4)] [animation-delay:-6s]" aria-hidden="true"></span>

        <div class="relative flex flex-1 flex-col justify-between gap-12 px-12 py-10 xl:px-20 xl:py-14">
          <div class="enter flex items-center gap-3" style="--d: 0ms">
            <app-logo [size]="38" />
            <span class="date-face text-xl font-bold tracking-tight">CRM Lead</span>
          </div>

          <div class="grid items-center gap-10 min-[1800px]:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] min-[1800px]:gap-12">
            <div>
              <h1 class="enter date-face max-w-[16ch] text-[3rem] leading-[1.02] font-bold tracking-tight text-balance xl:text-[3.5rem] min-[1800px]:text-[4rem]" style="--d: 80ms">
                {{ t('login.thesis') }}
              </h1>
              <p class="enter mt-5 max-w-[44ch] text-lg leading-relaxed text-white/70" style="--d: 160ms">{{ t('login.pitch') }}</p>
              <ul class="enter mt-8 flex flex-wrap gap-2.5" style="--d: 240ms">
                @for (f of features; track f.key) {
                  <li class="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3.5 py-1.5 text-sm font-medium text-white/85 backdrop-blur">
                    @switch (f.icon) {
                      @case ('zap') { <svg lucideZap [size]="15" class="text-[oklch(0.86_0.15_92)]"></svg> }
                      @case ('bell') { <svg lucideBellRing [size]="15" class="text-[oklch(0.8_0.12_25)]"></svg> }
                      @case ('users') { <svg lucideUsers [size]="15" class="text-[oklch(0.82_0.1_275)]"></svg> }
                    }
                    {{ t(f.key) }}
                  </li>
                }
              </ul>
            </div>

            <!-- Vista previa de la agenda (ejemplo) -->
            <div class="enter relative max-w-[26rem]" style="--d: 320ms" aria-hidden="true">
              <div class="float-slow glass rounded-2xl p-4">
                <div class="flex items-center justify-between px-1 pb-3">
                  <p class="text-sm font-bold">{{ t('due.today') }}</p>
                  <p class="text-xs font-semibold text-white/55">{{ t('login.demo.count') }}</p>
                </div>
                <ul class="space-y-2">
                  @for (row of demo; track row.name; let i = $index) {
                    <li class="enter relative flex items-center gap-3 rounded-xl bg-white/[0.06] p-3" [style.--d.ms]="480 + i * 140">
                      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
                        @switch (row.icon) {
                          @case ('call') { <svg lucidePhone [size]="16"></svg> }
                          @case ('meeting') { <svg lucideUsers [size]="16"></svg> }
                          @case ('email') { <svg lucideMail [size]="16"></svg> }
                        }
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold">{{ row.name }}</p>
                        <p class="truncate text-xs text-white/60"><span class="tabular font-semibold text-white/80">{{ row.time }}</span> · {{ t(row.note) }}</p>
                      </div>
                      @if (row.done) {
                        <span class="check-pop inline-flex h-7 items-center gap-1 rounded-full bg-[oklch(0.62_0.15_155)] px-2.5 text-xs font-bold" style="--d: 1250ms">
                          <svg lucideCheck [size]="13" [strokeWidth]="2.5"></svg>{{ t('fu.doneBtn') }}
                        </span>
                      } @else {
                        <span class="inline-flex h-7 items-center rounded-full border border-white/15 px-2.5 text-xs font-semibold text-white/70">{{ t('fu.doneBtn') }}</span>
                      }
                      @if (i === 1) {
                        <span class="now-line pointer-events-none absolute inset-x-2 -bottom-[5px] flex items-center" style="--d: 900ms">
                          <span class="size-2 rounded-full bg-ribbon"></span><span class="h-px flex-1 bg-ribbon/80"></span>
                        </span>
                      }
                    </li>
                  }
                </ul>
              </div>
              <div class="enter float-slow glass absolute -bottom-5 -left-5 flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2 text-xs font-bold [animation-delay:-3s]" style="--d: 1500ms">
                <span class="grid size-6 place-items-center rounded-full bg-[oklch(0.86_0.15_92)] text-[oklch(0.3_0.05_92)]">+1</span>
                {{ t('login.demo.captured') }}
              </div>
            </div>
          </div>

          <p class="enter text-sm text-white/50" style="--d: 400ms">{{ t('login.tagline') }} · {{ t('login.demo.sample') }}</p>
        </div>
      </section>

      <!-- Acceso -->
      <section class="login-side relative flex items-center justify-center px-6 py-16">
        <app-lang-switch class="enter absolute top-5 right-5" style="--d: 200ms" />
        <div class="w-full max-w-[24rem]">
          <div class="enter login-hero relative isolate overflow-hidden rounded-2xl p-5 text-white shadow-lift lg:hidden" style="--d: 0ms">
            <div class="flex items-center gap-2.5">
              <app-logo [size]="32" />
              <span class="date-face text-lg font-bold">CRM Lead</span>
            </div>
            <p class="date-face mt-5 max-w-[18ch] text-[1.75rem] leading-[1.05] font-bold tracking-tight text-balance">{{ t('login.thesis') }}</p>
          </div>
          <h2 class="enter date-face mt-10 text-[2.25rem] leading-tight font-bold tracking-tight lg:mt-0" style="--d: 120ms">{{ t('login.heading') }}</h2>
          <p class="enter mt-2 text-ink-2" style="--d: 180ms">{{ t('login.hint') }}</p>

          <button
            type="button"
            class="google-btn enter mt-9 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-rule-strong bg-sheet text-[0.9375rem] font-semibold text-ink"
            style="--d: 260ms"
            [disabled]="busy()"
            (click)="signIn()"
          >
            @if (busy()) {
              <span class="size-4 animate-spin rounded-full border-2 border-pen/25 border-t-pen" aria-hidden="true"></span>
            } @else {
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
            }
            {{ busy() ? t('login.opening') : t('login.google') }}
          </button>

          @if (auth.error(); as err) {
            <p class="enter mt-4 rounded-lg bg-ribbon-soft px-3 py-2 text-sm font-medium text-ribbon" role="alert">{{ t(err) }}</p>
          }

          <div class="enter mt-10 flex gap-3 rounded-xl border border-rule bg-sheet/70 p-4" style="--d: 340ms">
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-pen-soft text-pen-strong"><svg lucideUsers [size]="16"></svg></span>
            <p class="text-sm leading-relaxed text-ink-2">{{ t('login.first') }}</p>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly t = t;

  protected readonly features: readonly { key: I18nKey; icon: 'zap' | 'bell' | 'users' }[] = [
    { key: 'login.f1', icon: 'zap' },
    { key: 'login.f2', icon: 'bell' },
    { key: 'login.f3', icon: 'users' },
  ];

  /** Datos de ejemplo para la vista previa (no son leads reales). */
  protected readonly demo: readonly DemoRow[] = [
    { name: 'Ana Morales', time: '09:30', note: 'login.demo.1', icon: 'call', done: true },
    { name: 'Martín Ríos', time: '12:30', note: 'login.demo.2', icon: 'meeting' },
    { name: 'Sofía Herrera', time: '16:00', note: 'login.demo.3', icon: 'email' },
  ];

  constructor() {
    effect(() => {
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/hoy');
      if (s === 'pending') void this.router.navigateByUrl('/acceso-pendiente');
    });
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    await this.auth.signInWithGoogle();
    this.busy.set(false);
  }
}
