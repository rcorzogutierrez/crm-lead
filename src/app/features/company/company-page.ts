import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormField, email, form, max, maxLength, min, required, submit } from '@angular/forms/signals';
import { LucideImageUp, LucideLock, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { Company, CompanyService, LOGO_MAX_CHARS, shrinkLogo } from '../../core/company.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { intlLocale, t } from '../../core/i18n/i18n';
import { invoiceLabel } from '../../core/invoice-math';
import { InvoicesService } from '../../core/invoices.service';
import { ToastService } from '../../core/toast.service';
import { US_STATES } from '../../core/us-states';
import { SETTINGS_TABS, SectionTabs } from '../../shared/section-tabs';

/**
 * Ajustes → Empresa: los datos que salen en cada factura, el logo, el % de impuesto de venta
 * y la numeración. Lo ve todo el equipo (el vendedor también factura); solo un admin lo cambia.
 */
@Component({
  selector: 'app-company-page',
  imports: [FormField, SectionTabs, LucideImageUp, LucideTrash2, LucideLock],
  templateUrl: './company-page.html',
})
export class CompanyPage {
  protected readonly auth = inject(AuthService);
  protected readonly companies = inject(CompanyService);
  private readonly invoices = inject(InvoicesService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly settingsTabs = SETTINGS_TABS;
  protected readonly states = US_STATES;

  /** Borrador; se reinicia cuando llegan datos nuevos del servidor. */
  protected readonly model = linkedSignal<Company>(() => ({ ...this.companies.company() }));
  protected readonly f = form(this.model, (p) => {
    required(p.legalName, { message: 'company.legalNameRequired' });
    email(p.email, { message: 'form.emailInvalid' });
    min(p.taxRate, 0, { message: 'company.taxRateRange' });
    max(p.taxRate, 30, { message: 'company.taxRateRange' });
    maxLength(p.invoicePrefix, 12, { message: 'company.prefixLong' });
  });

  /** Próximo número de factura (aparte: vive en `meta/invoiceSeq`). Nunca baja. */
  protected readonly invoicesNext = computed(() => this.invoices.nextNumber() ?? 1);
  protected readonly next = linkedSignal(() => this.invoicesNext());
  protected readonly nextInvalid = computed(() => {
    const n = Number(this.next());
    return !Number.isInteger(n) || n < this.invoicesNext();
  });

  protected readonly dirty = computed(() => {
    const a = this.model();
    const b = this.companies.company();
    const changed = (Object.keys(b) as (keyof Company)[]).some((k) => String(a[k]) !== String(b[k]));
    return changed || Number(this.next()) !== this.invoicesNext();
  });

  protected readonly months = computed(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(), { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => {
      const name = fmt.format(new Date(2026, i, 1));
      return { value: i + 1, label: name.charAt(0).toUpperCase() + name.slice(1) };
    });
  });

  /** Así se verá el número de la próxima factura. */
  protected readonly sample = computed(() =>
    invoiceLabel({ prefix: this.model().invoicePrefix.trim(), number: Math.max(1, Math.floor(Number(this.next()) || 1)) }),
  );

  protected readonly logoBusy = signal(false);

  protected setField<K extends 'state' | 'fiscalYearStart'>(key: K, value: string): void {
    this.model.update((m) => ({ ...m, [key]: key === 'fiscalYearStart' ? Number(value) : value }));
  }

  protected async pickLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoBusy.set(true);
    try {
      const logo = await shrinkLogo(file);
      if (logo.length > LOGO_MAX_CHARS) {
        this.toast.error(t('company.logoTooBig'));
        return;
      }
      this.model.update((m) => ({ ...m, logo }));
    } catch {
      this.toast.error(t('company.logoUnreadable'));
    } finally {
      this.logoBusy.set(false);
    }
  }

  protected removeLogo(): void {
    this.model.update((m) => ({ ...m, logo: '' }));
  }

  protected discard(): void {
    this.model.set({ ...this.companies.company() });
    this.next.set(this.invoicesNext());
    this.f().reset();
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.nextInvalid()) {
      this.toast.error(t('company.nextInvalid', { n: this.invoicesNext() }));
      return;
    }
    await submit(this.f, async () => {
      try {
        const draft = { ...this.model(), taxRate: Number(this.model().taxRate) || 0 };
        await this.companies.save(draft);
        const next = Number(this.next());
        if (next !== this.invoicesNext()) await this.invoices.setNextNumber(next);
        this.f().reset();
        this.toast.show(t('company.saved'));
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }
}
