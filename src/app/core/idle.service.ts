import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Minutos sin actividad que cierran la sesión. */
export const IDLE_MINUTES = 10;
const LIMIT = IDLE_MINUTES * 60_000;
/** Aviso previo con cuenta atrás (WCAG 2.2.1: avisar y dejar alargar con una acción simple). */
const WARN = 60_000;
/** Última actividad compartida entre pestañas: la actividad en cualquiera cuenta para todas. */
const STORAGE_KEY = 'crm-lead.lastActivity';
/** Cada cuánto se guarda la actividad en localStorage (el `storage` avisa a las demás pestañas). */
const SHARE_EVERY = 5_000;
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(value: number | null): void {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Sin localStorage: cada pestaña cuenta solo su propia actividad.
  }
}

/**
 * Cierre de sesión por inactividad.
 *
 * - `watch()` lo arranca el marco de la app (solo miembros). Ratón, teclado, toque o scroll
 *   reinician el contador; la marca se comparte en localStorage para que cuente en todas las pestañas.
 * - En el último minuto `remaining` lleva la cuenta atrás para el aviso del marco.
 * - Al llegar a 10 minutos: cierra la sesión de Firebase y lleva a /login, que explica el motivo.
 * - La comprobación también corre al volver a la pestaña o con la primera actividad, porque los
 *   temporizadores se congelan con el equipo suspendido o en pestañas de fondo.
 * - Una sesión restaurada con la marca caducada (navegador cerrado sin salir) se cierra al abrir.
 */
@Service()
export class IdleService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private last = 0;
  private shared = 0;
  private stopWatch: (() => void) | null = null;

  private readonly _remaining = signal<number | null>(null);
  private readonly _endedByIdle = signal(false);
  /** Segundos que faltan para el cierre, solo durante el aviso; `null` fuera de él. */
  readonly remaining = this._remaining.asReadonly();
  /** La última sesión terminó por inactividad (lo muestra la pantalla de entrar). */
  readonly endedByIdle = this._endedByIdle.asReadonly();

  watch(): () => void {
    this.stopWatch?.();
    this._endedByIdle.set(false);
    const now = Date.now();
    const stored = readShared();
    if (stored && now - stored >= LIMIT) {
      this.expire();
      return () => undefined;
    }
    this.last = now;
    this.share(now);

    const onActivity = () => this.activity();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      this.last = Math.max(this.last, Number(e.newValue) || 0);
      this.tick();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.tick();
    };
    const opts = { capture: true, passive: true };
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, opts));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => this.tick(), 1_000);

    const stop = () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, opts));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
      this._remaining.set(null);
      if (this.stopWatch === stop) this.stopWatch = null;
    };
    this.stopWatch = stop;
    return stop;
  }

  /** Cuenta como actividad (botón "Seguir conectado"; el resto llega por los eventos). */
  stayActive(): void {
    this.activity();
  }

  /** La sesión se cerró por otra vía (otra pestaña, botón "Cerrar sesión"): no hay marca que heredar. */
  signedOut(): void {
    this.stopWatch?.();
    // Si fue por inactividad en otra pestaña, esta también lo explica.
    if (this.last && Date.now() - this.last >= LIMIT) this._endedByIdle.set(true);
    writeShared(null);
  }

  /** Se va a entrar de nuevo: olvida una marca vieja que cerraría la sesión nueva al abrirla. */
  reset(): void {
    writeShared(null);
  }

  private activity(): void {
    const now = Date.now();
    if (now - this.last < 1_000) return;
    // La actividad que despierta una pestaña congelada no rescata una sesión ya caducada.
    if (now - Math.max(this.last, readShared()) >= LIMIT) {
      this.expire();
      return;
    }
    this.last = now;
    this._remaining.set(null);
    this.share(now);
  }

  private share(now: number): void {
    if (now - this.shared < SHARE_EVERY) return;
    this.shared = now;
    writeShared(now);
  }

  private tick(): void {
    const left = LIMIT - (Date.now() - this.last);
    if (left <= 0) {
      this.expire();
      return;
    }
    this._remaining.set(left <= WARN ? Math.ceil(left / 1_000) : null);
  }

  private expire(): void {
    this.stopWatch?.();
    this._endedByIdle.set(true);
    writeShared(null);
    void this.auth.signOut().finally(() => this.router.navigateByUrl('/login'));
  }
}
