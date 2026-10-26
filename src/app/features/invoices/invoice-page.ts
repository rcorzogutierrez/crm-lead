import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideBan, LucidePrinter } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { CompanyService } from '../../core/company.service';
import { centsLabel, dateLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { invoiceLabel } from '../../core/invoice-math';
import { Invoice, InvoicesService } from '../../core/invoices.service';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';

/**
 * Factura lista para imprimir o guardar en PDF (el diálogo de impresión del navegador).
 * En pantalla lleva una barra con volver, imprimir y, para el admin, anular.
 */
@Component({
  selector: 'app-invoice-page',
  imports: [RouterLink, EmptyState, LucideArrowLeft, LucidePrinter, LucideBan],
  templateUrl: './invoice-page.html',
})
export class InvoicePage {
  protected readonly auth = inject(AuthService);
  protected readonly companies = inject(CompanyService);
  private readonly invoices = inject(InvoicesService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly t = t;
  protected readonly cents = centsLabel;
  protected readonly date = dateLabel;

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly voiding = signal(false);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);

  protected readonly number = computed(() => {
    const inv = this.invoice();
    return inv ? invoiceLabel(inv) : '';
  });
  protected readonly issuerName = computed(() => {
    const i = this.invoice()?.issuer;
    return i ? i.tradeName || i.legalName : '';
  });
  /** La base imponible solo se muestra si no es todo el subtotal. */
  protected readonly partialTax = computed(() => {
    const inv = this.invoice();
    return !!inv && inv.taxable !== inv.subtotal;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.error.set(null);
      const stop = this.invoices.watch(
        id,
        (inv) => {
          this.invoice.set(inv);
          this.loading.set(false);
        },
        (err) => {
          this.error.set(firestoreErrorMessage(err));
          this.loading.set(false);
        },
      );
      onCleanup(stop);
    });
  }

  protected print(): void {
    window.print();
  }

  protected async confirmVoid(event: Event): Promise<void> {
    event.preventDefault();
    const inv = this.invoice();
    const reason = this.reason().trim();
    if (!inv || !reason || this.saving()) return;
    this.saving.set(true);
    try {
      await this.invoices.void(inv, reason);
      this.voiding.set(false);
      this.toast.show(t('invoice.voided', { n: invoiceLabel(inv) }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
