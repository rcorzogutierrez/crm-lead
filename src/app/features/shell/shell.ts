import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideCalendarDays,
  LucideColumns3,
  LucideLogOut,
  LucidePlus,
  LucideUsers,
  LucideUserRoundCog,
} from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { FollowUpsService } from '../../core/followups.service';
import { UiService } from '../../core/ui.service';
import { Avatar } from '../../shared/avatar';
import { Logo } from '../../shared/logo';
import { CaptureDrawer } from './capture-drawer';

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
    LucideCalendarDays,
    LucideColumns3,
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

  protected readonly nav = [
    { path: '/hoy', label: 'Hoy', icon: 'today' },
    { path: '/leads', label: 'Leads', icon: 'leads' },
    { path: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
    { path: '/equipo', label: 'Equipo', icon: 'team' },
  ] as const;

  protected onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || this.ui.captureOpen()) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    if (event.key === 'n') {
      event.preventDefault();
      this.ui.openCapture();
    } else if (event.key === '/') {
      event.preventDefault();
      void this.router.navigate(['/leads'], { queryParams: { buscar: '' }, queryParamsHandling: 'merge' }).then(() =>
        document.getElementById('lead-search')?.focus(),
      );
    }
  }

  protected signOut(): void {
    void this.auth.signOut().then(() => this.router.navigateByUrl('/entrar'));
  }
}
