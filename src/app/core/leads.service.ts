import { Service, computed, inject } from '@angular/core';
import {
  DocumentData,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { ContactDraft, Lead, LeadDraft, LeadPricing, LeadSource, PriceTier, Stage, isClosed, stageMeta } from './models';
import { teamQuery } from './team-query';

function mapLead(id: string, d: DocumentData): Lead {
  return {
    id,
    name: d['name'] ?? '',
    company: d['company'] ?? '',
    email: d['email'] ?? '',
    phone: d['phone'] ?? '',
    source: d['source'] ?? 'other',
    stage: d['stage'] ?? 'new',
    value: Number(d['value'] ?? 0),
    assigneeId: d['assigneeId'] ?? '',
    notes: d['notes'] ?? '',
    lostReason: d['lostReason'] ?? '',
    nextFollowUpAt: toDate(d['nextFollowUpAt']),
    lastContactAt: toDate(d['lastContactAt']),
    createdBy: d['createdBy'] ?? '',
    createdAt: toDate(d['createdAt']),
    updatedAt: toDate(d['updatedAt']),
    contactId: d['contactId'] ?? null,
    serviceId: d['serviceId'] ?? null,
    serviceName: d['serviceName'] ?? '',
    detail: d['detail'] ?? '',
    quantity: Number(d['quantity'] ?? 1),
    unitPrice: Number(d['unitPrice'] ?? 0),
    tier: (d['tier'] as PriceTier) ?? 'bronze',
    tierPct: Number(d['tierPct'] ?? 0),
    priceAck: typeof d['priceAck'] === 'number' ? d['priceAck'] : null,
    wonAt: toDate(d['wonAt']),
  };
}

export interface NewLead {
  /** Contacto existente; si es null se crea uno con `contact`. */
  contactId: string | null;
  contact: ContactDraft;
  source: LeadSource;
  stage: Stage;
  assigneeId: string;
  notes: string;
  detail: string;
  /** null = sin servicio del catálogo (valor 0). */
  pricing: LeadPricing | null;
}

/** Cambio de precio de un lead abierto; `note` queda en el historial. */
export type PricingPatch = Omit<LeadPricing, 'serviceName'> & { serviceName: string; note: string };

/** Leads del equipo, en vivo. Un equipo pequeño cabe completo en memoria. */
@Service()
export class LeadsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly live = teamQuery(
    () => query(collection(this.db, 'leads'), orderBy('createdAt', 'desc')),
    mapLead,
  );

  readonly leads = this.live.data;
  readonly loading = this.live.loading;
  readonly error = this.live.error;

  readonly byId = computed(() => new Map(this.leads().map((l) => [l.id, l])));
  readonly open = computed(() => this.leads().filter((l) => !isClosed(l.stage)));
  /** Leads activos sin ningún follow-up programado: el error que este CRM no perdona. */
  readonly withoutNextStep = computed(() => this.open().filter((l) => !l.nextFollowUpAt));

  /**
   * Crea el lead (y el contacto si es nuevo) en un solo batch, con su actividad de alta.
   * Devuelve el id del lead.
   */
  async create(input: NewLead): Promise<{ leadId: string; contactId: string }> {
    const uid = this.auth.uid();
    const assigneeId = input.assigneeId || uid;
    const c = clean(input.contact);
    const batch = writeBatch(this.db);

    let contactId = input.contactId;
    if (!contactId) {
      const ref = doc(collection(this.db, 'contacts'));
      contactId = ref.id;
      batch.set(ref, {
        name: c.name,
        company: c.company,
        email: c.email.toLowerCase(),
        phone: c.phone,
        assigneeId: c.assigneeId || assigneeId,
        notes: c.notes,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const p = input.pricing;
    const leadRef = doc(collection(this.db, 'leads'));
    batch.set(leadRef, {
      name: c.name,
      company: c.company,
      email: c.email.toLowerCase(),
      phone: c.phone,
      source: input.source,
      stage: input.stage,
      assigneeId,
      notes: input.notes.trim(),
      detail: input.detail.trim(),
      contactId,
      serviceId: p?.serviceId ?? null,
      serviceName: p?.serviceName ?? '',
      quantity: p?.quantity ?? 1,
      unitPrice: p?.unitPrice ?? 0,
      tier: p?.tier ?? 'bronze',
      tierPct: p?.tierPct ?? 0,
      value: p?.value ?? 0,
      priceAck: null,
      lostReason: '',
      nextFollowUpAt: null,
      lastContactAt: null,
      wonAt: input.stage === 'won' ? serverTimestamp() : null,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(this.db, 'leads', leadRef.id, 'activities')), {
      type: 'created',
      body: p?.serviceName ?? '',
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { leadId: leadRef.id, contactId };
  }

  /** Cambia servicio, cantidad o categoría de un lead abierto y lo anota en el historial. */
  async updatePricing(lead: Lead, patch: PricingPatch): Promise<void> {
    const { note, ...pricing } = patch;
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'leads', lead.id), { ...pricing, priceAck: null, updatedAt: serverTimestamp() });
    batch.set(doc(collection(this.db, 'leads', lead.id, 'activities')), {
      type: 'pricing',
      body: note,
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Mantiene el precio pactado aunque el oficial haya cambiado (no vuelve a avisar por ese precio). */
  keepPrice(lead: Lead, officialPrice: number): Promise<void> {
    return updateDoc(doc(this.db, 'leads', lead.id), { priceAck: officialPrice, updatedAt: serverTimestamp() });
  }

  update(id: string, patch: Partial<LeadDraft> & { lostReason?: string }): Promise<void> {
    return updateDoc(doc(this.db, 'leads', id), { ...clean(patch), updatedAt: serverTimestamp() });
  }

  /** Cambia de etapa y deja constancia en el historial. */
  async moveToStage(lead: Lead, to: Stage, lostReason = ''): Promise<void> {
    if (lead.stage === to) return;
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'leads', lead.id), {
      stage: to,
      lostReason: to === 'lost' ? lostReason : '',
      wonAt: to === 'won' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(this.db, 'leads', lead.id, 'activities')), {
      type: 'stage',
      from: lead.stage,
      to,
      body: to === 'lost' && lostReason ? lostReason : `${stageMeta(lead.stage).label} → ${stageMeta(to).label}`,
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Borra el lead con su historial y sus follow-ups. */
  async remove(id: string): Promise<void> {
    const [acts, fus] = await Promise.all([
      getDocs(collection(this.db, 'leads', id, 'activities')),
      getDocs(query(collection(this.db, 'followups'), where('leadId', '==', id))),
    ]);
    const batch = writeBatch(this.db);
    acts.forEach((d) => batch.delete(d.ref));
    fus.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await deleteDoc(doc(this.db, 'leads', id));
  }
}

function clean<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as T;
}
