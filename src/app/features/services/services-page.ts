import { Component, Injector, afterNextRender, computed, inject, linkedSignal, signal } from '@angular/core';
import { dealLines } from '../../core/deal-lines';
import { NgTemplateOutlet } from '@angular/common';
import { FormField, form, min, required, submit } from '@angular/forms/signals';
import { LucideHandshake, LucideLayers, LucideLock, LucidePackage, LucidePlus, LucideSearch } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { normalizeText } from '../../core/contacts.service';
import { CatalogService } from '../../core/catalog.service';
import { unitPriceLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import type { I18nKey } from '../../core/i18n/es';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { mediaQuery } from '../../core/media';
import { ITEM_KINDS, ItemKind, ServiceItem, ServiceItemDraft, TIERS, TierRates, isClosed, kindLabel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { SETTINGS_TABS, SectionTabs } from '../../shared/section-tabs';


function emptyDraft(kind: ItemKind = 'service'): ServiceItemDraft {
  return { kind, name: '', description: '', price: 0, unit: '', active: true, taxable: true };
}

/** Clave del texto de ejemplo y de las unidades sugeridas de cada tipo. */
const UNIT_KEYS: Record<ItemKind, { placeholder: I18nKey; units: I18nKey }> = {
  service: { placeholder: 'svc.unitPlaceholder', units: 'svc.units.service' },
  product: { placeholder: 'svc.unitPlaceholder.product', units: 'svc.units.product' },
  material: { placeholder: 'svc.unitPlaceholder.material', units: 'svc.units.material' },
};

/**
 * Catálogo (servicios, productos y materiales; sin control de stock) con su precio oficial y los porcentajes de cada categoría.
 * Lo ve todo el equipo; solo un admin crea, edita o archiva.
 */
@Component({
  selector: 'app-services-page',
  imports: [FormField, NgTemplateOutlet, EmptyState, SectionTabs, LucidePlus, LucideSearch, LucideLock, LucideHandshake, LucidePackage, LucideLayers],
  templateUrl: './services-page.html',
})
export class ServicesPage {
  protected readonly auth = inject(AuthService);
  protected readonly catalog = inject(CatalogService);
  private readonly leads = inject(LeadsService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);

  protected readonly t = t;
  protected readonly settingsTabs = SETTINGS_TABS;
  protected readonly tiers = TIERS;
  protected readonly kinds = ITEM_KINDS;
  protected readonly kindLabel = kindLabel;

  /** Móvil: lista apilada en lugar de la tabla de siete columnas (mismo corte `md` que Clientes). */
  protected readonly narrow = mediaQuery('(max-width: 767.98px)');

  protected readonly search = signal('');
  protected readonly kind = signal<ItemKind | 'all'>('all');
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
      if (l.stage === 'lost') continue;
      for (const { serviceId } of dealLines(l)) {
        const s = map.get(serviceId) ?? { open: 0, won: 0 };
        if (l.stage === 'won') s.won++;
        else if (!isClosed(l.stage)) s.open++;
        map.set(serviceId, s);
      }
    }
    return map;
  });

  protected readonly rows = computed(() => {
    const q = normalizeText(this.search().trim());
    return this.catalog
      .services()
      .filter((s) => this.kind() === 'all' || s.kind === this.kind())
      .filter((s) => !q || normalizeText(`${s.name} ${s.description} ${s.unit}`).includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active))
      .map((s) => ({ ...s, ...(this.stats().get(s.id) ?? { open: 0, won: 0 }) }));
  });

  protected readonly counts = computed(() => {
    const all = this.catalog.services();
    return { active: all.filter((s) => s.active).length, archived: all.filter((s) => !s.active).length };
  });

  /** Cuántos hay de cada tipo (para el filtro). */
  protected readonly kindCounts = computed(() => {
    const out: Record<ItemKind, number> = { service: 0, product: 0, material: 0 };
    for (const s of this.catalog.services()) out[s.kind]++;
    return out;
  });

  /** Unidades sugeridas para el tipo que se está editando. */
  protected readonly unitOptions = computed(() => t(UNIT_KEYS[this.model().kind].units).split(','));
  protected readonly unitPlaceholder = computed(() => t(UNIT_KEYS[this.model().kind].placeholder));

  protected setKind(kind: ItemKind): void {
    this.model.update((m) => ({ ...m, kind }));
  }

  /** Servicio archivado que el admin está por borrar (confirmación en línea). */
  protected readonly deletingId = signal<string | null>(null);
  protected readonly deleting = signal(false);

  protected askDelete(s: ServiceItem): void {
    this.deletingId.set(s.id);
    this.focusLater('svc-del-q-' + s.id);
  }

  protected cancelDelete(s: ServiceItem): void {
    this.deletingId.set(null);
    this.focusLater('svc-del-' + s.id);
  }

  protected async remove(s: ServiceItem): Promise<void> {
    this.deleting.set(true);
    try {
      await this.catalog.remove(s);
      this.deletingId.set(null);
      this.toast.show(t('svc.deleted', { name: s.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.deleting.set(false);
    }
  }

  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  protected startNew(): void {
    // Con un tipo filtrado, lo nuevo es de ese tipo.
    const k = this.kind();
    this.model.set(emptyDraft(k === 'all' ? 'service' : k));
    this.f().reset();
    this.editing.set('');
  }

  protected startEdit(s: ServiceItem): void {
    this.model.set({ kind: s.kind, name: s.name, description: s.description, price: s.price, unit: s.unit, active: s.active, taxable: s.taxable });
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
            const affected = this.leads.open().filter((l) => dealLines(l).some((x) => x.serviceId === id)).length;
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
    return s.unit ? `${unitPriceLabel(s.price)} / ${s.unit}` : unitPriceLabel(s.price);
  }
}
