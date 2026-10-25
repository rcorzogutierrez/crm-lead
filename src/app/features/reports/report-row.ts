import { Component, input } from '@angular/core';

/**
 * Renglón del informe semanal: la cifra va en el margen (como la hora en la agenda),
 * separada por la línea de margen roja; el detalle, a la derecha.
 */
@Component({
  selector: 'app-report-row',
  template: `
    <div class="flex shrink-0 items-baseline gap-2 px-4 pt-4 sm:w-40 sm:flex-col sm:gap-0.5 sm:border-r sm:border-ribbon/40 sm:px-6 sm:py-5">
      <span class="date-face text-[1.375rem] leading-7 font-bold tabular" [class.text-ribbon]="alert()">{{ figure() }}</span>
      <span class="text-[0.8125rem] leading-[1.125rem] text-ink-2">{{ caption() }}</span>
    </div>
    <div class="min-w-0 flex-1 px-4 pt-1 pb-5 sm:px-7 sm:py-5">
      <h2 class="mb-2 text-[1.0625rem] leading-6 font-bold">{{ heading() }}</h2>
      <ng-content />
    </div>
  `,
  host: {
    class: 'flex flex-col border-t border-rule sm:flex-row',
    '[class]': "alert() ? 'bg-ribbon-soft/50' : ''",
  },
})
export class ReportRow {
  readonly figure = input.required<string>();
  readonly caption = input.required<string>();
  readonly heading = input.required<string>();
  /** Lo que se está cayendo: la cifra en rojo y el renglón teñido. */
  readonly alert = input(false);
}
