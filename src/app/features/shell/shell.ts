import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  LucideBookUser,
  LucideCalendarDays,
  LucideChartColumn,
  LucideClock,
  LucideEllipsis,
  LucideHandshake,
  LucideLogOut,
  LucidePlus,
  LucideSettings,
} from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { FollowUpsService } from '../../core/followups.service';
import { IdleService } from '../../core/idle.service';
import { UiService } from '../../core/ui.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { Avatar } from '../../shared/avatar';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';
import { CaptureDrawer } from './capture-drawer';

interface NavItem {
  path: string;
  label: I18nKey;
  icon: 'today' | 'contacts' | 'deals' | 'reports' | 'settings';
  match: readonly string[];
}

/** Marco de la app: riel pizarra (escritorio) o barra inferior (móvil). */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    Avatar,
    CaptureDrawer,
    Logo,
    LangSwitch,
    LucideBookUser,
    LucideCalendarDays,
    LucideChartColumn,
    LucideClock,
    LucideEllipsis,
    LucideHandshake,
    LucideLogOut,
    LucidePlus,
    LucideSettings,
  ],
  templateUrl: './shell.html',
  host: {
    class: 'block min-h-dvh lg:pl-60',
    '(document:keydown)': 'onKey($event)',
  },
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly ui = inject(UiService);
  protected readonly idle = inject(IdleService);
  private readonly followUps = inject(FollowUpsService);
  private readonly router = inject(Router);

  /** Lo que pide atención hoy: vencidos + de hoy. */
  private readonly mine = (f: { assigneeId: string }) => f.assigneeId === this.auth.uid();
  protected readonly dueCount = computed(
    () => this.followUps.overdue().filter(this.mine).length + this.followUps.today().filter(this.mine).length,
  );
  protected readonly hasOverdue = computed(() => this.followUps.overdue().some(this.mine));

  protected readonly t = t;

  /** Cuenta atrás del aviso de inactividad, como m:ss. */
  protected readonly idleLeft = computed(() => {
    const s = this.idle.remaining() ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(this.idle.watch());
    // Sesión cerrada desde otra pestaña (o por inactividad en ella): esta también vuelve a entrar.
    effect(() => {
      if (this.auth.status() !== 'signedOut') return;
      this.idle.signedOut();
      void this.router.navigateByUrl('/login');
    });
  }

  /**
   * Cinco entradas: Negocios reúne la lista y el tablero (vuelve a la última vista usada)
   * y Ajustes reúne servicios y equipo. `match` marca la entrada activa en sus subpáginas.
   */
  protected readonly nav = computed<readonly NavItem[]>(() => [
    { path: '/today', label: 'nav.today', icon: 'today', match: ['/today'] },
    { path: '/contacts', label: 'nav.contacts', icon: 'contacts', match: ['/contacts'] },
    { path: this.ui.dealsView(), label: 'nav.leads', icon: 'deals', match: ['/leads', '/pipeline'] },
    { path: '/reports', label: 'nav.reports', icon: 'reports', match: ['/reports'] },
    { path: '/services', label: 'nav.settings', icon: 'settings', match: ['/services', '/team'] },
  ]);
  /** Barra móvil: Hoy, Contactos y Negocios; el resto va en "Más". */
  protected readonly mobileMain = computed(() => this.nav().filter((n) => ['today', 'contacts', 'deals'].includes(n.icon)));
  protected readonly mobileMore = computed(() => this.nav().filter((n) => !['today', 'contacts', 'deals'].includes(n.icon)));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected isActive(item: NavItem): boolean {
    const path = this.url().split(/[?#]/)[0];
    return item.match.some((m) => path === m || path.startsWith(`${m}/`));
  }

  protected readonly moreOpen = signal(false);
  /** Menú de la cuenta en la barra superior móvil (nombre, rol y cerrar sesión). */
  protected readonly accountOpen = signal(false);

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && (this.moreOpen() || this.accountOpen())) {
      this.moreOpen.set(false);
      this.accountOpen.set(false);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || this.ui.captureOpen()) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    if (event.key === 'n') {
      event.preventDefault();
      this.ui.openCapture();
    } else if (event.key === '/') {
      event.preventDefault();
      // Buscar clientes: el punto de partida para venderle algo más a alguien que ya existe.
      void this.router.navigate(['/contacts']).then(() => document.getElementById('contact-search')?.focus());
    }
  }

  protected signOut(): void {
    void this.auth.signOut().then(() => this.router.navigateByUrl('/login'));
  }
}
