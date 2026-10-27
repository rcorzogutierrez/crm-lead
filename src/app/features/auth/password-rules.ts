import { Component, computed, input } from '@angular/core';
import { LucideCheck, LucideCircle } from '@lucide/angular';
import { PASSWORD_RULES } from '../../core/auth.service';
import { I18nKey, t } from '../../core/i18n/i18n';

/** Requisitos de la contraseña, marcados en verde según se escribe (en rojo si se intentó enviar sin cumplirlos). */
@Component({
  selector: 'app-password-rules',
  imports: [LucideCheck, LucideCircle],
  template: `
    <ul class="mt-2 grid gap-1 text-[0.8125rem]">
      @for (r of rules(); track r.key) {
        <li
          class="flex items-center gap-1.5"
          [class]="r.ok ? 'text-ok' : touched() ? 'text-ribbon' : 'text-ink-3'"
        >
          @if (r.ok) {
            <svg lucideCheck [size]="14" [strokeWidth]="2.5" aria-hidden="true"></svg>
          } @else {
            <svg
              lucideCircle
              [size]="8"
              [strokeWidth]="3"
              class="mx-[3px]"
              aria-hidden="true"
            ></svg>
          }
          {{ t(r.key)
          }}<span class="sr-only">: {{ r.ok ? t('signup.ruleOk') : t('signup.ruleMissing') }}</span>
        </li>
      }
    </ul>
  `,
})
export class PasswordRules {
  readonly password = input.required<string>();
  readonly touched = input(false);
  protected readonly t = t;

  protected readonly rules = computed(() => {
    const pw = this.password();
    return [
      { key: 'signup.ruleLength' as I18nKey, ok: PASSWORD_RULES.length(pw) },
      { key: 'signup.ruleMix' as I18nKey, ok: PASSWORD_RULES.mix(pw) },
    ];
  });
}
