import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideFileText } from '@lucide/angular';
import { AuthService } from '../core/auth.service';
import { CompanyService } from '../core/company.service';
import { centsLabel, dateLabel } from '../core/dates';
import { firestoreErrorMessage } from '../core/firestore-utils';
import { t } from '../core/i18n/i18n';
import { invoiceLabel } from '../core/invoice-math';
import { Invoice, InvoicesService } from '../core/invoices.service';
import { Lead } from '../core/models';
import { ToastService } from '../core/toast.service';
import { InvoicePayments } from './invoice-payments';

/**
 * Factura de una venta ganada, en la ficha del negocio. Si no tiene, el responsable (o un
 * admin) la emite aquí mismo: vista previa con el impuesto aparte y unos pocos datos más.
 */
@Component({
  selector: 'app-deal-invoice',
  host: { class: 'block' },
  imports: [RouterLink, LucideFileText, InvoicePayments],
  template: `
    <section aria-labelledby="inv-title">
      <h2 id="inv-title" class="text-sm font-bold">{{ t('invoice.section') }}</h2>
      <div class="sheet mt-2 p-4">
        @if (lead().invoiceId) {
          @if (invoice(); as inv) {
            <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
              <svg lucideFileText [size]="20" class="shrink-0 text-ink-3" aria-hidden="true"></svg>
              <div class="min-w-0 flex-1">
                <p class="font-semibold tabular">{{ label(inv) }}</p>
                <p class="text-[0.8125rem] text-ink-2 tabular">
                  {{ t('invoice.issuedOn', { date: date(inv.issuedAt) }) }}
                </p>
              </div>
              <a class="btn-secondary btn-sm" [routerLink]="['/invoices', inv.id]">{{ t('invoice.open') }}</a>
            </div>
            <app-invoice-payments class="mt-4 border-t border-rule pt-3" [invoice]="inv" />
          } @else if (loadError()) {
            <p class="text-sm text-ribbon" role="alert">{{ loadError() }}</p>
          } @else {
            <div class="h-10 animate-pulse rounded bg-sheet-2" aria-hidden="true"></div>
          }
        } @else if (!canIssue()) {
          <p class="text-sm text-ink-2">{{ t('invoice.notYours') }}</p>
        } @else if (!companies.ready()) {
          <p class="text-sm text-ink-2">{{ auth.isAdmin() ? t('invoice.needCompanyAdmin') : t('invoice.needCompany') }}</p>
          @if (auth.isAdmin()) {
            <a class="btn-secondary btn-sm mt-3" routerLink="/company">{{ t('invoice.goCompany') }}</a>
          }
        } @else if (!issuing()) {
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-ink-2">{{ t('invoice.none') }}</p>
            <button type="button" class="btn-primary btn-sm" [attr.aria-expanded]="false" (click)="issuing.set(true)">
              <svg lucideFileText [size]="16"></svg>
              {{ t('invoice.issue') }}
            </button>
          </div>
        } @else {
          @let p = preview();
          <form class="space-y-4" novalidate (submit)="issue($event)" [attr.aria-label]="t('invoice.issue')">
            <table class="w-full text-sm">
              <caption class="sr-only">{{ t('invoice.preview') }}</caption>
              <thead class="border-b border-rule text-left text-xs font-semibold text-ink-2">
                <tr>
                  <th scope="col" class="pb-1.5">{{ t('invoice.description') }}</th>
                  <th scope="col" class="pb-1.5 text-right">{{ t('invoice.amount') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-rule">
                @for (l of p.lines; track $index) {
                  <tr>
                    <td class="py-2 pr-3">
                      {{ l.name }}@if (l.quantity > 1) { <span class="text-ink-2 tabular"> × {{ l.quantity }}</span> }
                      @if (!l.taxable) { <span class="block text-xs text-ink-3">{{ t('invoice.noTax') }}</span> }
                    </td>
                    <td class="py-2 text-right tabular">{{ cents(l.amount) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot class="border-t border-rule-strong tabular">
                <tr>
                  <th scope="row" class="pt-2 text-left font-normal text-ink-2">{{ t('invoice.subtotal') }}</th>
                  <td class="pt-2 text-right">{{ cents(p.subtotal) }}</td>
                </tr>
                <tr>
                  <th scope="row" class="text-left font-normal text-ink-2">{{ t('invoice.taxLine', { rate: p.taxRate }) }}</th>
                  <td class="text-right">{{ cents(p.tax) }}</td>
                </tr>
                <tr>
                  <th scope="row" class="pt-1 text-left font-bold">{{ t('invoice.total') }}</th>
                  <td class="pt-1 text-right text-base font-bold">{{ cents(p.total) }}</td>
                </tr>
              </tfoot>
            </table>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="field-label" for="inv-address">{{ t('invoice.billAddress') }}</label>
                <textarea id="inv-address" class="input" rows="3" autocomplete="street-address" [placeholder]="t('common.optional')" [value]="address()" (input)="address.set($any($event.target).value)"></textarea>
              </div>
              <div class="space-y-3">
                <div>
                  <label class="field-label" for="inv-due">{{ t('invoice.dueDate') }}</label>
                  <input id="inv-due" class="input tabular" type="date" [value]="due()" (input)="due.set($any($event.target).value)" />
                </div>
                <div>
                  <label class="field-label" for="inv-notes">{{ t('invoice.notes') }}</label>
                  <input id="inv-notes" class="input" autocomplete="off" maxlength="2000" [placeholder]="t('common.optional')" [value]="notes()" (input)="notes.set($any($event.target).value)" />
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
              <p class="max-w-[46ch] text-xs text-ink-3">{{ t('invoice.issueHint', { n: nextLabel() }) }}</p>
              <div class="ml-auto flex gap-2">
                <button type="button" class="btn-ghost btn-sm" (click)="issuing.set(false)">{{ t('common.cancel') }}</button>
                <button type="submit" class="btn-primary btn-sm" [disabled]="saving()">{{ t('invoice.issueNow') }}</button>
              </div>
            </div>
          </form>
        }
      </div>
    </section>
  `,
})
export class DealInvoice {
  protected readonly auth = inject(AuthService);
  protected readonly companies = inject(CompanyService);
  private readonly invoices = inject(InvoicesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly lead = input.required<Lead>();

  protected readonly t = t;
  protected readonly cents = centsLabel;
  protected readonly date = dateLabel;
  protected readonly label = invoiceLabel;

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly issuing = signal(false);
  protected readonly saving = signal(false);
  protected readonly address = signal('');
  protected readonly due = signal('');
  protected readonly notes = signal('');

  /** Factura el responsable de la venta o un admin (igual que las reglas). */
  protected readonly canIssue = computed(() => this.auth.isAdmin() || this.lead().assigneeId === this.auth.uid());
  protected readonly preview = computed(() => this.invoices.preview(this.lead()));
  protected readonly nextLabel = computed(() =>
    invoiceLabel({ prefix: this.companies.company().invoicePrefix, number: this.invoices.nextNumber() ?? 1 }),
  );

  constructor() {
    effect((onCleanup) => {
      const id = this.lead().invoiceId;
      this.invoice.set(null);
      this.loadError.set(null);
      if (!id) return;
      const stop = this.invoices.watch(
        id,
        (inv) => this.invoice.set(inv),
        (err) => this.loadError.set(firestoreErrorMessage(err)),
      );
      onCleanup(stop);
    });
  }

  protected async issue(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    this.saving.set(true);
    try {
      // La fecha del input es local; a mediodía para que no cambie de día con la zona horaria.
      const due = this.due() ? new Date(`${this.due()}T12:00:00`) : null;
      const id = await this.invoices.issue(this.lead(), { address: this.address(), notes: this.notes(), dueAt: due });
      this.issuing.set(false);
      this.toast.show(t('invoice.issued'));
      void this.router.navigate(['/invoices', id]);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
