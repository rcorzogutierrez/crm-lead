import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormField, email, form, required, submit, validate } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideEye, LucideEyeOff, LucideMailCheck } from '@lucide/angular';
import { map } from 'rxjs';
import { AuthService, passwordOk } from '../../core/auth.service';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { IdleService } from '../../core/idle.service';
import { GoogleMark } from './google-mark';
import { PasswordRules } from './password-rules';

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Hoja de entrar (propuesta A, "Hoja de agenda"): una página de la agenda con margen rojo y la
 * fecha de hoy, con Google y el formulario de email. El modo va en la URL (`?mode=signup|reset`)
 * para que atrás funcione y se pueda enlazar: entrar, crear contraseña (invitados) y recuperarla.
 */
@Component({
  selector: 'app-login-sheet',
  imports: [
    FormField,
    RouterLink,
    GoogleMark,
    PasswordRules,
    LucideEye,
    LucideEyeOff,
    LucideMailCheck,
  ],
  template: `
    <section class="login-sheet text-left text-ink" aria-labelledby="sheet-title">
      <header
        class="flex items-baseline justify-between gap-3 border-b border-rule bg-sheet-2 py-3 pr-5 pl-[2.375rem]"
      >
        <h2
          id="sheet-title"
          #title
          tabindex="-1"
          class="date-face text-xl font-bold focus:outline-none"
        >
          {{ t(heading()) }}
        </h2>
        @if (mode() === 'signin') {
          <span class="date-face shrink-0 text-[0.8125rem] font-semibold text-ink-3">{{
            today()
          }}</span>
        }
      </header>

      <div class="grid gap-3.5 py-5 pr-5 pl-[2.375rem]">
        @switch (mode()) {
          @case ('signin') {
            <button
              type="button"
              class="btn-secondary h-11 w-full text-[0.9375rem]"
              [disabled]="googleBusy()"
              (click)="google()"
            >
              @if (googleBusy()) {
                <span
                  class="size-4 animate-spin rounded-full border-2 border-pen/25 border-t-pen"
                  aria-hidden="true"
                ></span>
                {{ t('login.opening') }}
              } @else {
                <app-google-mark />
                {{ t('login.google') }}
              }
            </button>
            @if (auth.error(); as err) {
              <p
                class="rounded-lg bg-ribbon-soft px-3 py-2 text-[0.8125rem] font-medium text-ribbon"
                role="alert"
              >
                {{ t(err) }}
              </p>
            }

            <p class="login-or text-[0.8125rem] text-ink-3">{{ t('login.or') }}</p>

            <form class="grid gap-3.5" novalidate (submit)="signIn($event)">
              <div>
                <label class="field-label" for="li-email">{{ t('login.email') }}</label>
                <input
                  id="li-email"
                  type="email"
                  class="input h-11"
                  autocomplete="username"
                  [formField]="signinForm.email"
                />
                @if (signinForm.email().touched() && signinForm.email().invalid()) {
                  <p class="field-error">{{ t($any(signinForm.email().errors()[0].message)) }}</p>
                }
              </div>
              <div>
                <div class="mb-1.5 flex items-baseline justify-between gap-3">
                  <label class="field-label mb-0" for="li-pw">{{ t('login.password') }}</label>
                  <a
                    routerLink="/login"
                    [queryParams]="{ mode: 'reset' }"
                    class="text-[0.8125rem] font-semibold text-pen hover:underline"
                    >{{ t('login.forgot') }}</a
                  >
                </div>
                <div class="relative">
                  <input
                    id="li-pw"
                    class="input h-11 pr-11"
                    [type]="showPw() ? 'text' : 'password'"
                    autocomplete="current-password"
                    [formField]="signinForm.password"
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
                @if (signinForm.password().touched() && signinForm.password().invalid()) {
                  <p class="field-error">
                    {{ t($any(signinForm.password().errors()[0].message)) }}
                  </p>
                }
              </div>
              @if (formError(); as err) {
                <p
                  class="rounded-lg bg-ribbon-soft px-3 py-2 text-[0.8125rem] font-medium text-ribbon"
                  role="alert"
                >
                  {{ t(err) }}
                  @if (err === 'auth.err.tooMany' || err === 'auth.err.credentials') {
                    <a
                      routerLink="/login"
                      [queryParams]="{ mode: 'reset' }"
                      class="font-semibold underline"
                      >{{ t('login.resetIt') }}</a
                    >
                  }
                </p>
              }
              <button
                type="submit"
                class="btn-primary h-11 w-full text-[0.9375rem]"
                [disabled]="signinForm().submitting()"
              >
                {{ signinForm().submitting() ? t('login.entering') : t('login.enter') }}
              </button>
            </form>
          }

          @case ('signup') {
            <p class="-mt-1 text-[0.8125rem] text-ink-2">{{ t('signup.hint') }}</p>
            <form class="grid gap-3.5" novalidate (submit)="signUp($event)">
              <div>
                <label class="field-label" for="su-name">{{ t('signup.name') }}</label>
                <input
                  id="su-name"
                  class="input h-11"
                  autocomplete="name"
                  [formField]="signupForm.name"
                />
                @if (signupForm.name().touched() && signupForm.name().invalid()) {
                  <p class="field-error">{{ t($any(signupForm.name().errors()[0].message)) }}</p>
                }
              </div>
              <div>
                <label class="field-label" for="su-email">{{ t('login.email') }}</label>
                <input
                  id="su-email"
                  type="email"
                  class="input h-11"
                  autocomplete="username"
                  [formField]="signupForm.email"
                />
                @if (signupForm.email().touched() && signupForm.email().invalid()) {
                  <p class="field-error">{{ t($any(signupForm.email().errors()[0].message)) }}</p>
                }
              </div>
              <div>
                <label class="field-label" for="su-pw">{{ t('login.password') }}</label>
                <div class="relative">
                  <input
                    id="su-pw"
                    class="input h-11 pr-11"
                    [type]="showPw() ? 'text' : 'password'"
                    autocomplete="new-password"
                    aria-describedby="su-rules"
                    [formField]="signupForm.password"
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
                  id="su-rules"
                  [password]="model().password"
                  [touched]="signupForm.password().touched()"
                />
              </div>
              @if (formError(); as err) {
                <p
                  class="rounded-lg bg-ribbon-soft px-3 py-2 text-[0.8125rem] font-medium text-ribbon"
                  role="alert"
                >
                  {{ t(err) }}
                  @if (err === 'auth.err.inUse') {
                    <a routerLink="/login" class="font-semibold underline">{{
                      t('login.enter')
                    }}</a>
                  }
                </p>
              }
              <button
                type="submit"
                class="btn-primary h-11 w-full text-[0.9375rem]"
                [disabled]="signupForm().submitting()"
              >
                {{ signupForm().submitting() ? t('signup.creating') : t('signup.submit') }}
              </button>
            </form>
            <p class="text-center text-[0.8125rem] text-ink-2">
              {{ t('signup.haveOne') }}
              <a routerLink="/login" class="font-semibold text-pen hover:underline">{{
                t('login.enter')
              }}</a>
            </p>
          }

          @case ('reset') {
            @if (resetSent()) {
              <p
                class="flex items-start gap-2.5 rounded-lg bg-ok-soft px-3 py-2.5 text-[0.875rem] text-ink"
                role="status"
              >
                <svg
                  lucideMailCheck
                  [size]="18"
                  class="mt-px shrink-0 text-ok"
                  aria-hidden="true"
                ></svg>
                {{ t('reset.sent', { email: model().email.trim() }) }}
              </p>
              <p class="text-[0.8125rem] text-ink-3">{{ t('verify.spam') }}</p>
              <a routerLink="/login" class="btn-secondary h-11 w-full text-[0.9375rem]">{{
                t('reset.back')
              }}</a>
            } @else {
              <p class="-mt-1 text-[0.8125rem] text-ink-2">{{ t('reset.hint') }}</p>
              <form class="grid gap-3.5" novalidate (submit)="reset($event)">
                <div>
                  <label class="field-label" for="rs-email">{{ t('login.email') }}</label>
                  <input
                    id="rs-email"
                    type="email"
                    class="input h-11"
                    autocomplete="username"
                    [formField]="resetForm.email"
                  />
                  @if (resetForm.email().touched() && resetForm.email().invalid()) {
                    <p class="field-error">{{ t($any(resetForm.email().errors()[0].message)) }}</p>
                  }
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
                  [disabled]="resetForm().submitting()"
                >
                  {{ resetForm().submitting() ? t('reset.sending') : t('reset.submit') }}
                </button>
              </form>
              <p class="text-center text-[0.8125rem]">
                <a routerLink="/login" class="font-semibold text-pen hover:underline">{{
                  t('reset.back')
                }}</a>
              </p>
            }
          }
        }
      </div>
    </section>
  `,
})
export class LoginSheet {
  protected readonly auth = inject(AuthService);
  private readonly idle = inject(IdleService);
  protected readonly t = t;

  private readonly query = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((p) => p.get('mode'))),
  );
  protected readonly mode = computed<Mode>(() => {
    const m = this.query();
    return m === 'signup' || m === 'reset' ? m : 'signin';
  });
  protected readonly heading = computed<I18nKey>(() =>
    this.mode() === 'signup'
      ? 'signup.title'
      : this.mode() === 'reset'
        ? 'reset.title'
        : 'login.sheetTitle',
  );
  protected readonly today = computed(() =>
    new Intl.DateTimeFormat(intlLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date()),
  );

  /** Un solo modelo: el email escrito sigue ahí al pasar de entrar a recuperar o a crear. */
  protected readonly model = signal({ name: '', email: '', password: '' });
  protected readonly signinForm = form(this.model, (p) => {
    required(p.email, { message: 'form.emailRequired' });
    email(p.email, { message: 'form.emailInvalid' });
    required(p.password, { message: 'login.pwRequired' });
  });
  protected readonly signupForm = form(this.model, (p) => {
    required(p.name, { message: 'signup.nameRequired' });
    required(p.email, { message: 'form.emailRequired' });
    email(p.email, { message: 'form.emailInvalid' });
    validate(p.password, ({ value }) =>
      passwordOk(value()) ? null : { kind: 'weak', message: 'auth.err.weak' },
    );
  });
  protected readonly resetForm = form(this.model, (p) => {
    required(p.email, { message: 'form.emailRequired' });
    email(p.email, { message: 'form.emailInvalid' });
  });

  protected readonly showPw = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly formError = signal<I18nKey | null>(null);
  protected readonly resetSent = signal(false);

  private readonly titleEl = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    // Al cambiar de modo (no al cargar), el foco va al título de la hoja: el lector de pantalla anuncia dónde está.
    let first = true;
    effect(() => {
      this.mode();
      this.formError.set(null);
      this.resetSent.set(false);
      if (first) {
        first = false;
        return;
      }
      queueMicrotask(() => this.titleEl().nativeElement.focus());
    });
  }

  protected async google(): Promise<void> {
    this.googleBusy.set(true);
    this.idle.reset();
    await this.auth.signInWithGoogle();
    this.googleBusy.set(false);
  }

  protected async signIn(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);
    await submit(this.signinForm, async () => {
      this.idle.reset();
      const { email: mail, password } = this.model();
      this.formError.set(await this.auth.signInWithPassword(mail, password));
      return undefined;
    });
  }

  protected async signUp(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);
    await submit(this.signupForm, async () => {
      this.idle.reset();
      const { name, email: mail, password } = this.model();
      this.formError.set(await this.auth.signUp(name, mail, password));
      return undefined;
    });
  }

  protected async reset(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);
    await submit(this.resetForm, async () => {
      const err = await this.auth.sendPasswordReset(this.model().email);
      this.formError.set(err);
      this.resetSent.set(!err);
      return undefined;
    });
  }
}
