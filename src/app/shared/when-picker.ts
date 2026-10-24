import { Component, computed, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cuándo">
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
          {{ p.label }}
        </button>
      }
    </div>
    @if (active() === 'custom') {
      <input
        type="datetime-local"
        class="input mt-2"
        aria-label="Fecha y hora exactas"
        [ngModel]="localValue()"
        (ngModelChange)="setCustom($event)"
      />
    }
  `,
})
export class WhenPicker {
  private readonly clock = inject(Clock);
  readonly value = model<Date>(presetDate('tomorrow', new Date()));

  protected readonly presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'tomorrow', label: 'Mañana' },
    { id: 'in3', label: 'En 3 días' },
    { id: 'nextWeek', label: 'Próx. semana' },
    { id: 'custom', label: 'Otra fecha' },
  ];

  protected readonly active = signal<Preset>('tomorrow');
  protected readonly localValue = computed(() => toLocalInput(this.value()));

  protected pick(p: Preset): void {
    this.active.set(p);
    const now = this.clock.now();
    if (p === 'today') {
      const d = new Date(now);
      d.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
      this.value.set(d);
    } else if (p !== 'custom') {
      this.value.set(presetDate(p, now));
    }
  }

  protected setCustom(v: string): void {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) this.value.set(d);
  }
}
