import { Service, computed, inject, signal } from '@angular/core';
import {
  ActionCodeSettings,
  GoogleAuthProvider,
  User,
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
} from 'firebase/auth';
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

export type AuthStatus = 'loading' | 'signedOut' | 'unverified' | 'pending' | 'member';

/** Error de Auth (código `auth/...`) → texto para el usuario. */
export function authErrorKey(err: unknown): I18nKey {
  switch ((err as { code?: string }).code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      // Mismo mensaje exista o no el email: no se revela quién tiene cuenta.
      return 'auth.err.credentials';
    case 'auth/too-many-requests':
      return 'auth.err.tooMany';
    case 'auth/user-disabled':
      return 'auth.err.disabled';
    case 'auth/email-already-in-use':
      return 'auth.err.inUse';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'auth.err.weak';
    case 'auth/operation-not-allowed':
      return 'auth.err.passwordOff';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'auth.err.link';
    case 'auth/network-request-failed':
      return 'auth.err.network';
    default:
      return 'auth.err.generic';
  }
}

/** Contraseña aceptable: 8 caracteres o más, con al menos una letra y un número. */
export const PASSWORD_RULES = {
  length: (pw: string) => pw.length >= 8,
  mix: (pw: string) => /\p{L}/u.test(pw) && /\d/.test(pw),
};
export const passwordOk = (pw: string) => PASSWORD_RULES.length(pw) && PASSWORD_RULES.mix(pw);

/** Último inicio de sesión ya anotado (Auth lo da en `metadata.lastSignInTime`), compartido entre pestañas. */
const SIGN_IN_KEY = 'crm-lead.recordedSignIn';
/** Un inicio más antiguo es una sesión restaurada al abrir el navegador, no una entrada nueva. */
const FRESH_SIGN_IN = 5 * 60_000;
/** Lo máximo que se espera a anotar la salida antes de cerrar la sesión (sin red no llega). */
const SIGN_OUT_WAIT = 2_000;
/** Reintentos del alta si las reglas la rechazan (token aún sin `email_verified`), con su espera. */
const MEMBERSHIP_RETRIES = [1_000, 2_500];

/**
 * Sesión del usuario y su pertenencia al equipo.
 *
 * Alta en el equipo:
 * - El primer usuario que entra cuando no existe `meta/team` se convierte en admin (dueño).
 * - El resto entra si un admin creó `invites/{email}`; el rol viene de la invitación.
 * - Cualquier otro queda en estado `pending` hasta ser invitado.
 *
 * Se entra con Google o con email y contraseña; con el mismo email es la misma cuenta.
 * Una cuenta con contraseña queda en `unverified` hasta confirmar el email con el enlace
 * del correo: las reglas exigen `email_verified`, así nadie se queda con una invitación ajena.
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
  /** Si la cuenta tiene contraseña (además o en lugar de Google). */
  readonly hasPassword = computed(
    () => !!this._user()?.providerData.some((p) => p.providerId === 'password'),
  );

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
      if (!user.emailVerified) {
        this.setStatus('unverified');
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

  /** Los enlaces de los correos vuelven a la app (si en la consola se configuró la URL de acción propia). */
  private links(): ActionCodeSettings {
    return { url: `${location.origin}/login` };
  }

  /** Entra con email y contraseña. Devuelve el error a mostrar, o `null`. */
  async signInWithPassword(email: string, password: string): Promise<I18nKey | null> {
    this._error.set(null);
    try {
      await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return null;
    } catch (err) {
      return authErrorKey(err);
    }
  }

  /**
   * Crea la cuenta de un invitado con su contraseña y le envía el enlace para confirmar el email.
   * Queda en `unverified`; el alta en el equipo se hace al confirmar, como con Google.
   */
  async signUp(name: string, email: string, password: string): Promise<I18nKey | null> {
    this._error.set(null);
    try {
      const { user } = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
      await updateProfile(user, { displayName: name.trim() });
      await sendEmailVerification(user, this.links());
      return null;
    } catch (err) {
      return authErrorKey(err);
    }
  }

  /** Reenvía el enlace de confirmación al email de la sesión actual. */
  async resendVerification(): Promise<I18nKey | null> {
    const user = this._user();
    if (!user) return 'auth.err.generic';
    try {
      await sendEmailVerification(user, this.links());
      return null;
    } catch (err) {
      return authErrorKey(err);
    }
  }

  /**
   * Comprueba si ya confirmó el email (por ejemplo, en otra pestaña o en el móvil).
   * Si lo hizo, renueva el token para que las reglas vean `email_verified` y sigue con el alta.
   */
  async refreshVerification(): Promise<boolean> {
    const user = this._user();
    if (!user) return false;
    try {
      await user.reload();
    } catch {
      return false;
    }
    if (!user.emailVerified || this._user() !== user) return false;
    // Ya estaba dentro (el enlace se abrió otra vez): nada que rehacer.
    if (this._status() !== 'unverified') return true;
    await this.checkMembership(user);
    return true;
  }

  /**
   * Envía el enlace para poner una contraseña nueva. Sirve también para que quien entra con Google
   * se cree una. No dice si el email tiene cuenta.
   */
  async sendPasswordReset(email: string): Promise<I18nKey | null> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim(), this.links());
      return null;
    } catch (err) {
      const key = authErrorKey(err);
      return key === 'auth.err.credentials' ? null : key;
    }
  }

  /** Email al que corresponde un enlace de nueva contraseña (falla si caducó o ya se usó). */
  checkResetCode(code: string): Promise<string> {
    return verifyPasswordResetCode(this.auth, code);
  }

  /** Guarda la contraseña nueva del enlace y entra con ella. */
  async confirmReset(code: string, email: string, password: string): Promise<I18nKey | null> {
    try {
      await confirmPasswordReset(this.auth, code, password);
    } catch (err) {
      return authErrorKey(err);
    }
    return this.signInWithPassword(email, password);
  }

  /** Aplica el enlace de confirmación del email; si la sesión es de esa cuenta, sigue con el alta. */
  async confirmEmail(code: string): Promise<I18nKey | null> {
    try {
      await applyActionCode(this.auth, code);
    } catch (err) {
      return authErrorKey(err);
    }
    await this.refreshVerification();
    return null;
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
    await user.reload().catch(() => undefined);
    if (this._user() !== user) return;
    if (!user.emailVerified) {
      this.setStatus('unverified');
      return;
    }
    await this.checkMembership(user);
  }

  /**
   * Comprueba el alta; si falla, queda en `pending` con el error (nunca en `loading`).
   * Si las reglas la rechazan, renueva el token y lo reintenta: con el email recién confirmado
   * (en otra pestaña o desde el enlace del correo) el token guardado puede no llevar aún `email_verified`.
   */
  private async checkMembership(user: User): Promise<void> {
    this._error.set(null);
    this.setStatus('loading');
    for (let attempt = 0; ; attempt++) {
      try {
        await this.verifiedToken(user, attempt > 0);
        await this.ensureMembership(user);
        return;
      } catch (err) {
        if (this._user() !== user) return;
        const wait = MEMBERSHIP_RETRIES[attempt];
        if (wait && (err as { code?: string })?.code === 'permission-denied') {
          await new Promise((r) => setTimeout(r, wait));
          if (this._user() !== user) return;
          continue;
        }
        console.error(err);
        this._error.set('auth.err.verify');
        this.setStatus('pending');
        return;
      }
    }
  }

  /** Renueva el token si aún no dice que el email está confirmado (o si `force`). */
  private async verifiedToken(user: User, force: boolean): Promise<void> {
    if (!force) {
      const { claims } = await user.getIdTokenResult();
      if (claims['email_verified'] === true) return;
    }
    await user.getIdToken(true);
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
        // Un fallo al leer no es "sin invitación": que lo reintente checkMembership.
        const invite = await getDoc(inviteRef);
        if (!invite.exists()) {
          // Puede que otra pestaña acabe de darle el alta (y gastar la invitación).
          if (!(await getDoc(memberRef)).exists()) {
            if (this._user() === user) this.setStatus('pending');
            return;
          }
        } else {
          const batch = writeBatch(this.db);
          batch.set(memberRef, { ...base, role: invite.data()['role'] as MemberRole });
          await batch.commit();
          await deleteDoc(inviteRef).catch(() => undefined);
        }
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
