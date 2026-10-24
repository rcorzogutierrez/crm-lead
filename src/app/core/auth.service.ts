import { Service, computed, inject, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { AUTH, FIRESTORE } from './firebase';
import { I18nKey } from './i18n/i18n';
import { Member, MemberRole } from './models';

export type AuthStatus = 'loading' | 'signedOut' | 'pending' | 'member';

/**
 * Sesión del usuario y su pertenencia al equipo.
 *
 * Alta en el equipo:
 * - El primer usuario que entra cuando no existe `meta/team` se convierte en admin (dueño).
 * - El resto entra si un admin creó `invites/{email}`; el rol viene de la invitación.
 * - Cualquier otro queda en estado `pending` hasta ser invitado.
 */
@Service()
export class AuthService {
  private readonly auth = inject(AUTH);
  private readonly db = inject(FIRESTORE);

  private readonly _user = signal<User | null>(null);
  private readonly _member = signal<Member | null>(null);
  private readonly _status = signal<AuthStatus>('loading');
  private readonly _error = signal<I18nKey | null>(null);
  private stopMember: (() => void) | null = null;

  readonly user = this._user.asReadonly();
  readonly member = this._member.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly uid = computed(() => this._user()?.uid ?? '');
  readonly isAdmin = computed(() => this._member()?.role === 'admin');

  private waiters: ((s: AuthStatus) => void)[] = [];

  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      this.stopMember?.();
      this.stopMember = null;
      this._user.set(user);
      this._member.set(null);
      if (!user) {
        this.setStatus('signedOut');
        return;
      }
      this.setStatus('loading');
      try {
        await this.ensureMembership(user);
      } catch (err) {
        console.error(err);
        this._error.set('auth.err.verify');
        this.setStatus('pending');
      }
    });
  }

  /** Se resuelve cuando el estado de sesión deja de estar en `loading`. */
  settled(): Promise<AuthStatus> {
    const current = this._status();
    if (current !== 'loading') return Promise.resolve(current);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private setStatus(status: AuthStatus): void {
    this._status.set(status);
    if (status === 'loading') return;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => w(status));
  }

  async signInWithGoogle(): Promise<void> {
    this._error.set(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(this.auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/unauthorized-domain') {
        this._error.set('auth.err.domain');
      } else {
        this._error.set('auth.err.google');
      }
    }
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }

  /** Vuelve a comprobar si ya fue invitado (botón en la pantalla de acceso pendiente). */
  async recheck(): Promise<void> {
    const user = this._user();
    if (!user) return;
    this.setStatus('loading');
    await this.ensureMembership(user);
  }

  private async ensureMembership(user: User): Promise<void> {
    const memberRef = doc(this.db, 'members', user.uid);
    let snap = await getDoc(memberRef);

    if (!snap.exists()) {
      const email = (user.email ?? '').toLowerCase();
      const base = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? email,
        photoURL: user.photoURL ?? null,
        active: true,
        createdAt: serverTimestamp(),
      };
      const teamRef = doc(this.db, 'meta', 'team');
      const team = await getDoc(teamRef);

      if (!team.exists()) {
        // Primer usuario: crea el equipo y queda como admin.
        const batch = writeBatch(this.db);
        batch.set(teamRef, { ownerUid: user.uid, name: 'Mi equipo', createdAt: serverTimestamp() });
        batch.set(memberRef, { ...base, role: 'admin' satisfies MemberRole });
        await batch.commit();
      } else {
        const inviteRef = doc(this.db, 'invites', email);
        const invite = await getDoc(inviteRef).catch(() => null);
        if (!invite?.exists()) {
          this.setStatus('pending');
          return;
        }
        const batch = writeBatch(this.db);
        batch.set(memberRef, { ...base, role: invite.data()['role'] as MemberRole });
        await batch.commit();
        await deleteDoc(inviteRef).catch(() => undefined);
      }
      snap = await getDoc(memberRef);
    }

    this.watchMember(user.uid);
  }

  private watchMember(uid: string): void {
    this.stopMember = onSnapshot(
      doc(this.db, 'members', uid),
      (snap) => {
        const data = snap.data();
        if (!data || data['active'] !== true) {
          this._member.set(null);
          this.setStatus('pending');
          return;
        }
        this._member.set({
          uid,
          email: data['email'],
          displayName: data['displayName'],
          photoURL: data['photoURL'] ?? null,
          role: data['role'],
          active: true,
        });
        this.setStatus('member');
      },
      () => this.setStatus('pending'),
    );
  }
}
