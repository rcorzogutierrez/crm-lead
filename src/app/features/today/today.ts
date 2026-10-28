import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideCheck, LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { Clock } from '../../core/clock.service';
import { addDays, agoLabel, dayDiff, moneyLabel, startOfDay } from '../../core/dates';
import { FollowUpsService } from '../../core/followups.service';
import { intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { FollowUp, Lead, channelLabel } from '../../core/models';
import { dayParam, monthParam, parseDay, parseMonth } from '../../core/reports';
import { UiService } from '../../core/ui.service';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { ScheduleForm } from '../../shared/schedule-form';
import { StageBadge } from '../../shared/stage-badge';
import { ChannelIcon } from '../../shared/channel-icon';
import { AgendaMonth } from './agenda-month';

interface HourRow {
  hour: number;
  label: string;
  items: FollowUp[];
  /** Hechos en esa hora (se ven atenuados, sin acciones). */
  done: FollowUp[];
}

/**
 * La agenda: la página de un día (hoy por defecto, `?date=AAAA-MM-DD` para otro) con lo vencido arriba,
 * las horas con renglones, margen rojo y la cinta de "ahora"; o el mes entero (`?view=month&month=AAAA-MM`).
 */
@Component({
  selector: 'app-today',
  imports: [RouterLink, FollowUpItem, ScheduleForm, StageBadge, EmptyState, ChannelIcon, AgendaMonth, LucideCheck, LucideChevronLeft, LucideChevronRight],
  templateUrl: './today.html',
})
export class Today {
  private readonly clock = inject(Clock);
  private readonly route = inject(ActivatedRoute);
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

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly view = computed(() => (this.params().get('view') === 'month' ? 'month' : 'day'));
  /** Día que se mira; sin `?date=`, hoy. */
  protected readonly day = computed(() => parseDay(this.params().get('date')) ?? startOfDay(this.clock.now()), {
    equal: (a, b) => a.getTime() === b.getTime(),
  });
  protected readonly isToday = computed(() => dayDiff(this.clock.now(), this.day()) === 0);
  protected readonly isPastDay = computed(() => dayDiff(this.clock.now(), this.day()) < 0);
  /** Mes que se mira en la vista Mes; sin `?month=`, el del día. */
  protected readonly month = computed(
    () => parseMonth(this.params().get('month')) ?? new Date(this.day().getFullYear(), this.day().getMonth(), 1),
    { equal: (a, b) => a.getTime() === b.getTime() },
  );
  protected readonly isThisMonth = computed(() => monthParam(this.month()) === monthParam(this.clock.now()));
  protected readonly monthKey = computed(() => monthParam(this.month()));

  /** `date` para un día a `offset` del que se mira; hoy va sin parámetro. */
  protected dayLink(offset: number): string | null {
    const d = addDays(this.day(), offset);
    return dayDiff(this.clock.now(), d) === 0 ? null : dayParam(d);
  }

  /** `month` para un mes a `offset` del que se mira; el actual va sin parámetro. */
  protected monthLink(offset: number): string | null {
    const m = monthParam(new Date(this.month().getFullYear(), this.month().getMonth() + offset, 1));
    return m === monthParam(this.clock.now()) ? null : m;
  }

  protected readonly overdue = computed(() => this.followUps.overdue().filter(this.mineOnly));
  /** Pendientes del día que se mira (hoy, uno pasado con lo que quedó sin hacer, o uno futuro). */
  protected readonly today = computed(() =>
    this.isToday()
      ? this.followUps.today().filter(this.mineOnly)
      : this.followUps.pending().filter((f) => this.mineOnly(f) && dayDiff(this.day(), f.dueAt) === 0),
  );
  private readonly doneLive = this.followUps.doneIn(() =>
    this.view() === 'day' ? { start: this.day(), end: addDays(this.day(), 1) } : null,
  );
  protected readonly done = computed(() => this.doneLive.data().filter(this.mineOnly));
  /** Propuestas abiertas cuyo precio oficial cambió. */
  protected readonly priceAlerts = computed(() =>
    this.leads.open().filter((l) => this.mineOnly(l) && this.catalog.hasPriceChange(l)),
  );
  protected readonly orphans = computed(() => this.leads.withoutNextStep().filter(this.mineOnly));

  protected readonly dateTitle = computed(() =>
    this.view() === 'month'
      ? new Intl.DateTimeFormat(intlLocale(), { month: 'long' }).format(this.month())
      : new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(this.day()),
  );
  protected readonly year = computed(() => (this.view() === 'month' ? this.month() : this.day()).getFullYear());

  /** Horas visibles: 8 a 19, ampliadas si hay citas fuera de ese rango. */
  protected readonly hours = computed<HourRow[]>(() => {
    const items = this.today();
    const done = this.done();
    const hrs = [...items, ...done].map((f) => f.dueAt.getHours());
    const from = Math.min(8, ...hrs);
    const to = Math.max(19, ...hrs);
    const rows: HourRow[] = [];
    for (let h = from; h <= to; h++) {
      rows.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        items: items.filter((f) => f.dueAt.getHours() === h),
        done: done.filter((f) => f.dueAt.getHours() === h),
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
    if (!this.isToday()) return this.daySummary();
    const parts: string[] = [];
    const o = this.overdue().length;
    const d = this.today().length;
    if (o) parts.push(t(o > 1 ? 'today.sum.overdueN' : 'today.sum.overdue1', { n: o }));
    const done = this.done().length;
    if (d || !done) parts.push(d ? t('today.sum.today', { n: d }) : t('today.sum.nothing'));
    if (done) parts.push(t(done > 1 ? 'today.sum.doneN' : 'today.sum.done1', { n: done }));
    const n = this.orphans().length;
    if (n) parts.push(t(n > 1 ? 'today.sum.orphansN' : 'today.sum.orphans1', { n }));
    return parts.join(' · ');
  });

  /** Resumen de un día que no es hoy: lo que quedó sin hacer o lo programado, y lo hecho. */
  private daySummary(): string {
    const parts: string[] = [];
    const p = this.today().length;
    const d = this.done().length;
    if (p) {
      parts.push(
        this.isPastDay()
          ? t(p > 1 ? 'today.sum.overdueN' : 'today.sum.overdue1', { n: p })
          : t(p > 1 ? 'today.sum.scheduledN' : 'today.sum.scheduled1', { n: p }),
      );
    }
    if (d) parts.push(t(d > 1 ? 'today.sum.doneN' : 'today.sum.done1', { n: d }));
    return parts.length ? parts.join(' · ') : t('today.sum.dayEmpty');
  }

  protected readonly loading = computed(() => this.followUps.loading() || this.leads.loading());
  protected readonly error = computed(() => this.followUps.error() || this.leads.error() || this.doneLive.error());

  protected isPast(r: HourRow): boolean {
    return this.isPastDay() || (this.isToday() && r.hour < this.clock.now().getHours());
  }

  /** Título de la página de un día que no es hoy: "Mañana", "Ayer" o la fecha corta. */
  protected dayHeading(): string {
    const diff = dayDiff(this.clock.now(), this.day());
    if (diff === 1) return t('due.tomorrow');
    if (diff === -1) return t('today.yesterday');
    return new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric' }).format(this.day());
  }

  protected dayKey(d: Date): string {
    return dayParam(d);
  }

  protected channelName(f: FollowUp): string {
    return channelLabel(f.channel);
  }

  protected timeOf(f: FollowUp): string {
    return `${String(f.dueAt.getHours()).padStart(2, '0')}:${String(f.dueAt.getMinutes()).padStart(2, '0')}`;
  }

  protected ago(l: Lead): string {
    return l.lastContactAt
      ? t('lead.lastContact', { ago: agoLabel(l.lastContactAt, this.clock.now()) })
      : t('lead.created', { ago: agoLabel(l.createdAt, this.clock.now()) });
  }
}
