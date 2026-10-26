import { Service, computed, inject } from '@angular/core';
import {
  DocumentData,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DealState, initialStats, statsPatch } from './contact-stats';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { t } from './i18n/i18n';
import { FollowUpsService } from './followups.service';
import { DealLine, dealServices, dealTitle } from './deal-lines';
import { CascadeCounts, DeletionsService, cascadeDetail } from './deletions.service';
import { ContactChannel, ContactDraft, Lead, LeadDraft, LeadPricing, LeadSource, LostCode, PriceTier, Stage, isClosed, lostReasonLabel, stageMeta } from './models';
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
    lostCode: d['lostCode'] ?? null,
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
    extras: Array.isArray(d['extras']) ? d['extras'].map(mapLine) : [],
    wonAt: toDate(d['wonAt']),
    lostAt: toDate(d['lostAt']),
    invoiceId: typeof d['invoiceId'] === 'string' ? d['invoiceId'] : null,
  };
}

function mapLine(x: DocumentData): DealLine {
  return {
    serviceId: x['serviceId'] ?? '',
    serviceName: x['serviceName'] ?? '',
    quantity: Number(x['quantity'] ?? 1),
    unitPrice: Number(x['unitPrice'] ?? 0),
    ack: typeof x['ack'] === 'number' ? x['ack'] : null,
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
  /** Primera próxima acción, guardada en el mismo batch para que el lead no nazca sin ella. */
  firstFollowUp?: { dueAt: Date; channel: ContactChannel; note: string } | null;
}

/** Cambio de precio de un lead abierto; `note` queda en el historial. */
export type PricingPatch = LeadPricing & { priceAck: number | null; note: string };

/**
 * Leads en vivo: un admin escucha todos; un vendedor solo los suyos (las reglas
 * no le dejan leer los demás). Un equipo pequeño cabe completo en memoria.
 */
@Service()
export class LeadsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly followUps = inject(FollowUpsService);
  private readonly deletions = inject(DeletionsService);
  private readonly live = teamQuery(
    () =>
      this.auth.isAdmin()
        ? query(collection(this.db, 'leads'), orderBy('createdAt', 'desc'))
        : query(collection(this.db, 'leads'), where('assigneeId', '==', this.auth.uid()), orderBy('createdAt', 'desc')),
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
   * Una venta ganada solo la reabre o la borra un admin, y con factura vigente nadie: antes
   * hay que anularla (las reglas también lo exigen).
   */
  locked(lead: Pick<Lead, 'stage' | 'invoiceId'>): boolean {
    return !!lead.invoiceId || (lead.stage === 'won' && !this.auth.isAdmin());
  }

  /** Por qué no se puede mover ni borrar (ver `locked`). */
  lockMessage(lead: Pick<Lead, 'invoiceId'>): string {
    return lead.invoiceId ? t('detail.invoiceLocked') : t('detail.wonLocked');
  }

  /**
   * Crea el lead (y el contacto si es nuevo) en un solo batch, con su actividad de alta
   * y su primer follow-up. Devuelve el id del lead y el del contacto.
   */
  async create(input: NewLead): Promise<{ leadId: string; contactId: string }> {
    const uid = this.auth.uid();
    // Un vendedor solo crea leads a su nombre; un admin puede asignarlo a otro.
    const assigneeId = (this.auth.isAdmin() && input.assigneeId) || uid;
    const c = clean(input.contact);
    const p = input.pricing;
    const next = input.firstFollowUp ?? null;
    const deal: DealState = { stage: input.stage, value: p?.value ?? 0, assigneeId };
    const batch = writeBatch(this.db);

    let contactId = input.contactId;
    if (contactId) {
      // Un negocio nuevo reactiva al contacto si estaba archivado.
      const patch = statsPatch(null, deal, await this.firstWonMissing(contactId, deal));
      batch.update(doc(this.db, 'contacts', contactId), { ...patch, archived: false, archivedAt: null });
    } else {
      const ref = doc(collection(this.db, 'contacts'));
      contactId = ref.id;
      batch.set(ref, {
        ...initialStats(deal),
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
      extras: p?.extras ?? [],
      value: p?.value ?? 0,
      priceAck: null,
      lostReason: '',
      lostCode: null,
      nextFollowUpAt: next ? Timestamp.fromDate(next.dueAt) : null,
      lastContactAt: null,
      wonAt: input.stage === 'won' ? serverTimestamp() : null,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(this.db, 'leads', leadRef.id, 'activities')), {
      type: 'created',
      body: p ? dealServices(p) : '',
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    if (next) {
      batch.set(doc(collection(this.db, 'followups')), {
        leadId: leadRef.id,
        leadName: c.name,
        company: c.company,
        assigneeId,
        dueAt: Timestamp.fromDate(next.dueAt),
        channel: next.channel,
        note: next.note.trim(),
        status: 'pending',
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return { leadId: leadRef.id, contactId };
  }

  /**
   * Cambia servicios, cantidades o categoría de un lead abierto (también aceptar un precio
   * oficial nuevo o mantener el pactado) y lo anota en el historial.
   */
  async updatePricing(lead: Lead, patch: PricingPatch): Promise<void> {
    const { note, ...pricing } = patch;
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'leads', lead.id), { ...pricing, updatedAt: serverTimestamp() });
    batch.set(doc(collection(this.db, 'leads', lead.id, 'activities')), {
      type: 'pricing',
      body: note,
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Datos del lead que no cambian de responsable (para eso, `reassign`). */
  update(id: string, patch: Partial<Omit<LeadDraft, 'assigneeId'>> & { lostReason?: string }): Promise<void> {
    return updateDoc(doc(this.db, 'leads', id), { ...clean(patch), updatedAt: serverTimestamp() });
  }

  /**
   * Solo admin: pasa el lead a otro vendedor junto con sus follow-ups pendientes,
   * para que el anterior deje de verlos y el nuevo los tenga en su agenda.
   */
  async reassign(lead: Lead, assigneeId: string, pendingFollowUpIds: string[]): Promise<void> {
    if (!assigneeId || lead.assigneeId === assigneeId) return;
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'leads', lead.id), { assigneeId, updatedAt: serverTimestamp() });
    // La factura vigente pasa con la venta, para que el nuevo responsable la vea.
    if (lead.invoiceId) batch.update(doc(this.db, 'invoices', lead.invoiceId), { assigneeId });
    for (const id of pendingFollowUpIds) batch.update(doc(this.db, 'followups', id), { assigneeId });
    this.patchContact(batch, lead, { ...lead, assigneeId }, false);
    await batch.commit();
  }

  /**
   * Cambia de etapa y deja constancia en el historial. Cerrar (ganado o perdido) cancela en el
   * mismo batch los follow-ups pendientes del lead: un negocio cerrado no vuelve a salir en Hoy.
   */
  async moveToStage(lead: Lead, to: Stage, lost: { code: LostCode | null; detail: string } | null = null): Promise<void> {
    if (lead.stage === to) return;
    if (this.locked(lead)) throw new Error(this.lockMessage(lead));
    const after: DealState = { ...lead, stage: to };
    const closing = isClosed(to) && !isClosed(lead.stage);
    const batch = writeBatch(this.db);
    this.patchContact(batch, lead, after, await this.firstWonMissing(lead.contactId, after));
    const isLost = to === 'lost';
    const detail = isLost ? (lost?.detail.trim() ?? '') : '';
    const code = isLost ? (lost?.code ?? null) : null;
    batch.update(doc(this.db, 'leads', lead.id), {
      stage: to,
      lostReason: detail,
      lostCode: code,
      wonAt: to === 'won' ? serverTimestamp() : null,
      lostAt: isLost ? serverTimestamp() : null,
      ...(closing ? { nextFollowUpAt: null } : {}),
      updatedAt: serverTimestamp(),
    });
    if (closing) {
      for (const fu of this.followUps.forLead(lead.id)) batch.update(doc(this.db, 'followups', fu.id), { status: 'cancelled' });
    }
    const reason = isLost ? lostReasonLabel({ lostCode: code, lostReason: detail }) : '';
    batch.set(doc(collection(this.db, 'leads', lead.id, 'activities')), {
      type: 'stage',
      from: lead.stage,
      to,
      body: reason || `${stageMeta(lead.stage).label} → ${stageMeta(to).label}`,
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /**
   * Borra el lead con su historial, sus follow-ups y (si borra un admin) sus facturas anuladas,
   * y lo anota en el registro de borrados. `fromContact` cuando se borra también el contacto:
   * no hace falta corregir su resumen y la entrada del registro es la del contacto.
   * Devuelve lo que se llevó.
   */
  async remove(lead: Lead, fromContact = false): Promise<CascadeCounts> {
    if (this.locked(lead)) throw new Error(this.lockMessage(lead));
    const id = lead.id;
    const admin = this.auth.isAdmin();
    // Un vendedor solo puede consultar sus follow-ups: la consulta debe decirlo.
    const fuQuery = admin
      ? query(collection(this.db, 'followups'), where('leadId', '==', id))
      : query(collection(this.db, 'followups'), where('leadId', '==', id), where('assigneeId', '==', this.auth.uid()));
    const [acts, fus, invs] = await Promise.all([
      getDocs(collection(this.db, 'leads', id, 'activities')),
      getDocs(fuQuery),
      // Las facturas solo las borra un admin, y solo anuladas (sin factura vigente, lo están todas).
      admin ? getDocs(query(collection(this.db, 'invoices'), where('leadId', '==', id))).then((s) => s.docs) : Promise.resolve([]),
    ]);
    const voided = invs.filter((d) => d.data()['status'] === 'void');
    const batch = writeBatch(this.db);
    acts.forEach((d) => batch.delete(d.ref));
    fus.forEach((d) => batch.delete(d.ref));
    // Cada factura anulada se lleva sus pagos (deshechos: una con pagos vigentes no se anula).
    const payments = await Promise.all(voided.map((d) => getDocs(collection(d.ref, 'payments'))));
    payments.forEach((snap) => snap.docs.forEach((d) => batch.delete(d.ref)));
    voided.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    const counts: CascadeCounts = {
      won: lead.stage === 'won' ? 1 : 0,
      history: acts.size,
      followUps: fus.size,
      invoices: voided.length,
    };
    const last = writeBatch(this.db);
    last.delete(doc(this.db, 'leads', id));
    if (!fromContact) {
      this.patchContact(last, lead, null, false);
      this.deletions.record(last, {
        kind: 'lead',
        refId: id,
        label: [lead.name, dealTitle(lead)].filter(Boolean).join(' · '),
        detail: cascadeDetail(counts),
        snapshot: lead,
      });
    }
    await last.commit();
    return counts;
  }

  /** Actualiza el resumen de compras del contacto del lead en el mismo batch. */
  private patchContact(batch: ReturnType<typeof writeBatch>, before: Lead, after: DealState | null, firstWon: boolean): void {
    if (!before.contactId) return;
    const patch = statsPatch(before, after, firstWon);
    if (Object.keys(patch).length) batch.update(doc(this.db, 'contacts', before.contactId), patch);
  }

  /** ¿Hay que fijar `firstWonAt`? Solo al ganar y si el contacto aún no la tiene. */
  private async firstWonMissing(contactId: string | null, after: DealState): Promise<boolean> {
    if (!contactId || after.stage !== 'won') return false;
    const snap = await getDoc(doc(this.db, 'contacts', contactId));
    return !snap.data()?.['firstWonAt'];
  }
}

function clean<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as T;
}
