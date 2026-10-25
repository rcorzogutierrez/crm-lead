import { Service, computed, inject, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { AUTH, FIRESTORE } from './firebase';
import { I18nKey } from './i18n/i18n';
import { Member, MemberRole, SignOutReason } from './models';

export type AuthStatus = 'loading' | 'signedOut' | 'pending' | 'member';

/** Último inicio de sesión ya anotado (Auth lo da en `metadata.lastSignInTime`), compartido entre pestañas. */
const SIGN_IN_KEY = 'crm-lead.recordedSignIn';
/** Un inicio más antiguo es una sesión restaurada al abrir el navegador, no una entrada nueva. */
const FRESH_SIGN_IN = 5 * 60_000;
/** Lo máximo que se espera a anotar la salida antes de cerrar la sesión (sin red no llega). */
const SIGN_OUT_WAIT = 2_000;

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
      await this.checkMembership(user);
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

  /**
   * Cierra la sesión. Si es miembro, antes anota la hora y el motivo en `sessions/{uid}`
   * (lo ve el admin en Equipo); sin red no se espera más de 2 s.
   * `reason: null` cierra sin anotar nada (sesión que ya había terminado al cerrar el navegador).
   */
  async signOut(reason: SignOutReason | null = 'manual'): Promise<void> {
    const uid = this.uid();
    if (reason && uid && this._status() === 'member') {
      const write = setDoc(
        doc(this.db, 'sessions', uid),
        { signOutAt: serverTimestamp(), signOutReason: reason },
        { merge: true },
      );
      await Promise.race([write, new Promise((r) => setTimeout(r, SIGN_OUT_WAIT))]).catch((err) =>
        console.error(err),
      );
    }
    return signOut(this.auth);
  }

  /** Anota un inicio de sesión nuevo una sola vez (no las sesiones restauradas ni las recargas). */
  private recordSignIn(user: User): void {
    const at = user.metadata.lastSignInTime ?? '';
    const time = Date.parse(at);
    if (!time || Date.now() - time > FRESH_SIGN_IN) return;
    try {
      if (localStorage.getItem(SIGN_IN_KEY) === user.uid + '|' + at) return;
      localStorage.setItem(SIGN_IN_KEY, user.uid + '|' + at);
    } catch {
      // Sin localStorage: puede anotarse dos veces el mismo inicio, con segundos de diferencia.
    }
    void setDoc(doc(this.db, 'sessions', user.uid), { signInAt: serverTimestamp() }, { merge: true }).catch(
      (err) => console.error(err),
    );
  }

  /** Vuelve a comprobar si ya fue invitado (botón en la pantalla de acceso pendiente). */
  async recheck(): Promise<void> {
    const user = this._user();
    if (!user) return;
    this.stopMember?.();
    this.stopMember = null;
    await this.checkMembership(user);
  }

  /** Comprueba el alta; si falla, queda en `pending` con el error (nunca en `loading`). */
  private async checkMembership(user: User): Promise<void> {
    this._error.set(null);
    this.setStatus('loading');
    try {
      await this.ensureMembership(user);
    } catch (err) {
      console.error(err);
      if (this._user() !== user) return;
      this._error.set('auth.err.verify');
      this.setStatus('pending');
    }
  }

  private async ensureMembership(user: User): Promise<void> {
    const memberRef = doc(this.db, 'members', user.uid);
    const snap = await getDoc(memberRef);

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
          if (this._user() === user) this.setStatus('pending');
          return;
        }
        const batch = writeBatch(this.db);
        batch.set(memberRef, { ...base, role: invite.data()['role'] as MemberRole });
        await batch.commit();
        await deleteDoc(inviteRef).catch(() => undefined);
      }
    }

    // Si entretanto cerró sesión o entró otra cuenta, esta comprobación ya no vale.
    if (this._user() !== user) return;
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
        const first = this._status() !== 'member';
        this.setStatus('member');
        const user = this._user();
        if (first && user) this.recordSignIn(user);
      },
      () => this.setStatus('pending'),
    );
  }
}
