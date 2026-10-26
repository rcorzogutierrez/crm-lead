import { Service, computed, inject } from '@angular/core';
import {
  DocumentData,
  Timestamp,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { Clock } from './clock.service';
import { addDays, dayDiff } from './dates';
import { t } from './i18n/i18n';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { ActivityType, ContactChannel, FollowUp, Lead } from './models';
import { teamQuery } from './team-query';

function mapFollowUp(id: string, d: DocumentData): FollowUp {
  return {
    id,
    leadId: d['leadId'],
    leadName: d['leadName'] ?? '',
    company: d['company'] ?? '',
    assigneeId: d['assigneeId'] ?? '',
    dueAt: toDate(d['dueAt']) ?? new Date(),
    channel: d['channel'] ?? 'call',
    note: d['note'] ?? '',
    status: d['status'] ?? 'pending',
    createdBy: d['createdBy'] ?? '',
    completedAt: toDate(d['completedAt']),
  };
}

export interface CompleteInput {
  /** Qué pasó en el contacto; queda en el historial del lead. */
  outcome: string;
  /** Siguiente follow-up, si se programa en el mismo paso. */
  next?: { dueAt: Date; channel: ContactChannel; note: string } | null;
  /** Canal real del contacto, si no fue el previsto (se registró una llamada en vez del WhatsApp agendado). */
  channel?: ContactChannel;
}

function activityTypeFor(channel: ContactChannel): ActivityType {
  return channel === 'task' ? 'followup' : channel;
}

/**
 * Follow-ups pendientes: todos para un admin, los propios para un vendedor. Cada lead guarda una copia de su próxima
 * fecha (`nextFollowUpAt`) para ordenar y detectar leads sin próxima acción.
 */
@Service()
export class FollowUpsService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);
  private readonly live = teamQuery(
    () =>
      this.auth.isAdmin()
        ? query(collection(this.db, 'followups'), where('status', '==', 'pending'), orderBy('dueAt', 'asc'))
        : query(
            collection(this.db, 'followups'),
            where('assigneeId', '==', this.auth.uid()),
            where('status', '==', 'pending'),
            orderBy('dueAt', 'asc'),
          ),
    mapFollowUp,
  );

  readonly pending = this.live.data;
  readonly loading = this.live.loading;
  readonly error = this.live.error;

  readonly overdue = computed(() => this.pending().filter((f) => dayDiff(this.clock.now(), f.dueAt) < 0));
  readonly today = computed(() => this.pending().filter((f) => dayDiff(this.clock.now(), f.dueAt) === 0));
  readonly upcoming = computed(() => this.pending().filter((f) => dayDiff(this.clock.now(), f.dueAt) > 0));

  /**
   * Follow-ups hechos de una persona cuya fecha caía en [start, end). Consulta puntual (no en vivo)
   * para los reportes; usa el índice (assigneeId, status, dueAt).
   */
  async doneBetween(assigneeId: string, start: Date, end: Date): Promise<FollowUp[]> {
    const snap = await getDocs(
      query(
        collection(this.db, 'followups'),
        where('assigneeId', '==', assigneeId),
        where('status', '==', 'done'),
        where('dueAt', '>=', Timestamp.fromDate(start)),
        where('dueAt', '<', Timestamp.fromDate(end)),
        orderBy('dueAt', 'asc'),
      ),
    );
    return snap.docs.map((d) => mapFollowUp(d.id, d.data()));
  }

  forLead(leadId: string): FollowUp[] {
    return this.pending().filter((f) => f.leadId === leadId);
  }

  /** Programa un follow-up y actualiza la próxima fecha del lead. */
  async schedule(
    lead: Pick<Lead, 'id' | 'name' | 'company' | 'assigneeId'>,
    dueAt: Date, channel: ContactChannel, note: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(doc(collection(this.db, 'followups')), {
      leadId: lead.id,
      leadName: lead.name,
      company: lead.company,
      assigneeId: lead.assigneeId || this.auth.uid(),
      dueAt: Timestamp.fromDate(dueAt),
      channel,
      note: note.trim(),
      status: 'pending',
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    batch.update(doc(this.db, 'leads', lead.id), {
      nextFollowUpAt: Timestamp.fromDate(this.nextDate(lead.id, dueAt)),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Seguimiento de postventa a los 30 días de ganar, para volver a ofrecer algo. */
  schedulePostSale(lead: Pick<Lead, 'id' | 'name' | 'company' | 'assigneeId'>): Promise<void> {
    return this.schedule(lead, this.postSaleDate(), 'call', t('postsale.note'));
  }

  /** Fecha de la postventa: dentro de 30 días, a las 10:00. */
  postSaleDate(): Date {
    const due = addDays(this.clock.now(), 30);
    due.setHours(10, 0, 0, 0);
    return due;
  }

  /** Marca hecho, registra el resultado y, opcionalmente, programa el siguiente. */
  async complete(fu: FollowUp, input: CompleteInput): Promise<void> {
    const uid = this.auth.uid();
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'followups', fu.id), {
      status: 'done',
      outcome: input.outcome.trim(),
      completedAt: serverTimestamp(),
      completedBy: uid,
    });
    batch.set(doc(collection(this.db, 'leads', fu.leadId, 'activities')), {
      type: activityTypeFor(input.channel ?? fu.channel),
      body: input.outcome.trim() || fu.note,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });

    let next = this.nextDate(fu.leadId, null, fu.id);
    if (input.next) {
      batch.set(doc(collection(this.db, 'followups')), {
        leadId: fu.leadId,
        leadName: fu.leadName,
        company: fu.company,
        assigneeId: fu.assigneeId,
        dueAt: Timestamp.fromDate(input.next.dueAt),
        channel: input.next.channel,
        note: input.next.note.trim(),
        status: 'pending',
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      next = this.nextDate(fu.leadId, input.next.dueAt, fu.id);
    }
    batch.update(doc(this.db, 'leads', fu.leadId), {
      lastContactAt: serverTimestamp(),
      nextFollowUpAt: next ? Timestamp.fromDate(next) : null,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Mueve la fecha de un follow-up. */
  async reschedule(fu: FollowUp, dueAt: Date): Promise<void> {
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'followups', fu.id), { dueAt: Timestamp.fromDate(dueAt) });
    const next = this.nextDate(fu.leadId, dueAt, fu.id);
    batch.update(doc(this.db, 'leads', fu.leadId), {
      nextFollowUpAt: next ? Timestamp.fromDate(next) : null,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  async cancel(fu: FollowUp): Promise<void> {
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'followups', fu.id), { status: 'cancelled' });
    const next = this.nextDate(fu.leadId, null, fu.id);
    batch.update(doc(this.db, 'leads', fu.leadId), {
      nextFollowUpAt: next ? Timestamp.fromDate(next) : null,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** La fecha pendiente más próxima del lead, excluyendo `skipId` e incluyendo `extra`. */
  private nextDate(leadId: string, extra: Date, skipId?: string): Date;
  private nextDate(leadId: string, extra: Date | null, skipId?: string): Date | null;
  private nextDate(leadId: string, extra: Date | null, skipId?: string): Date | null {
    const dates = this.pending()
      .filter((f) => f.leadId === leadId && f.id !== skipId)
      .map((f) => f.dueAt.getTime());
    if (extra) dates.push(extra.getTime());
    return dates.length ? new Date(Math.min(...dates)) : null;
  }
}
