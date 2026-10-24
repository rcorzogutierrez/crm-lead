import { Service, computed, inject } from '@angular/core';
import {
  DocumentData,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { FollowUpsService } from './followups.service';
import { LeadsService } from './leads.service';
import { Contact, ContactDraft, Lead, isClosed } from './models';
import { teamQuery } from './team-query';

function mapContact(id: string, d: DocumentData): Contact {
  return {
    id,
    name: d['name'] ?? '',
    company: d['company'] ?? '',
    email: d['email'] ?? '',
    phone: d['phone'] ?? '',
    assigneeId: d['assigneeId'] ?? '',
    notes: d['notes'] ?? '',
    createdBy: d['createdBy'] ?? '',
    createdAt: toDate(d['createdAt']),
    updatedAt: toDate(d['updatedAt']),
  };
}

export interface ContactSummary {
  open: Lead[];
  won: Lead[];
  lost: Lead[];
  /** Suma de lo ganado. */
  totalWon: number;
  /** Fecha de la primera venta ganada; null = prospecto. */
  customerSince: Date | null;
  /** Próximo follow-up entre sus leads abiertos. */
  nextAt: Date | null;
  lastContactAt: Date | null;
}

const EMPTY_SUMMARY: ContactSummary = {
  open: [],
  won: [],
  lost: [],
  totalWon: 0,
  customerSince: null,
  nextAt: null,
  lastContactAt: null,
};

export const normEmail = (s: string) => s.trim().toLowerCase();
export const normalizeText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const phoneDigits = (s: string) => s.replace(/\D/g, '');

/** Dos teléfonos coinciden si sus dígitos son iguales o uno termina en el otro (prefijo de país). */
export function samePhone(a: string, b: string): boolean {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (x.length < 7 || y.length < 7) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** Fecha en que se ganó un lead (los anteriores a `wonAt` usan su última actualización). */
export function wonDate(l: Lead): Date | null {
  return l.wonAt ?? l.updatedAt ?? l.createdAt;
}

/** Contactos del equipo (prospectos y clientes) y el resumen de sus leads. */
@Service()
export class ContactsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly leadsService = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);
  private readonly live = teamQuery(() => query(collection(this.db, 'contacts'), orderBy('name')), mapContact);

  readonly contacts = this.live.data;
  readonly loading = computed(() => this.live.loading() || this.leadsService.loading());
  readonly error = this.live.error;
  readonly byId = computed(() => new Map(this.contacts().map((c) => [c.id, c])));

  readonly summaries = computed(() => {
    const map = new Map<string, ContactSummary>();
    for (const l of this.leadsService.leads()) {
      if (!l.contactId) continue;
      let s = map.get(l.contactId);
      if (!s) {
        s = { open: [], won: [], lost: [], totalWon: 0, customerSince: null, nextAt: null, lastContactAt: null };
        map.set(l.contactId, s);
      }
      if (l.stage === 'won') {
        s.won.push(l);
        s.totalWon += l.value;
        const d = wonDate(l);
        if (d && (!s.customerSince || d < s.customerSince)) s.customerSince = d;
      } else if (l.stage === 'lost') {
        s.lost.push(l);
      } else {
        s.open.push(l);
      }
      if (!isClosed(l.stage) && l.nextFollowUpAt && (!s.nextAt || l.nextFollowUpAt < s.nextAt)) s.nextAt = l.nextFollowUpAt;
      if (l.lastContactAt && (!s.lastContactAt || l.lastContactAt > s.lastContactAt)) s.lastContactAt = l.lastContactAt;
    }
    for (const s of map.values()) s.won.sort((a, b) => (wonDate(b)?.getTime() ?? 0) - (wonDate(a)?.getTime() ?? 0));
    return map;
  });

  /** Leads que aún no tienen contacto (anteriores a esta versión). */
  readonly unlinkedLeads = computed(() => this.leadsService.leads().filter((l) => !l.contactId));

  summary(contactId: string | null): ContactSummary {
    return (contactId && this.summaries().get(contactId)) || EMPTY_SUMMARY;
  }

  isCustomer(contactId: string | null): boolean {
    return this.summary(contactId).won.length > 0;
  }

  /** Contactos que coinciden con lo escrito (nombre, empresa, email o dígitos del teléfono), clientes primero. */
  search(text: string, max = 6): Contact[] {
    const q = normalizeText(text.trim());
    if (q.length < 2) return [];
    const digits = phoneDigits(text);
    return this.contacts()
      .filter((c) => {
        if (normalizeText(`${c.name} ${c.company} ${c.email}`).includes(q)) return true;
        return digits.length >= 3 && phoneDigits(c.phone).includes(digits);
      })
      .sort((a, b) => {
        const sa = normalizeText(a.name).startsWith(q) ? 0 : 1;
        const sb = normalizeText(b.name).startsWith(q) ? 0 : 1;
        return sa - sb || Number(this.isCustomer(b.id)) - Number(this.isCustomer(a.id)) || a.name.localeCompare(b.name);
      })
      .slice(0, max);
  }

  /** Busca un contacto existente con el mismo email o teléfono. */
  findMatch(email: string, phone: string): Contact | null {
    const e = normEmail(email);
    return (
      this.contacts().find((c) => (e && c.email && normEmail(c.email) === e) || (phone && c.phone && samePhone(c.phone, phone))) ??
      null
    );
  }

  /** Actualiza el contacto y su copia en cada lead y follow-up pendiente. */
  async update(contact: Contact, patch: ContactDraft): Promise<void> {
    const data = {
      name: patch.name.trim(),
      company: patch.company.trim(),
      email: normEmail(patch.email),
      phone: patch.phone.trim(),
      assigneeId: patch.assigneeId,
      notes: patch.notes.trim(),
    };
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'contacts', contact.id), { ...data, updatedAt: serverTimestamp() });
    const leads = this.leadsService.leads().filter((l) => l.contactId === contact.id);
    for (const l of leads) {
      batch.update(doc(this.db, 'leads', l.id), {
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        updatedAt: serverTimestamp(),
      });
      for (const fu of this.followUps.forLead(l.id)) {
        batch.update(doc(this.db, 'followups', fu.id), { leadName: data.name, company: data.company });
      }
    }
    await batch.commit();
  }

  /**
   * Crea un contacto por cada persona de los leads antiguos (agrupando por email o teléfono)
   * y los vincula. Se puede repetir: solo toca leads sin contacto.
   */
  async migrateLegacy(): Promise<number> {
    const pending = this.unlinkedLeads();
    if (!pending.length) return 0;
    const uid = this.auth.uid();
    const known = [...this.contacts()];
    const ops: { kind: 'contact'; id: string; data: Record<string, unknown> }[] = [];
    const links: { leadId: string; contactId: string }[] = [];

    // Del más antiguo al más nuevo, para que el contacto tome los datos del primer lead.
    const ordered = [...pending].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    for (const l of ordered) {
      const e = normEmail(l.email);
      let match = known.find((c) => (e && normEmail(c.email) === e) || (l.phone && c.phone && samePhone(c.phone, l.phone)));
      if (!match) {
        const ref = doc(collection(this.db, 'contacts'));
        match = {
          id: ref.id,
          name: l.name,
          company: l.company,
          email: e,
          phone: l.phone,
          assigneeId: l.assigneeId,
          notes: '',
          createdBy: uid,
          createdAt: null,
          updatedAt: null,
        };
        known.push(match);
        ops.push({
          kind: 'contact',
          id: ref.id,
          data: {
            name: match.name,
            company: match.company,
            email: match.email,
            phone: match.phone,
            assigneeId: match.assigneeId || uid,
            notes: '',
            createdBy: uid,
            createdAt: l.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      }
      links.push({ leadId: l.id, contactId: match.id });
    }

    // Lotes de hasta 400 escrituras; cada contacto va en el mismo lote que su primer lead.
    let batch = writeBatch(this.db);
    let count = 0;
    const flush = async () => {
      if (count) await batch.commit();
      batch = writeBatch(this.db);
      count = 0;
    };
    const created = new Set<string>();
    for (const link of links) {
      if (!created.has(link.contactId)) {
        const op = ops.find((o) => o.id === link.contactId);
        if (op) batch.set(doc(this.db, 'contacts', op.id), op.data);
        created.add(link.contactId);
        count++;
      }
      batch.update(doc(this.db, 'leads', link.leadId), { contactId: link.contactId, updatedAt: serverTimestamp() });
      count++;
      if (count >= 400) await flush();
    }
    await flush();
    return links.length;
  }
}
