import { Service, computed, effect, inject, signal } from '@angular/core';
import {
  DocumentData,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { DEFAULT_TIER_RATES, Lead, PriceTier, ServiceItem, ServiceItemDraft, TierRates, isClosed } from './models';
import { teamQuery } from './team-query';

function mapService(id: string, d: DocumentData): ServiceItem {
  return {
    id,
    name: d['name'] ?? '',
    description: d['description'] ?? '',
    price: Number(d['price'] ?? 0),
    unit: d['unit'] ?? '',
    active: d['active'] !== false,
  };
}

/**
 * Catálogo de servicios y porcentajes de cada categoría de venta.
 * Todo el equipo lo lee; solo un admin lo cambia (lo garantizan las reglas).
 */
@Service()
export class CatalogService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly live = teamQuery(() => query(collection(this.db, 'services'), orderBy('name')), mapService);

  readonly services = this.live.data;
  readonly loading = this.live.loading;
  readonly error = this.live.error;
  readonly active = computed(() => this.services().filter((s) => s.active));
  readonly byId = computed(() => new Map(this.services().map((s) => [s.id, s])));

  private readonly _rates = signal<TierRates>(DEFAULT_TIER_RATES);
  /** Porcentaje por categoría; los valores por defecto mientras no exista `meta/pricing`. */
  readonly rates = this._rates.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.auth.status() !== 'member') return;
      const stop = onSnapshot(
        doc(this.db, 'meta', 'pricing'),
        (snap) => {
          const d = snap.data() ?? {};
          this._rates.set({
            bronze: num(d['bronze'], DEFAULT_TIER_RATES.bronze),
            silver: num(d['silver'], DEFAULT_TIER_RATES.silver),
            gold: num(d['gold'], DEFAULT_TIER_RATES.gold),
          });
        },
        (err) => console.error(err),
      );
      onCleanup(stop);
    });
  }

  /** El precio oficial cambió desde que se cotizó este lead abierto y aún no se decidió qué hacer. */
  hasPriceChange(lead: Lead): boolean {
    if (!lead.serviceId || isClosed(lead.stage)) return false;
    const svc = this.byId().get(lead.serviceId);
    return !!svc && svc.price !== lead.unitPrice && svc.price !== lead.priceAck;
  }

  rate(tier: PriceTier): number {
    return this.rates()[tier];
  }

  async create(draft: ServiceItemDraft): Promise<string> {
    const ref = await addDoc(collection(this.db, 'services'), {
      ...clean(draft),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, patch: Partial<ServiceItemDraft>): Promise<void> {
    return updateDoc(doc(this.db, 'services', id), { ...clean(patch), updatedAt: serverTimestamp() });
  }

  saveRates(rates: TierRates): Promise<void> {
    return setDoc(doc(this.db, 'meta', 'pricing'), { ...rates, updatedAt: serverTimestamp() });
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clean<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out as T;
}
