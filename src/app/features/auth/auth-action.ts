import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideEye, LucideEyeOff, LucideMailCheck } from '@lucide/angular';
import { AuthService, authErrorKey, passwordOk } from '../../core/auth.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { AuthBoard } from './auth-board';
import { PasswordRules } from './password-rules';

type View = 'loading' | 'verified' | 'reset' | 'error';

/**
 * Destino de los enlaces de los correos (`/auth/action?mode=…&oobCode=…`), con el diseño de la app
 * en lugar de la página genérica del proveedor. Requiere poner esta URL como "URL de acción" en las
 * plantillas de correo de la consola. Atiende la confirmación del email y la contraseña nueva.
 */
@Component({
  selector: 'app-auth-action',
  imports: [
    AuthBoard,
    FormField,
    RouterLink,
    PasswordRules,
    LucideEye,
    LucideEyeOff,
    LucideMailCheck,
  ],
  template: `
    <app-auth-board>
      <section
        class="login-sheet login-in mx-auto max-w-[25.5rem] text-left text-ink"
        style="--d: 80ms"
        aria-labelledby="action-title"
        aria-live="polite"
      >
        @switch (view()) {
          @case ('loading') {
            <div class="grid gap-3 py-8 pr-5 pl-[2.375rem]" role="status">
              <span
                class="size-5 animate-spin rounded-full border-2 border-pen/25 border-t-pen"
                aria-hidden="true"
              ></span>
              <h1 id="action-title" class="text-ink-2">{{ t('action.checking') }}</h1>
            </div>
          }
          @case ('verified') {
            <div class="grid gap-4 py-6 pr-5 pl-[2.375rem]">
              <span
                class="grid size-14 place-items-center rounded-2xl bg-ok-soft text-ok"
                aria-hidden="true"
              >
                <svg lucideMailCheck [size]="26" [strokeWidth]="1.75"></svg>
              </span>
              <h1 id="action-title" class="date-face text-[1.75rem] leading-tight font-bold">
                {{ t('action.verified') }}
              </h1>
              <p class="text-ink-2">{{ t('action.verifiedBody') }}</p>
              <a routerLink="/login" class="btn-primary h-11 w-full text-[0.9375rem]">{{
                t('login.enter')
              }}</a>
            </div>
          }
          @case ('reset') {
            <header class="border-b border-rule bg-sheet-2 py-3 pr-5 pl-[2.375rem]">
              <h1 id="action-title" class="date-face text-xl font-bold">{{ t('action.newPw') }}</h1>
            </header>
            <form class="grid gap-3.5 py-5 pr-5 pl-[2.375rem]" novalidate (submit)="save($event)">
              <p class="-mt-1 text-[0.8125rem] text-ink-2">
                {{ t('action.for') }}
                <strong class="font-semibold [overflow-wrap:anywhere] text-ink">{{ email() }}</strong>
              </p>
              <!-- Para que el gestor de contraseñas guarde la nueva con su email -->
              <input
                type="email"
                class="sr-only"
                autocomplete="username"
                [value]="email()"
                tabindex="-1"
                aria-hidden="true"
                readonly
              />
              <div>
                <label class="field-label" for="np-pw">{{ t('action.newPwLabel') }}</label>
                <div class="relative">
                  <input
                    id="np-pw"
                    class="input h-11 pr-11"
                    [type]="showPw() ? 'text' : 'password'"
                    autocomplete="new-password"
                    aria-describedby="np-rules"
                    [formField]="pwForm.password"
                  />
                  <button
                    type="button"
                    class="btn-icon absolute top-1 right-1 text-ink-3 hover:text-ink"
                    [attr.aria-pressed]="showPw()"
                    [attr.aria-label]="t(showPw() ? 'login.hidePw' : 'login.showPw')"
                    (click)="showPw.set(!showPw())"
                  >
                    @if (showPw()) {
                      <svg lucideEyeOff [size]="18"></svg>
                    } @else {
                      <svg lucideEye [size]="18"></svg>
                    }
                  </button>
                </div>
                <app-password-rules
                  id="np-rules"
                  [password]="model().password"
                  [touched]="pwForm.password().touched()"
                />
              </div>
              @if (formError(); as err) {
                <p
                  class="rounded-lg bg-ribbon-soft px-3 py-2 text-[0.8125rem] font-medium text-ribbon"
                  role="alert"
                >
                  {{ t(err) }}
                </p>
              }
              <button
                type="submit"
                class="btn-primary h-11 w-full text-[0.9375rem]"
                [disabled]="pwForm().submitting()"
              >
                {{ pwForm().submitting() ? t('action.saving') : t('action.save') }}
              </button>
            </form>
          }
          @case ('error') {
            <div class="grid gap-4 py-6 pr-5 pl-[2.375rem]">
              <h1 id="action-title" class="date-face text-[1.75rem] leading-tight font-bold">
                {{ t('action.badTitle') }}
              </h1>
              <p class="text-ink-2" role="alert">{{ t(error()) }}</p>
              <div class="grid gap-2">
                <a
                  routerLink="/login"
                  [queryParams]="resetLink() ? { mode: 'reset' } : {}"
                  class="btn-primary h-11 w-full text-[0.9375rem]"
                >
                  {{ resetLink() ? t('action.newLink') : t('reset.back') }}
                </a>
              </div>
            </div>
          }
        }
      </section>
    </app-auth-board>
  `,
})
export class AuthAction {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly t = t;

  protected readonly view = signal<View>('loading');
  protected readonly error = signal<I18nKey>('auth.err.link');
  /** Si el enlace era de contraseña: el botón del error pide uno nuevo. */
  protected readonly resetLink = signal(false);
  protected readonly email = signal('');
  protected readonly showPw = signal(false);
  protected readonly formError = signal<I18nKey | null>(null);
  /** Solo tras usar el enlace se sigue a la app según el estado (no por tener ya sesión abierta). */
  private readonly done = signal(false);

  protected readonly model = signal({ password: '' });
  protected readonly pwForm = form(this.model, (p) => {
    validate(p.password, ({ value }) =>
      passwordOk(value()) ? null : { kind: 'weak', message: 'auth.err.weak' },
    );
  });

  private readonly code: string;

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.code = params.get('oobCode') ?? '';
    const mode = params.get('mode');

    effect(() => {
      if (!this.done()) return;
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/today');
      if (s === 'pending') void this.router.navigateByUrl('/pending');
      if (s === 'unverified') void this.router.navigateByUrl('/verify');
    });

    if (!this.code) {
      this.fail('auth.err.link');
    } else if (mode === 'verifyEmail') {
      void this.verify();
    } else if (mode === 'resetPassword') {
      this.resetLink.set(true);
      void this.loadReset();
    } else {
      this.fail('action.unsupported');
    }
  }

  private fail(key: I18nKey): void {
    this.error.set(key);
    this.view.set('error');
  }

  private async verify(): Promise<void> {
    const err = await this.auth.confirmEmail(this.code);
    if (err) return this.fail(err);
    // Con la sesión de esa cuenta abierta en este navegador, la app entra sola; si no, invita a entrar.
    if (this.auth.status() === 'unverified' || this.auth.status() === 'signedOut')
      this.view.set('verified');
    this.done.set(true);
  }

  private async loadReset(): Promise<void> {
    try {
      this.email.set(await this.auth.checkResetCode(this.code));
      this.view.set('reset');
    } catch (err) {
      this.fail(authErrorKey(err));
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);
    await submit(this.pwForm, async () => {
      const err = await this.auth.confirmReset(this.code, this.email(), this.model().password);
      if (err) this.formError.set(err);
      else this.done.set(true);
      return undefined;
    });
  }
}
