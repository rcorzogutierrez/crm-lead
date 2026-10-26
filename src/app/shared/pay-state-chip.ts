import { Component, computed, input } from '@angular/core';
import { I18nKey, t } from '../core/i18n/i18n';
import { PayState } from '../core/invoice-math';

const LABEL: Record<PayState, I18nKey> = {
  issued: 'pay.state.issued',
  partial: 'pay.state.partial',
  paid: 'pay.state.paid',
  overdue: 'pay.state.overdue',
  void: 'pay.state.void',
};

/**
 * Estado de cobro de una factura, siempre con texto. Vencida usa la cinta roja como lo
 * vencido de la agenda; pagada, el verde de "hecho"; anulada, tachada.
 */
@Component({
  selector: 'app-pay-state-chip',
  template: `{{ label() }}`,
  host: {
    class: 'inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap',
    '[class]': 'tone()',
  },
})
export class PayStateChip {
  readonly state = input.required<PayState>();

  protected readonly label = computed(() => t(LABEL[this.state()]));
  protected readonly tone = computed(() => {
    switch (this.state()) {
      case 'overdue':
        return 'bg-ribbon text-white';
      case 'paid':
        return 'bg-ok-soft text-ok';
      case 'partial':
        return 'bg-pen-soft text-pen-strong';
      case 'void':
        return 'bg-sheet-2 text-ink-3 line-through';
      default:
        return 'border border-rule-strong text-ink-2';
    }
  });
}
