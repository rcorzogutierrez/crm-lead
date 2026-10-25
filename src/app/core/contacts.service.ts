import { Service, computed, effect, inject } from '@angular/core';
import {
  DocumentData,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { STATS_VERSION } from './contact-stats';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { FollowUpsService } from './followups.service';
import { t } from './i18n/i18n';
import { LeadsService } from './leads.service';
import { Contact, ContactDraft, ContactStats, Lead, isClosed, wonDate } from './models';
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
    stats:
      d['statsV'] === STATS_VERSION
        ? {
            wonCount: Number(d['wonCount'] ?? 0),
            wonTotal: Number(d['wonTotal'] ?? 0),
            firstWonAt: toDate(d['firstWonAt']),
            openBy: cleanOpenBy(d['openBy']),
          }
        : null,
    archived: d['archived'] === true,
    archivedAt: toDate(d['archivedAt']),
  };
}

function cleanOpenBy(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [uid, n] of Object.entries(v)) if (typeof n === 'number' && n > 0) out[uid] = n;
  }
  return out;
}

/**
 * Lo que se sabe de un contacto. `open`/`won`/`lost` son los leads que el usuario puede ver
 * (todos si es admin, los suyos si es vendedor); los totales vienen del resumen guardado
 * en el contacto, así un vendedor sabe que es cliente aunque lo haya vendido otro.
 */
export interface ContactSummary {
  open: Lead[];
  won: Lead[];
  lost: Lead[];
  /** Compras ganadas, de cualquier vendedor. */
  wonCount: number;
  /** Suma de lo ganado. */
  totalWon: number;
  /** Fecha de la primera venta ganada; null = prospecto. */
  customerSince: Date | null;
  /** Negocios abiertos, de cualquier vendedor. */
  openCount: number;
  /** Otros vendedores con un negocio abierto con este contacto que el usuario no ve. */
  othersOpen: string[];
  /** Próximo follow-up entre sus leads abiertos visibles. */
  nextAt: Date | null;
  lastContactAt: Date | null;
}

type VisibleSummary = Pick<ContactSummary, 'open' | 'won' | 'lost' | 'totalWon' | 'customerSince' | 'nextAt' | 'lastContactAt'>;

const EMPTY_VISIBLE: VisibleSummary = {
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

  /** Resumen de los leads visibles, agrupados por contacto. */
  private readonly visible = computed(() => {
    const map = new Map<string, VisibleSummary>();
    for (const l of this.leadsService.leads()) {
      if (!l.contactId) continue;
      let s = map.get(l.contactId);
      if (!s) {
        s = { ...EMPTY_VISIBLE, open: [], won: [], lost: [] };
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

  constructor() {
    // Un admin ve todos los leads: recalcula el resumen guardado en cada contacto cuando
    // no coincide (contactos anteriores, o un cambio que se coló sin actualizarlo).
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect((onCleanup) => {
      if (!this.auth.isAdmin() || this.loading() || this.leadsService.error() || this.live.error()) return;
      const contacts = this.contacts();
      const leads = this.leadsService.leads();
      timer = setTimeout(() => void this.syncStats(contacts, leads).catch((err) => console.error(err)), 2000);
      onCleanup(() => clearTimeout(timer));
    });
  }

  summary(contactId: string | null): ContactSummary {
    const v = (contactId && this.visible().get(contactId)) || EMPTY_VISIBLE;
    const stats = contactId ? (this.byId().get(contactId)?.stats ?? null) : null;
    const visibleOwners = new Set(v.open.map((l) => l.assigneeId));
    return {
      ...v,
      wonCount: stats ? Math.max(stats.wonCount, v.won.length) : v.won.length,
      totalWon: stats ? Math.max(stats.wonTotal, v.totalWon) : v.totalWon,
      customerSince: stats?.firstWonAt ?? v.customerSince,
      openCount: stats ? Math.max(sum(stats.openBy), v.open.length) : v.open.length,
      othersOpen: stats ? Object.keys(stats.openBy).filter((uid) => !visibleOwners.has(uid)) : [],
    };
  }

  isCustomer(contactId: string | null): boolean {
    return this.summary(contactId).wonCount > 0;
  }

  /** Resumen que corresponde a cada contacto según todos los leads (solo tiene sentido para un admin). */
  private async syncStats(contacts: Contact[], leads: Lead[]): Promise<void> {
    const expected = new Map<string, ContactStats>();
    for (const l of leads) {
      if (!l.contactId) continue;
      let s = expected.get(l.contactId);
      if (!s) {
        s = { wonCount: 0, wonTotal: 0, firstWonAt: null, openBy: {} };
        expected.set(l.contactId, s);
      }
      if (l.stage === 'won') {
        s.wonCount++;
        s.wonTotal += l.value;
        const d = wonDate(l);
        if (d && (!s.firstWonAt || d < s.firstWonAt)) s.firstWonAt = d;
      } else if (!isClosed(l.stage)) {
        s.openBy[l.assigneeId] = (s.openBy[l.assigneeId] ?? 0) + 1;
      }
    }
    const writes: { id: string; data: Record<string, unknown> }[] = [];
    for (const c of contacts) {
      const want = expected.get(c.id) ?? { wonCount: 0, wonTotal: 0, firstWonAt: null, openBy: {} };
      const have = c.stats;
      // La primera compra guardada se respeta si sigue habiendo compras (es la fecha real de la venta).
      const firstWonAt = want.wonCount ? (have?.firstWonAt ?? want.firstWonAt) : null;
      const same =
        have &&
        have.wonCount === want.wonCount &&
        Math.abs(have.wonTotal - want.wonTotal) < 0.01 &&
        sameOpenBy(have.openBy, want.openBy) &&
        (have.firstWonAt?.getTime() ?? null) === (firstWonAt?.getTime() ?? null);
      if (same) continue;
      writes.push({
        id: c.id,
        data: {
          statsV: STATS_VERSION,
          wonCount: want.wonCount,
          wonTotal: Math.round(want.wonTotal * 100) / 100,
          firstWonAt: firstWonAt ? Timestamp.fromDate(firstWonAt) : null,
          openBy: want.openBy,
        },
      });
    }
    for (let i = 0; i < writes.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const w of writes.slice(i, i + 400)) batch.update(doc(this.db, 'contacts', w.id), w.data);
      await batch.commit();
    }
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
        return (
          Number(a.archived) - Number(b.archived) ||
          sa - sb ||
          Number(this.isCustomer(b.id)) - Number(this.isCustomer(a.id)) ||
          a.name.localeCompare(b.name)
        );
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
   * Solo admin: archiva el contacto (deja de aparecer en la lista, conserva su historial).
   * Sus negocios abiertos pasan a Perdido con `reason` y sus follow-ups pendientes se
   * cancelan en el mismo batch, para que ningún lead activo quede sin próxima acción.
   */
  async archive(contact: Contact, reason: string): Promise<void> {
    const uid = this.auth.uid();
    const open = this.leadsService.leads().filter((l) => l.contactId === contact.id && !isClosed(l.stage));
    const batch = writeBatch(this.db);
    for (const l of open) {
      batch.update(doc(this.db, 'leads', l.id), {
        stage: 'lost',
        lostReason: reason,
        wonAt: null,
        lostAt: serverTimestamp(),
        nextFollowUpAt: null,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(this.db, 'leads', l.id, 'activities')), {
        type: 'stage',
        from: l.stage,
        to: 'lost',
        body: reason,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      for (const fu of this.followUps.forLead(l.id)) batch.update(doc(this.db, 'followups', fu.id), { status: 'cancelled' });
    }
    // Un admin ve todos los leads: si había abiertos, ya no queda ninguno.
    batch.update(doc(this.db, 'contacts', contact.id), {
      archived: true,
      archivedAt: serverTimestamp(),
      ...(open.length ? { openBy: {} } : {}),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Vuelve a mostrar el contacto. Sus negocios perdidos siguen perdidos. */
  unarchive(contact: Contact): Promise<void> {
    return updateDoc(doc(this.db, 'contacts', contact.id), { archived: false, archivedAt: null, updatedAt: serverTimestamp() });
  }

  /**
   * Solo admin: borra el contacto con sus negocios (historial y follow-ups incluidos).
   * Un cliente con ventas ganadas no se borra: se archiva, para no perder lo vendido.
   */
  async remove(contact: Contact): Promise<void> {
    const leads = this.leadsService.leads().filter((l) => l.contactId === contact.id);
    if (this.summary(contact.id).wonCount > 0 || leads.some((l) => l.stage === 'won')) {
      throw new Error(t('contact.cantDeleteCustomer'));
    }
    for (const l of leads) await this.leadsService.remove(l, false);
    await deleteDoc(doc(this.db, 'contacts', contact.id));
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
          stats: null,
          archived: false,
          archivedAt: null,
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

function sum(m: Record<string, number>): number {
  return Object.values(m).reduce((a, b) => a + b, 0);
}

function sameOpenBy(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
