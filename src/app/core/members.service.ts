import { Service, computed, inject } from '@angular/core';
import { t } from './i18n/i18n';
import {
  DocumentData,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { Invite, Member, MemberRole } from './models';
import { teamQuery } from './team-query';

/** Miembros del equipo e invitaciones pendientes. */
@Service()
export class MembersService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

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

  readonly members = this.liveMembers.data;
  readonly active = computed(() => this.members().filter((m) => m.active));
  readonly invites = this.liveInvites.data;
  readonly invitesError = this.liveInvites.error;
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

  setRole(uid: string, role: MemberRole): Promise<void> {
    return updateDoc(doc(this.db, 'members', uid), { role });
  }

  setActive(uid: string, active: boolean): Promise<void> {
    return updateDoc(doc(this.db, 'members', uid), { active });
  }
}
