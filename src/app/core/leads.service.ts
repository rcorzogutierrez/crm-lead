import { Service, computed, inject } from '@angular/core';
import {
  DocumentData,
  addDoc,
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
import { Lead, LeadDraft, Stage, isClosed, stageMeta } from './models';
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
  };
}

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

  async create(draft: LeadDraft): Promise<string> {
    const uid = this.auth.uid();
    const ref = await addDoc(collection(this.db, 'leads'), {
      ...clean(draft),
      assigneeId: draft.assigneeId || uid,
      lostReason: '',
      nextFollowUpAt: null,
      lastContactAt: null,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(this.db, 'leads', ref.id, 'activities'), {
      type: 'created',
      body: '',
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
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
