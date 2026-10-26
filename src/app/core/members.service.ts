import { Service, computed, inject } from '@angular/core';
import { t } from './i18n/i18n';
import {
  DocumentData,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { ContactsService } from './contacts.service';
import { DeletionsService } from './deletions.service';
import { FIRESTORE } from './firebase';
import { FollowUpsService } from './followups.service';
import { LeadsService } from './leads.service';
import { toDate } from './firestore-utils';
import { Invite, Member, MemberRole, SessionLog } from './models';
import { teamQuery } from './team-query';

/** Miembros del equipo e invitaciones pendientes. */
@Service()
export class MembersService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly leads = inject(LeadsService);
  private readonly contacts = inject(ContactsService);
  private readonly followUps = inject(FollowUpsService);
  private readonly deletions = inject(DeletionsService);

  private readonly liveMembers = teamQuery(
    () => query(collection(this.db, 'members'), orderBy('displayName')),
    (uid: string, d: DocumentData): Member => ({
      uid,
      email: d['email'] ?? '',
      displayName: d['displayName'] ?? d['email'] ?? '',
      photoURL: d['photoURL'] ?? null,
      role: d['role'] ?? 'member',
      active: d['active'] === true,
    }),
  );

  private readonly liveInvites = teamQuery(
    () => query(collection(this.db, 'invites'), orderBy('createdAt', 'desc')),
    (email: string, d: DocumentData): Invite => ({
      email,
      role: d['role'] ?? 'member',
      invitedBy: d['invitedBy'] ?? '',
      createdAt: toDate(d['createdAt']),
    }),
    () => this.auth.isAdmin(),
  );

  /** Última entrada y salida de cada uno: solo la lee un admin. */
  private readonly liveSessions = teamQuery(
    () => query(collection(this.db, 'sessions')),
    (uid: string, d: DocumentData): SessionLog => ({
      uid,
      signInAt: toDate(d['signInAt']),
      signOutAt: toDate(d['signOutAt']),
      signOutReason: d['signOutReason'] ?? null,
    }),
    () => this.auth.isAdmin(),
  );

  readonly members = this.liveMembers.data;
  readonly active = computed(() => this.members().filter((m) => m.active));
  readonly invites = this.liveInvites.data;
  readonly invitesError = this.liveInvites.error;
  readonly sessions = computed(() => new Map(this.liveSessions.data().map((s) => [s.uid, s])));
  readonly sessionsLoading = this.liveSessions.loading;
  readonly sessionsError = this.liveSessions.error;
  readonly byId = computed(() => new Map(this.members().map((m) => [m.uid, m])));

  name(uid: string): string {
    if (!uid) return t('member.unassigned');
    return this.byId().get(uid)?.displayName ?? t('member.former');
  }

  invite(email: string, role: MemberRole): Promise<void> {
    const id = email.trim().toLowerCase();
    return setDoc(doc(this.db, 'invites', id), {
      email: id,
      role,
      invitedBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
  }

  revokeInvite(email: string): Promise<void> {
    return deleteDoc(doc(this.db, 'invites', email));
  }

  setInviteRole(email: string, role: MemberRole): Promise<void> {
    return updateDoc(doc(this.db, 'invites', email), { role });
  }

  /** Solo para otros miembros: las reglas no dejan que un admin cambie su propio rol. */
  setRole(uid: string, role: MemberRole): Promise<void> {
    return updateDoc(doc(this.db, 'members', uid), { role });
  }

  setActive(uid: string, active: boolean): Promise<void> {
    return updateDoc(doc(this.db, 'members', uid), { active });
  }

  /** Lo que tiene a su nombre un miembro: negocios y contactos (lo ve entero un admin). */
  holdings(uid: string): { deals: number; contacts: number } {
    return {
      deals: this.leads.leads().filter((l) => l.assigneeId === uid).length,
      contacts: this.contacts.contacts().filter((c) => c.assigneeId === uid).length,
    };
  }

  /**
   * Solo admin, y solo a alguien sin acceso: pasa sus negocios (con follow-ups pendientes y
   * factura vigente), sus contactos y sus facturas a `heirUid`, y luego borra su ficha y su
   * última sesión, anotándolo en el registro de borrados. Si no tenía nada, `heirUid` puede ir vacío.
   */
  async remove(member: Member, heirUid: string): Promise<void> {
    const uid = member.uid;
    const deals = this.leads.leads().filter((l) => l.assigneeId === uid);
    const owned = this.contacts.contacts().filter((c) => c.assigneeId === uid);
    if ((deals.length || owned.length) && !heirUid) throw new Error(t('team.deleteNeedsHeir'));
    for (const l of deals) {
      await this.leads.reassign(l, heirUid, this.followUps.forLead(l.id).map((f) => f.id));
    }
    // Contactos y facturas que quedan a su nombre (las anuladas no viajan con la venta).
    const invoices = heirUid ? await getDocs(query(collection(this.db, 'invoices'), where('assigneeId', '==', uid))) : null;
    const moves = writeBatch(this.db);
    for (const c of owned) moves.update(doc(this.db, 'contacts', c.id), { assigneeId: heirUid, updatedAt: serverTimestamp() });
    invoices?.forEach((d) => moves.update(d.ref, { assigneeId: heirUid }));
    if (owned.length || !invoices?.empty) await moves.commit();

    const batch = writeBatch(this.db);
    batch.delete(doc(this.db, 'members', uid));
    batch.delete(doc(this.db, 'sessions', uid));
    this.deletions.record(batch, {
      kind: 'member',
      refId: uid,
      label: `${member.displayName} · ${member.email}`,
      detail: heirUid && (deals.length || owned.length)
        ? t('team.deletedHeir', { name: this.name(heirUid), deals: deals.length, contacts: owned.length })
        : '',
      snapshot: { ...member, session: this.sessions().get(uid) ?? null },
    });
    await batch.commit();
  }
}
