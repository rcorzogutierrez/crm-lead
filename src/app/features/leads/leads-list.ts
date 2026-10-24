import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowDown, LucideArrowUp, LucideSearch, LucideX } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { agoLabel, moneyLabel } from '../../core/dates';
import { intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Lead, SOURCES, STAGES, isClosed, sourceLabel } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { Avatar } from '../../shared/avatar';
import { DueChip } from '../../shared/due-chip';
import { EmptyState } from '../../shared/empty-state';
import { StageBadge } from '../../shared/stage-badge';

type SortKey = 'next' | 'name' | 'value' | 'created' | 'contact';

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lista de leads con búsqueda, filtros y orden, sincronizados con la URL. */
@Component({
  selector: 'app-leads-list',
  imports: [RouterLink, StageBadge, DueChip, Avatar, EmptyState, LucideSearch, LucideX, LucideArrowUp, LucideArrowDown],
  templateUrl: './leads-list.html',
})
export class LeadsList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clock = inject(Clock);
  private readonly auth = inject(AuthService);
  protected readonly leadsService = inject(LeadsService);
  protected readonly members = inject(MembersService);
  protected readonly ui = inject(UiService);

  protected readonly t = t;
  protected readonly stages = STAGES;
  protected readonly sources = SOURCES;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly search = computed(() => this.params().get('buscar') ?? '');
  protected readonly stage = computed(() => this.params().get('etapa') ?? 'abiertos');
  protected readonly source = computed(() => this.params().get('origen') ?? '');
  protected readonly assignee = computed(() => this.params().get('responsable') ?? '');
  protected readonly onlyOrphans = computed(() => this.params().get('filtro') === 'sin-accion');

  protected readonly sortKey = signal<SortKey>('next');
  protected readonly sortAsc = signal(true);

  protected readonly filtered = computed(() => {
    const q = normalize(this.search().trim());
    const stage = this.stage();
    const source = this.source();
    const assignee = this.assignee() === 'yo' ? this.auth.uid() : this.assignee();
    const orphans = this.onlyOrphans();

    const list = this.leadsService.leads().filter((l) => {
      if (stage === 'abiertos' && isClosed(l.stage)) return false;
      if (stage !== 'abiertos' && stage !== 'todos' && l.stage !== stage) return false;
      if (source && l.source !== source) return false;
      if (assignee && l.assigneeId !== assignee) return false;
      if (orphans && (isClosed(l.stage) || l.nextFollowUpAt)) return false;
      if (q) {
        const hay = normalize(`${l.name} ${l.company} ${l.email} ${l.phone}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = this.sortAsc() ? 1 : -1;
    const key = this.sortKey();
    const far = Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => {
      switch (key) {
        case 'name':
          return dir * a.name.localeCompare(b.name, intlLocale());
        case 'value':
          return dir * (a.value - b.value);
        case 'created':
          return dir * ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
        case 'contact':
          return dir * ((a.lastContactAt?.getTime() ?? 0) - (b.lastContactAt?.getTime() ?? 0));
        default: {
          // Sin próxima acción primero (es lo urgente), luego por fecha.
          const av = a.nextFollowUpAt?.getTime() ?? (isClosed(a.stage) ? far : -far);
          const bv = b.nextFollowUpAt?.getTime() ?? (isClosed(b.stage) ? far : -far);
          return dir * (av - bv);
        }
      }
    });
  });

  protected readonly totalValue = computed(() => moneyLabel(this.filtered().reduce((s, l) => s + l.value, 0)));
  protected readonly hasFilters = computed(
    () => !!(this.search() || this.source() || this.assignee() || this.onlyOrphans() || this.stage() !== 'abiertos'),
  );

  protected setParam(key: string, value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortAsc.update((v) => !v);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(key === 'name' || key === 'next');
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey() === key ? (this.sortAsc() ? 'ascending' : 'descending') : 'none';
  }

  protected open(lead: Lead): void {
    void this.router.navigate(['/leads', lead.id]);
  }

  protected contact(l: Lead): string {
    return agoLabel(l.lastContactAt, this.clock.now());
  }

  protected money = moneyLabel;
  protected sourceName = sourceLabel;
  protected closed = isClosed;
}
