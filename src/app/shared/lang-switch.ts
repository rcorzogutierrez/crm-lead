import { Component, input } from '@angular/core';
import { Lang, lang, setLang, t } from '../core/i18n/i18n';

/** Selector ES / EN. `tone="rail"` para fondos oscuros (riel, barra móvil). */
@Component({
  selector: 'app-lang-switch',
  template: `
    <div
      role="group"
      [attr.aria-label]="t('lang.label')"
      class="inline-flex rounded-md p-0.5 text-[0.75rem] font-bold tracking-wide"
      [class]="tone() === 'rail' ? 'bg-rail-ink/10' : 'bg-sheet-2 ring-1 ring-rule'"
    >
      @for (opt of options; track opt.id) {
        <button
          type="button"
          class="h-7 min-w-9 rounded px-2 transition-colors duration-150"
          [class]="
            lang() === opt.id
              ? tone() === 'rail' ? 'bg-rail-ink text-rail-deep' : 'bg-sheet text-ink shadow-sm'
              : tone() === 'rail' ? 'text-rail-muted hover:text-rail-ink' : 'text-ink-3 hover:text-ink'
          "
          [attr.aria-pressed]="lang() === opt.id"
          [attr.lang]="opt.id"
          [title]="opt.name"
          (click)="set(opt.id)"
        >
          {{ opt.short }}
        </button>
      }
    </div>
  `,
  host: { class: 'inline-flex' },
})
export class LangSwitch {
  readonly tone = input<'rail' | 'light'>('light');
  protected readonly lang = lang;
  protected readonly t = t;
  protected readonly options: readonly { id: Lang; short: string; name: string }[] = [
    { id: 'es', short: 'ES', name: 'Español' },
    { id: 'en', short: 'EN', name: 'English' },
  ];

  protected set(value: Lang): void {
    setLang(value);
  }
}
