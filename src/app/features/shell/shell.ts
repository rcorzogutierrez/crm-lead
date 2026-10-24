import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBookUser,
  LucideCalendarDays,
  LucideColumns3,
  LucideEllipsis,
  LucidePackage,
  LucideLogOut,
  LucidePlus,
  LucideUsers,
  LucideUserRoundCog,
} from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { FollowUpsService } from '../../core/followups.service';
import { UiService } from '../../core/ui.service';
import { I18nKey, t } from '../../core/i18n/i18n';
import { Avatar } from '../../shared/avatar';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';
import { CaptureDrawer } from './capture-drawer';

interface NavItem {
  path: string;
  label: I18nKey;
  icon: 'today' | 'contacts' | 'leads' | 'pipeline' | 'services' | 'team';
}

/** Marco de la app: riel pizarra (escritorio) o barra inferior (móvil). */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Avatar,
    CaptureDrawer,
    Logo,
    LangSwitch,
    LucideBookUser,
    LucideCalendarDays,
    LucideColumns3,
    LucideEllipsis,
    LucidePackage,
    LucideLogOut,
    LucidePlus,
    LucideUsers,
    LucideUserRoundCog,
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
  private readonly followUps = inject(FollowUpsService);
  private readonly router = inject(Router);

  /** Lo que pide atención hoy: vencidos + de hoy. */
  private readonly mine = (f: { assigneeId: string }) => f.assigneeId === this.auth.uid();
  protected readonly dueCount = computed(
    () => this.followUps.overdue().filter(this.mine).length + this.followUps.today().filter(this.mine).length,
  );
  protected readonly hasOverdue = computed(() => this.followUps.overdue().some(this.mine));

  protected readonly t = t;

  protected readonly nav: readonly NavItem[] = [
    { path: '/today', label: 'nav.today', icon: 'today' },
    { path: '/contacts', label: 'nav.contacts', icon: 'contacts' },
    { path: '/leads', label: 'nav.leads', icon: 'leads' },
    { path: '/pipeline', label: 'nav.pipeline', icon: 'pipeline' },
    { path: '/services', label: 'nav.services', icon: 'services' },
    { path: '/team', label: 'nav.team', icon: 'team' },
  ];
  /** Barra móvil: los cuatro más usados; el resto va en "Más". */
  protected readonly mobileMain = this.nav.filter((n) => ['today', 'contacts', 'pipeline'].includes(n.icon));
  protected readonly mobileMore = this.nav.filter((n) => !['today', 'contacts', 'pipeline'].includes(n.icon));
  protected readonly moreOpen = signal(false);

  protected onKey(event: KeyboardEvent): void {
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
