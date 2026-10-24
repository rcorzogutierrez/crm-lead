import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormField, form, min, required, submit } from '@angular/forms/signals';
import { LucideLock, LucidePlus, LucideSearch } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { moneyLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { mediaQuery } from '../../core/media';
import { ServiceItem, ServiceItemDraft, TIERS, TierRates, isClosed } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function emptyDraft(): ServiceItemDraft {
  return { name: '', description: '', price: 0, unit: '', active: true };
}

/**
 * Catálogo de servicios con su precio oficial y los porcentajes de cada categoría.
 * Lo ve todo el equipo; solo un admin crea, edita o archiva.
 */
@Component({
  selector: 'app-services-page',
  imports: [FormField, NgTemplateOutlet, EmptyState, LucidePlus, LucideSearch, LucideLock],
  templateUrl: './services-page.html',
})
export class ServicesPage {
  protected readonly auth = inject(AuthService);
  protected readonly catalog = inject(CatalogService);
  private readonly leads = inject(LeadsService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly money = moneyLabel;
  protected readonly tiers = TIERS;

  /** Móvil: lista apilada en lugar de la tabla de siete columnas (mismo corte `md` que Clientes). */
  protected readonly narrow = mediaQuery('(max-width: 767.98px)');

  protected readonly search = signal('');
  /** null = cerrado; '' = servicio nuevo; id = editando ese servicio. */
  protected readonly editing = signal<string | null>(null);

  protected readonly model = signal<ServiceItemDraft>(emptyDraft());
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'svc.nameRequired' });
    min(p.price, 0, { message: 'form.valueNegative' });
  });

  /** Borrador de porcentajes; se reinicia si cambian en el servidor. */
  protected readonly rates = linkedSignal<TierRates>(() => ({ ...this.catalog.rates() }));
  protected readonly ratesDirty = computed(() => {
    const a = this.rates();
    const b = this.catalog.rates();
    return a.bronze !== b.bronze || a.silver !== b.silver || a.gold !== b.gold;
  });

  /** Leads abiertos y ganados por servicio. */
  private readonly stats = computed(() => {
    const map = new Map<string, { open: number; won: number }>();
    for (const l of this.leads.leads()) {
      if (!l.serviceId || l.stage === 'lost') continue;
      const s = map.get(l.serviceId) ?? { open: 0, won: 0 };
      if (l.stage === 'won') s.won++;
      else if (!isClosed(l.stage)) s.open++;
      map.set(l.serviceId, s);
    }
    return map;
  });

  protected readonly rows = computed(() => {
    const q = normalize(this.search().trim());
    return this.catalog
      .services()
      .filter((s) => !q || normalize(`${s.name} ${s.description}`).includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active))
      .map((s) => ({ ...s, ...(this.stats().get(s.id) ?? { open: 0, won: 0 }) }));
  });

  protected readonly counts = computed(() => {
    const all = this.catalog.services();
    return { active: all.filter((s) => s.active).length, archived: all.filter((s) => !s.active).length };
  });

  protected startNew(): void {
    this.model.set(emptyDraft());
    this.f().reset();
    this.editing.set('');
  }

  protected startEdit(s: ServiceItem): void {
    this.model.set({ name: s.name, description: s.description, price: s.price, unit: s.unit, active: s.active });
    this.f().reset();
    this.editing.set(s.id);
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.editing();
    await submit(this.f, async () => {
      try {
        const draft = { ...this.model(), price: Number(this.model().price) || 0 };
        if (id) {
          const before = this.catalog.byId().get(id);
          await this.catalog.update(id, draft);
          if (before && before.price !== draft.price) {
            const affected = this.leads.open().filter((l) => l.serviceId === id).length;
            this.toast.show(affected ? t('svc.priceChanged', { n: affected }) : t('svc.saved'));
          } else {
            this.toast.show(t('svc.saved'));
          }
        } else {
          await this.catalog.create(draft);
          this.toast.show(t('svc.created', { name: draft.name }));
        }
        this.editing.set(null);
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  protected async setActive(s: ServiceItem, active: boolean): Promise<void> {
    try {
      await this.catalog.update(s.id, { active });
      this.toast.show(active ? t('svc.restored', { name: s.name }) : t('svc.archived', { name: s.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected setRate(tier: keyof TierRates, value: string): void {
    const n = Number(value);
    this.rates.update((r) => ({ ...r, [tier]: Number.isFinite(n) ? n : r[tier] }));
  }

  protected async saveRates(event: Event): Promise<void> {
    event.preventDefault();
    const r = this.rates();
    if (Object.values(r).some((v) => v < 0 || v > 100)) {
      this.toast.error(t('svc.rateInvalid'));
      return;
    }
    try {
      await this.catalog.saveRates(r);
      this.toast.show(t('svc.ratesSaved'));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected resetRates(): void {
    this.rates.set({ ...this.catalog.rates() });
  }

  protected priceLabel(s: ServiceItem): string {
    return s.unit ? `${moneyLabel(s.price)} / ${s.unit}` : moneyLabel(s.price);
  }
}
