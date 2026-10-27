import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideMail } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { AuthBoard } from './auth-board';

/** Segundos de espera entre reenvíos del enlace (el proveedor también limita los envíos). */
const RESEND_WAIT = 60;
/** Cada cuánto se mira si ya confirmó el email (en otra pestaña o en el móvil). */
const POLL_MS = 5_000;

/**
 * "Revisa tu correo": cuenta con contraseña que aún no confirmó su email. Sin confirmar no ve datos
 * (las reglas exigen `email_verified`). Entra sola en cuanto lo confirma, aunque sea en otro dispositivo.
 */
@Component({
  selector: 'app-verify',
  imports: [AuthBoard, LucideMail],
  template: `
    <app-auth-board>
      <section
        class="login-sheet login-in mx-auto max-w-[25.5rem] text-left text-ink"
        style="--d: 80ms"
        aria-labelledby="verify-title"
      >
        <div class="grid gap-4 py-6 pr-5 pl-[2.375rem]">
          <span
            class="grid size-14 place-items-center rounded-2xl bg-pen-soft text-pen"
            aria-hidden="true"
          >
            <svg lucideMail [size]="26" [strokeWidth]="1.75"></svg>
          </span>
          <h1 id="verify-title" class="date-face text-[1.75rem] leading-tight font-bold">
            {{ t('verify.title') }}
          </h1>
          <p class="text-ink-2">
            {{ t('verify.sentTo') }}
            <strong class="block font-semibold [overflow-wrap:anywhere] text-ink">{{ auth.user()?.email }}</strong>
          </p>
          <p class="text-ink-2">{{ t('verify.open') }}</p>
          <p class="text-[0.8125rem] text-ink-3">{{ t('verify.spam') }}</p>

          @if (note(); as n) {
            <p
              class="rounded-lg px-3 py-2 text-[0.8125rem] font-medium"
              [class]="noteTone() === 'bad' ? 'bg-ribbon-soft text-ribbon' : 'bg-ok-soft text-ink'"
              role="status"
            >
              {{ t(n) }}
            </p>
          }

          <div class="grid gap-2">
            <button
              type="button"
              class="btn-primary h-11 w-full text-[0.9375rem]"
              [disabled]="checking()"
              (click)="check()"
            >
              {{ checking() ? t('pending.checking') : t('verify.done') }}
            </button>
            <button
              type="button"
              class="btn-secondary h-11 w-full text-[0.9375rem] tabular"
              [disabled]="wait() > 0 || sending()"
              (click)="resend()"
            >
              {{ wait() > 0 ? t('verify.resendIn', { s: waitLabel() }) : t('verify.resend') }}
            </button>
            <button
              type="button"
              class="btn-ghost h-10 w-full text-pen hover:text-pen-strong"
              (click)="other()"
            >
              {{ t('pending.other') }}
            </button>
          </div>
        </div>
      </section>
    </app-auth-board>
  `,
})
export class Verify {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly t = t;

  protected readonly checking = signal(false);
  protected readonly sending = signal(false);
  /** Segundos que faltan para poder reenviar (recién creada la cuenta, el primer enlace acaba de salir). */
  protected readonly wait = signal(this.initialWait());
  protected readonly note = signal<I18nKey | null>(null);
  protected readonly noteTone = signal<'ok' | 'bad'>('ok');

  constructor() {
    effect(() => {
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/today');
      if (s === 'pending') void this.router.navigateByUrl('/pending');
      if (s === 'signedOut') void this.router.navigateByUrl('/login');
    });

    const tick = setInterval(() => this.wait.update((w) => Math.max(0, w - 1)), 1000);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.auth.refreshVerification();
    }, POLL_MS);
    const onFocus = () => void this.auth.refreshVerification();
    window.addEventListener('focus', onFocus);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
    });
  }

  private initialWait(): number {
    const created = Date.parse(this.auth.user()?.metadata.creationTime ?? '');
    if (!created) return 0;
    return Math.max(0, RESEND_WAIT - Math.round((Date.now() - created) / 1000));
  }

  protected waitLabel(): string {
    const w = this.wait();
    return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`;
  }

  protected async check(): Promise<void> {
    this.checking.set(true);
    this.note.set(null);
    const ok = await this.auth.refreshVerification();
    this.checking.set(false);
    if (!ok) {
      this.noteTone.set('bad');
      this.note.set('verify.notYet');
    }
  }

  protected async resend(): Promise<void> {
    this.sending.set(true);
    const err = await this.auth.resendVerification();
    this.sending.set(false);
    this.noteTone.set(err ? 'bad' : 'ok');
    this.note.set(err ?? 'verify.resent');
    if (!err) this.wait.set(RESEND_WAIT);
  }

  protected other(): void {
    void this.auth.signOut(null).then(() => this.router.navigateByUrl('/login'));
  }
}
