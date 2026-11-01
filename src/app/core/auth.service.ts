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
  DocumentReference,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { AUTH, FIRESTORE } from './firebase';
import { I18nKey } from './i18n/i18n';
import { Member, MemberRole, SignOutReason } from './models';
import { TENANT_KEY, TenantService } from './tenant.service';

/** `choose`: está en varias empresas y en este navegador aún no eligió en cuál entrar. */
export type AuthStatus = 'loading' | 'signedOut' | 'unverified' | 'pending' | 'choose' | 'member';

/** Empresa a la que pertenece el usuario (con acceso), para el selector. */
export interface MyTenant {
  id: string;
  name: string;
}

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
 * Alta en una empresa (tenant):
 * - Las empresas las crea el super-admin de la plataforma, que invita a su primer admin.
 * - Se entra si un admin de la empresa creó `tenants/{t}/invites/{email}`; el rol viene de la invitación.
 * - Cualquier otro queda en estado `pending` hasta ser invitado (o si su empresa está suspendida).
 *
 * Se entra con Google o con email y contraseña; con el mismo email es la misma cuenta.
 * Una cuenta con contraseña queda en `unverified` hasta confirmar el email con el enlace
 * del correo: las reglas exigen `email_verified`, así nadie se queda con una invitación ajena.
 */
@Service()
export class AuthService {
  private readonly auth = inject(AUTH);
  private readonly db = inject(FIRESTORE);
  private readonly tenant = inject(TenantService);

  private readonly _user = signal<User | null>(null);
  private readonly _member = signal<Member | null>(null);
  private readonly _status = signal<AuthStatus>('loading');
  private readonly _error = signal<I18nKey | null>(null);
  private readonly _suspended = signal(false);
  private readonly _platformAdmin = signal(false);
  private readonly _tenants = signal<MyTenant[]>([]);
  private stopMember: (() => void) | null = null;

  readonly user = this._user.asReadonly();
  readonly member = this._member.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  /** En `pending` porque su empresa está suspendida (no por falta de invitación). */
  readonly suspended = this._suspended.asReadonly();
  /** Super-admin de la plataforma (`platformAdmins/{uid}`, creado a mano en la consola). */
  readonly platformAdmin = this._platformAdmin.asReadonly();
  /** Empresas activas en las que tiene acceso, por nombre. Con más de una aparece el selector. */
  readonly tenants = this._tenants.asReadonly();
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
      this.tenant.set(null);
      this._platformAdmin.set(false);
      this._tenants.set([]);
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
        this.tenant.doc('sessions', uid),
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
    // Cada empresa anota su entrada: cambiar de empresa en la misma sesión cuenta como entrar en ella.
    const key = `${user.uid}|${this.tenant.id()}|${at}`;
    try {
      if (localStorage.getItem(SIGN_IN_KEY) === key) return;
      localStorage.setItem(SIGN_IN_KEY, key);
    } catch {
      // Sin localStorage: puede anotarse dos veces el mismo inicio, con segundos de diferencia.
    }
    void setDoc(this.tenant.doc('sessions', user.uid), { signInAt: serverTimestamp() }, { merge: true }).catch(
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
        await this.checkPlatformAdmin(user);
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

  /** Marca de super-admin; si no se puede leer, no lo es. */
  private async checkPlatformAdmin(user: User): Promise<void> {
    const snap = await getDoc(doc(this.db, 'platformAdmins', user.uid)).catch(() => null);
    if (this._user() === user) this._platformAdmin.set(!!snap?.exists());
  }

  /** Renueva el token si aún no dice que el email está confirmado (o si `force`). */
  private async verifiedToken(user: User, force: boolean): Promise<void> {
    if (!force) {
      const { claims } = await user.getIdTokenResult();
      if (claims['email_verified'] === true) return;
    }
    await user.getIdToken(true);
  }

  /**
   * Busca en qué empresas está (fichas `tenants/{t}/members/{uid}`) y consume las invitaciones
   * (`tenants/{t}/invites/{email}`) de empresas donde aún no tiene ficha, aunque ya esté en otra.
   * Con una sola empresa entra en ella; con varias, en la última elegida en este navegador o,
   * si no hay ninguna, pide elegir (`choose`).
   */
  private async ensureMembership(user: User): Promise<void> {
    const email = (user.email ?? '').toLowerCase();
    const tenantOf = (ref: DocumentReference) => ref.parent.parent?.id ?? null;
    const mine = await getDocs(query(collectionGroup(this.db, 'members'), where('uid', '==', user.uid)));
    const known = mine.docs.map((d) => tenantOf(d.ref)).filter((t): t is string => !!t);
    const options = mine.docs
      .filter((d) => d.data()['active'] === true)
      .map((d) => tenantOf(d.ref))
      .filter((t): t is string => !!t);

    // Sin ninguna empresa, un fallo al leer no es "sin invitación": que lo reintente checkMembership.
    // Con alguna ya, una invitación que no se pudo consumir espera a la próxima entrada.
    const invites = await getDocs(query(collectionGroup(this.db, 'invites'), where('email', '==', email))).catch(
      (err) => {
        if (!options.length) throw err;
        console.error(err);
        return null;
      },
    );
    for (const invite of invites?.docs ?? []) {
      // Una invitación de una empresa donde ya tiene ficha (sin acceso) no le devuelve el acceso.
      const t = tenantOf(invite.ref);
      if (!t || known.includes(t)) continue;
      try {
        await setDoc(doc(this.db, 'tenants', t, 'members', user.uid), {
          uid: user.uid,
          email: user.email ?? '',
          displayName: user.displayName ?? email,
          photoURL: user.photoURL ?? null,
          role: invite.data()['role'] as MemberRole,
          active: true,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        if (!options.length) throw err;
        console.error(err);
        continue;
      }
      await deleteDoc(invite.ref).catch(() => undefined);
      known.push(t);
      options.push(t);
    }

    // Nombre de cada empresa; las suspendidas no se ofrecen.
    const found = await Promise.all(
      options.map(async (id) => {
        const snap = await getDoc(doc(this.db, 'tenants', id)).catch(() => null);
        const data = snap?.data();
        return data?.['active'] === true ? { id, name: String(data['name'] ?? '') } : null;
      }),
    );
    // Si entretanto cerró sesión o entró otra cuenta, esta comprobación ya no vale.
    if (this._user() !== user) return;
    const list = found
      .filter((t): t is MyTenant => !!t)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    this._tenants.set(list);
    if (!list.length) {
      this._suspended.set(options.length > 0);
      this.setStatus('pending');
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TENANT_KEY);
    } catch {
      // Sin localStorage: con varias empresas, se elige al entrar.
    }
    const pick = list.length === 1 ? list[0].id : list.find((t) => t.id === saved)?.id;
    if (pick) this.watchMember(pick, user.uid);
    else this.setStatus('choose');
  }

  /**
   * Entra en otra de sus empresas (selector del menú o pantalla de elegir). Los servicios
   * rehacen sus consultas solos: pasan por `loading` y leen las rutas de la empresa nueva.
   */
  enterTenant(tenantId: string): void {
    const uid = this.uid();
    if (!uid || !this._tenants().some((t) => t.id === tenantId)) return;
    if (this._status() === 'member' && this.tenant.id() === tenantId) return;
    this.stopMember?.();
    this.stopMember = null;
    this._member.set(null);
    this.tenant.set(null);
    this.setStatus('loading');
    this.watchMember(tenantId, uid);
  }

  /** Escucha la ficha de miembro y la empresa: perder el acceso o suspenderla saca al usuario. */
  private watchMember(tenantId: string, uid: string): void {
    let member: Member | null = null;
    let tenant: { name: string; active: boolean } | null = null;
    const apply = () => {
      if (!member || !tenant) return;
      if (!tenant.active) {
        this._member.set(null);
        this.tenant.set(null);
        this._suspended.set(true);
        this.setStatus('pending');
        return;
      }
      this._suspended.set(false);
      this.tenant.set(tenantId, tenant.name);
      this._tenants.update((all) =>
        all.map((t) => (t.id === tenantId && t.name !== tenant!.name ? { ...t, name: tenant!.name } : t)),
      );
      try {
        localStorage.setItem(TENANT_KEY, tenantId);
      } catch {
        // Sin localStorage: se elige otra vez al entrar.
      }
      this._member.set(member);
      const first = this._status() !== 'member';
      this.setStatus('member');
      const user = this._user();
      if (first && user) this.recordSignIn(user);
    };
    const lost = () => {
      this._member.set(null);
      this.tenant.set(null);
      this.setStatus('pending');
    };
    const stopMember = onSnapshot(
      doc(this.db, 'tenants', tenantId, 'members', uid),
      (snap) => {
        const data = snap.data();
        if (!data || data['active'] !== true) {
          member = null;
          lost();
          return;
        }
        member = {
          uid,
          email: data['email'],
          displayName: data['displayName'],
          photoURL: data['photoURL'] ?? null,
          role: data['role'],
          active: true,
        };
        apply();
      },
      () => lost(),
    );
    const stopTenant = onSnapshot(
      doc(this.db, 'tenants', tenantId),
      (snap) => {
        const data = snap.data();
        tenant = { name: data?.['name'] ?? '', active: data?.['active'] === true };
        apply();
      },
      () => lost(),
    );
    this.stopMember = () => {
      stopMember();
      stopTenant();
    };
  }
}
