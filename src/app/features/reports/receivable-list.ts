import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { centsLabel, dateLabel } from '../../core/dates';
import { t } from '../../core/i18n/i18n';
import { PayState, invoiceLabel } from '../../core/invoice-math';
import { Invoice } from '../../core/invoices.service';
import { MembersService } from '../../core/members.service';
import { PayStateChip } from '../../shared/pay-state-chip';

/** Facturas con saldo: estado, cliente y número, saldo a la derecha. Vencidas primero. */
@Component({
  selector: 'app-receivable-list',
  imports: [RouterLink, PayStateChip],
  template: `
    <ul>
      @for (r of rows().slice(0, limit()); track r.inv.id) {
        <li
          class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-rule py-2 text-sm last:border-b-0 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
        >
          <span class="col-span-2 sm:col-span-1"><app-pay-state-chip [state]="r.state" /></span>
          <span class="min-w-0">
            <a
              [routerLink]="['/invoices', r.inv.id]"
              class="font-semibold text-ink hover:text-pen"
              >{{ r.inv.billTo.name }}</a
            >
            <span class="text-ink-2 tabular"> · {{ meta(r.inv) }}</span>
          </span>
          <span
            class="font-bold whitespace-nowrap tabular"
            [class.text-ribbon]="r.state === 'overdue'"
            >{{ cents(r.balance) }}</span
          >
        </li>
      }
    </ul>
    @if (rows().length > limit()) {
      <p class="mt-2 text-sm text-ink-2">{{ t('report.more', { n: rows().length - limit() }) }}</p>
    }
  `,
})
export class ReceivableList {
  private readonly members = inject(MembersService);

  readonly rows = input.required<{ inv: Invoice; balance: number; state: PayState }[]>();
  readonly limit = input(8);
  /** En el informe del equipo se dice de quién es cada factura. */
  readonly showOwner = input(false);

  protected readonly t = t;
  protected readonly cents = centsLabel;

  protected meta(inv: Invoice): string {
    const parts = [invoiceLabel(inv)];
    if (inv.dueAt) parts.push(t('pay.dueOn', { date: dateLabel(inv.dueAt) }));
    if (this.showOwner()) parts.push(this.members.name(inv.assigneeId));
    return parts.join(' · ');
  }
}
