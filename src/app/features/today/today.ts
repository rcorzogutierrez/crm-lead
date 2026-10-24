import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { Clock } from '../../core/clock.service';
import { addDays, agoLabel, dayDiff, moneyLabel, startOfDay } from '../../core/dates';
import { FollowUpsService } from '../../core/followups.service';
import { intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { FollowUp, Lead } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { ScheduleForm } from '../../shared/schedule-form';
import { StageBadge } from '../../shared/stage-badge';

interface HourRow {
  hour: number;
  label: string;
  items: FollowUp[];
}

/**
 * La página de hoy de la agenda: lo vencido arriba, luego las horas del día
 * con renglones, margen rojo y la cinta de "ahora".
 */
@Component({
  selector: 'app-today',
  imports: [RouterLink, FollowUpItem, ScheduleForm, StageBadge, EmptyState],
  templateUrl: './today.html',
})
export class Today {
  private readonly clock = inject(Clock);
  protected readonly auth = inject(AuthService);
  protected readonly followUps = inject(FollowUpsService);
  protected readonly leads = inject(LeadsService);
  protected readonly ui = inject(UiService);
  private readonly catalog = inject(CatalogService);

  /** Ver solo lo mío o todo el equipo. */
  protected readonly t = t;
  protected readonly scope = signal<'mine' | 'team'>('mine');
  protected readonly schedulingFor = signal<string | null>(null);

  private readonly mineOnly = (f: { assigneeId: string }) =>
    !this.auth.isAdmin() || this.scope() === 'team' || f.assigneeId === this.auth.uid();

  protected readonly overdue = computed(() => this.followUps.overdue().filter(this.mineOnly));
  protected readonly today = computed(() => this.followUps.today().filter(this.mineOnly));
  /** Propuestas abiertas cuyo precio oficial cambió. */
  protected readonly priceAlerts = computed(() =>
    this.leads.open().filter((l) => this.mineOnly(l) && this.catalog.hasPriceChange(l)),
  );
  protected readonly orphans = computed(() => this.leads.withoutNextStep().filter(this.mineOnly));

  protected readonly dateTitle = computed(() =>
    new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(this.clock.now()),
  );
  protected readonly year = computed(() => this.clock.now().getFullYear());

  /** Horas visibles: 8 a 19, ampliadas si hay citas fuera de ese rango. */
  protected readonly hours = computed<HourRow[]>(() => {
    const items = this.today();
    const hrs = items.map((f) => f.dueAt.getHours());
    const from = Math.min(8, ...hrs);
    const to = Math.max(19, ...hrs);
    const rows: HourRow[] = [];
    for (let h = from; h <= to; h++) {
      rows.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        items: items.filter((f) => f.dueAt.getHours() === h),
      });
    }
    return rows;
  });

  /** La cinta de "ahora" va dentro de la fila de la hora actual, a su minuto. */
  protected readonly nowHour = computed(() => this.clock.now().getHours());
  protected readonly nowPercent = computed(() => (this.clock.now().getMinutes() / 60) * 100);

  protected readonly nowLabel = computed(() =>
    new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(this.clock.now()),
  );

  /** Próximos 7 días agrupados por día. */
  protected readonly nextDays = computed(() => {
    const now = this.clock.now();
    const items = this.followUps.upcoming().filter(this.mineOnly);
    const days: { date: Date; label: string; items: FollowUp[] }[] = [];
    for (let i = 1; i <= 7; i++) {
      const date = startOfDay(addDays(now, i));
      const dayItems = items.filter((f) => dayDiff(now, f.dueAt) === i);
      if (dayItems.length) {
        days.push({
          date,
          label:
            i === 1
              ? t('due.tomorrow')
              : new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric' }).format(date),
          items: dayItems,
        });
      }
    }
    return days;
  });

  protected readonly pipelineValue = computed(() =>
    moneyLabel(this.leads.open().filter(this.mineOnly).reduce((sum, l) => sum + l.value, 0)),
  );
  protected readonly newThisWeek = computed(() => {
    const weekAgo = addDays(this.clock.now(), -7);
    return this.leads.leads().filter((l) => this.mineOnly(l) && l.createdAt && l.createdAt > weekAgo).length;
  });
  protected readonly openCount = computed(() => this.leads.open().filter(this.mineOnly).length);

  protected readonly summary = computed(() => {
    const parts: string[] = [];
    const o = this.overdue().length;
    const d = this.today().length;
    if (o) parts.push(t(o > 1 ? 'today.sum.overdueN' : 'today.sum.overdue1', { n: o }));
    parts.push(d ? t('today.sum.today', { n: d }) : t('today.sum.nothing'));
    const n = this.orphans().length;
    if (n) parts.push(t(n > 1 ? 'today.sum.orphansN' : 'today.sum.orphans1', { n }));
    return parts.join(' · ');
  });

  protected readonly loading = computed(() => this.followUps.loading() || this.leads.loading());

  protected isPast(r: HourRow): boolean {
    return r.hour < this.clock.now().getHours();
  }

  protected ago(l: Lead): string {
    return l.lastContactAt
      ? t('lead.lastContact', { ago: agoLabel(l.lastContactAt, this.clock.now()) })
      : t('lead.created', { ago: agoLabel(l.createdAt, this.clock.now()) });
  }
}
