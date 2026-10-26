import { Component, input, output } from '@angular/core';
import { t } from '../../core/i18n/i18n';

/** Desde / Hasta con el selector de fecha nativo. Emite al cambiar cualquiera de los dos. */
@Component({
  selector: 'app-range-picker',
  template: `
    <fieldset class="flex flex-wrap items-end gap-3">
      <legend class="sr-only">{{ t('report.range') }}</legend>
      <label class="min-w-[9.5rem] flex-1 sm:flex-none">
        <span class="field-label">{{ t('report.from') }}</span>
        <input type="date" class="input tabular" [value]="from()" [max]="max()" (change)="set($any($event.target).value, to())" />
      </label>
      <label class="min-w-[9.5rem] flex-1 sm:flex-none">
        <span class="field-label">{{ t('report.to') }}</span>
        <input type="date" class="input tabular" [value]="to()" [max]="max()" (change)="set(from(), $any($event.target).value)" />
      </label>
      <ng-content />
    </fieldset>
  `,
})
export class RangePicker {
  /** Fechas como "AAAA-MM-DD". */
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  readonly max = input.required<string>();
  readonly changed = output<{ from: string; to: string }>();

  protected readonly t = t;

  protected set(from: string, to: string): void {
    // Un campo vaciado a mano no cambia nada: se espera a que haya dos fechas.
    if (from && to) this.changed.emit({ from, to });
  }
}
