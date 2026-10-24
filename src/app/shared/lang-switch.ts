import { ApplicationRef, Component, inject, input } from '@angular/core';
import { LucideGlobe } from '@lucide/angular';
import { Lang, lang, setLang, t } from '../core/i18n/i18n';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Selector ES / EN en forma de pastilla: el indicador se desliza al idioma elegido
 * y la página cambia de idioma con un fundido (View Transitions; sin ellas, cambio directo).
 * `tone="rail"` para fondos oscuros (riel, barra móvil).
 */
@Component({
  selector: 'app-lang-switch',
  imports: [LucideGlobe],
  template: `
    <div
      role="group"
      [attr.aria-label]="t('lang.label')"
      class="inline-flex items-center gap-1 rounded-full p-1 text-[0.75rem] font-bold tracking-wide"
      [class]="tone() === 'rail' ? 'bg-rail-ink/10 ring-1 ring-rail-ink/15' : 'bg-sheet shadow-sm ring-1 ring-rule'"
    >
      <svg lucideGlobe [size]="14" class="ml-1.5" [class]="tone() === 'rail' ? 'text-rail-muted' : 'text-ink-3'" aria-hidden="true"></svg>
      <div class="relative grid grid-cols-2">
        <span
          aria-hidden="true"
          class="lang-thumb absolute inset-y-0 left-0 w-1/2 rounded-full bg-pen shadow-sm"
          [style.transform]="lang() === 'en' ? 'translateX(100%)' : 'translateX(0)'"
        ></span>
        @for (opt of options; track opt.id) {
          <button
            type="button"
            class="relative h-7 w-10 rounded-full transition-colors duration-200"
            [class]="
              lang() === opt.id
                ? 'text-white'
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
    </div>
  `,
  host: { class: 'inline-flex' },
})
export class LangSwitch {
  readonly tone = input<'rail' | 'light'>('light');
  private readonly appRef = inject(ApplicationRef);
  protected readonly lang = lang;
  protected readonly t = t;
  protected readonly options: readonly { id: Lang; short: string; name: string }[] = [
    { id: 'es', short: 'ES', name: 'Español' },
    { id: 'en', short: 'EN', name: 'English' },
  ];

  protected set(value: Lang): void {
    if (value === lang()) return;
    const doc = document as ViewTransitionDoc;
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLang(value);
      return;
    }
    const root = doc.documentElement;
    root.classList.add('lang-vt');
    doc
      .startViewTransition(() => {
        setLang(value);
        this.appRef.tick();
      })
      .finished.finally(() => root.classList.remove('lang-vt'));
  }
}
