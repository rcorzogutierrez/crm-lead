import { Component, computed, inject, input } from '@angular/core';
import { t } from '../core/i18n/i18n';
import { Clock } from '../core/clock.service';
import { dueLabel, dueState, fullLabel } from '../core/dates';

/** Fecha de próxima acción con su urgencia: vencido en rojo cinta, hoy resaltado. */
@Component({
  selector: 'app-due-chip',
  template: `{{ label() }}`,
  host: {
    class: 'inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap tabular',
    '[class]': 'tone()',
    '[attr.title]': 'title()',
  },
})
export class DueChip {
  private readonly clock = inject(Clock);
  readonly date = input<Date | null>(null);
  /** Si el lead está cerrado, no hay urgencia que mostrar. */
  readonly closed = input(false);

  protected readonly label = computed(() =>
    this.closed() ? '—' : this.date() ? dueLabel(this.date(), this.clock.now()) : t('today.orphans'),
  );
  protected readonly title = computed(() => fullLabel(this.date()));
  protected readonly tone = computed(() => {
    if (this.closed()) return 'text-ink-3';
    switch (dueState(this.date(), this.clock.now())) {
      case 'overdue':
        return 'bg-ribbon text-white';
      case 'today':
        return 'bg-highlight text-ink';
      case 'none':
        return 'border border-dashed border-ribbon/50 text-ribbon';
      default:
        return 'bg-sheet-2 text-ink-2';
    }
  });
}
