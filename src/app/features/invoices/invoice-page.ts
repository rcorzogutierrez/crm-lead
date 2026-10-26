import { Component, Injector, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideBan, LucidePrinter, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { CompanyService } from '../../core/company.service';
import { centsLabel, dateLabel, qtyLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { invoiceBalance, invoiceLabel, payState } from '../../core/invoice-math';
import { Invoice, InvoicesService } from '../../core/invoices.service';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { InvoicePayments } from '../../shared/invoice-payments';

/**
 * Factura lista para imprimir o guardar en PDF (el diálogo de impresión del navegador).
 * En pantalla lleva una barra con volver, imprimir y, para el admin, anular.
 */
@Component({
  selector: 'app-invoice-page',
  imports: [RouterLink, EmptyState, InvoicePayments, LucideArrowLeft, LucidePrinter, LucideBan, LucideTrash2],
  templateUrl: './invoice-page.html',
})
export class InvoicePage {
  protected readonly auth = inject(AuthService);
  protected readonly companies = inject(CompanyService);
  private readonly invoices = inject(InvoicesService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(Clock);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  readonly id = input.required<string>();

  protected readonly t = t;
  protected readonly cents = centsLabel;
  protected readonly qty = qtyLabel;
  protected readonly date = dateLabel;

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly voiding = signal(false);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  /** Confirmación en línea para borrar una factura anulada (solo admin). */
  protected readonly removing = signal(false);

  protected readonly number = computed(() => {
    const inv = this.invoice();
    return inv ? invoiceLabel(inv) : '';
  });
  protected readonly issuerName = computed(() => {
    const i = this.invoice()?.issuer;
    return i ? i.tradeName || i.legalName : '';
  });
  protected readonly state = computed(() => {
    const inv = this.invoice();
    return inv ? payState(inv, this.clock.now()) : 'issued';
  });
  protected readonly balance = computed(() => {
    const inv = this.invoice();
    return inv ? invoiceBalance(inv) : 0;
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

  protected askRemove(): void {
    this.removing.set(true);
    afterNextRender(() => document.getElementById('inv-delete-q')?.focus(), { injector: this.injector });
  }

  protected cancelRemove(): void {
    this.removing.set(false);
    afterNextRender(() => document.getElementById('inv-delete')?.focus(), { injector: this.injector });
  }

  protected async remove(inv: Invoice): Promise<void> {
    this.saving.set(true);
    try {
      await this.invoices.remove(inv);
      this.toast.show(t('invoice.deleted', { n: invoiceLabel(inv) }));
      void this.router.navigate(['/leads', inv.leadId]);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
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
