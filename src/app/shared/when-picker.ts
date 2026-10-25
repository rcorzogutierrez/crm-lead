import { Component, computed, inject, linkedSignal, model, untracked } from '@angular/core';
import { I18nKey, t } from '../core/i18n/i18n';
import { Clock } from '../core/clock.service';
import { presetDate, toLocalInput } from '../core/dates';

type Preset = 'today' | 'tomorrow' | 'in3' | 'nextWeek' | 'custom';

/**
 * Selector de fecha de la próxima acción: atajos de un toque + fecha exacta.
 * El valor es la fecha elegida.
 */
@Component({
  selector: 'app-when-picker',
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-label]="t('when.label')">
      @for (p of presets; track p.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="active() === p.id"
          (click)="pick(p.id)"
          class="h-8 rounded-md border px-2.5 text-[0.8125rem] font-semibold transition-colors duration-150"
          [class]="
            active() === p.id
              ? 'border-pen bg-pen text-white'
              : 'border-rule-strong bg-sheet text-ink-2 hover:border-ink-3 hover:text-ink'
          "
        >
          {{ t(p.label) }}
        </button>
      }
    </div>
    @if (active() === 'custom') {
      <input
        type="datetime-local"
        class="input mt-2"
        [attr.aria-label]="t('when.exact')"
        [value]="localValue()"
        (input)="setCustom($any($event.target).value)"
      />
    }
  `,
})
export class WhenPicker {
  private readonly clock = inject(Clock);
  readonly value = model<Date>(presetDate('tomorrow', new Date()));

  protected readonly t = t;
  protected readonly presets: { id: Preset; label: I18nKey }[] = [
    { id: 'today', label: 'due.today' },
    { id: 'tomorrow', label: 'due.tomorrow' },
    { id: 'in3', label: 'when.in3' },
    { id: 'nextWeek', label: 'when.nextWeek' },
    { id: 'custom', label: 'when.custom' },
  ];

  /** Última fecha escrita a mano: mientras no cambie, sigue marcado "Otra fecha". */
  private customAt: number | null = null;

  /**
   * Atajo marcado, derivado de la fecha: si el padre la cambia (p. ej. al reabrir la captura),
   * se marca el atajo que le corresponde. Se conserva el elegido mientras siga encajando.
   */
  protected readonly active = linkedSignal<Date, Preset>({
    source: this.value,
    computation: (value, prev) => {
      if (prev && this.fits(prev.value, value)) return prev.value;
      return this.presets.find((p) => p.id !== 'custom' && this.fits(p.id, value))?.id ?? 'custom';
    },
  });
  protected readonly localValue = computed(() => toLocalInput(this.value()));

  protected pick(p: Preset): void {
    if (p === 'custom') this.customAt = this.value().getTime();
    this.active.set(p);
    if (p !== 'custom') this.value.set(this.dateFor(p, this.clock.now()));
  }

  protected setCustom(v: string): void {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return;
    this.customAt = d.getTime();
    this.value.set(d);
  }

  private dateFor(p: Exclude<Preset, 'custom'>, now: Date): Date {
    if (p !== 'today') return presetDate(p, now);
    const d = new Date(now);
    d.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
    return d;
  }

  private fits(p: Preset, value: Date): boolean {
    if (p === 'custom') return value.getTime() === this.customAt;
    return this.dateFor(p, untracked(this.clock.now)).getTime() === value.getTime();
  }
}
