import { Component, computed, inject, input, model } from '@angular/core';
import { CatalogService } from '../core/catalog.service';
import { moneyLabel } from '../core/dates';
import { t } from '../core/i18n/i18n';
import { PriceTier, TIERS, salePrice } from '../core/models';

/**
 * Categoría de venta (bronce/plata/oro) con el precio final ya calculado.
 * El precio oficial no se edita: solo se elige cuánto se suma encima.
 */
@Component({
  selector: 'app-tier-picker',
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-3 gap-2" role="radiogroup" [attr.aria-label]="t('tier.label')">
      @for (o of options(); track o.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === o.id"
          [disabled]="disabled()"
          (click)="value.set(o.id)"
          class="flex min-h-14 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors duration-150 disabled:opacity-60"
          [class]="value() === o.id ? 'border-2 border-pen bg-pen-soft' : 'border-rule-strong bg-sheet hover:border-ink-3'"
        >
          <span class="text-sm font-bold">{{ o.label }} · +{{ o.pct }} %</span>
          <span class="text-[0.8125rem] text-ink-2 tabular">{{ o.price }}</span>
        </button>
      }
    </div>
  `,
})
export class TierPicker {
  private readonly catalog = inject(CatalogService);

  readonly unitPrice = input.required<number>();
  readonly quantity = input(1);
  /** Porcentajes a mostrar; por defecto los vigentes del catálogo. */
  readonly rates = input<Record<PriceTier, number> | null>(null);
  readonly disabled = input(false);
  readonly value = model<PriceTier>('bronze');

  protected readonly t = t;
  protected readonly options = computed(() => {
    const rates = this.rates() ?? this.catalog.rates();
    return TIERS.map((tier) => ({
      id: tier.id,
      label: tier.label,
      pct: rates[tier.id],
      price: moneyLabel(salePrice(this.unitPrice(), this.quantity(), rates[tier.id])),
    }));
  });
}
