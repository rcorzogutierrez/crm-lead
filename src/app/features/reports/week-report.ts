import { Component, computed, inject } from '@angular/core';
import { dealTitle } from '../../core/deal-lines';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideCalendarRange, LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { Clock } from '../../core/clock.service';
import { addDays, moneyLabel } from '../../core/dates';
import { FollowUpsService } from '../../core/followups.service';
import { intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Lead, channelLabel, sourceLabel, lostReasonLabel, stageMeta, tierLabel, wonDate } from '../../core/models';
import { STALLED_DAYS, customRange, dayParam, inRange, lostDate, parseDay, weekRange, weekReport } from '../../core/reports';
import { DueChip } from '../../shared/due-chip';
import { RangePicker } from './range-picker';
import { ReportRow } from './report-row';

/** Cuántas filas se muestran por sección antes de mandar a la lista completa. */
const LIMIT = 8;
/** Ganados y perdidos: un rango largo puede traer muchos; se resume el resto. */
const LIST_LIMIT = 15;

/**
 * Informe del equipo (admin): qué entró, qué se ganó y perdió, qué se está cayendo y qué viene.
 * Por semanas (`?week=`) o en un rango elegido a mano (`?from=&to=`).
 */
@Component({
  selector: 'app-week-report',
  imports: [RouterLink, DueChip, ReportRow, RangePicker, LucideCalendarRange, LucideChevronLeft, LucideChevronRight],
  templateUrl: './week-report.html',
})
export class WeekReportView {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clock = inject(Clock);
  private readonly leads = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);

  protected readonly t = t;
  protected readonly lostLabel = lostReasonLabel;
  protected readonly money = moneyLabel;
  protected readonly limit = LIMIT;
  protected readonly listLimit = LIST_LIMIT;
  protected readonly stalledDays = STALLED_DAYS;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly current = computed(() => weekRange(this.clock.now()));
  /** Rango elegido a mano (`?from=&to=`, días incluidos); null = vista por semanas. */
  protected readonly custom = computed(() => {
    const from = parseDay(this.params().get('from'));
    const to = parseDay(this.params().get('to'));
    return from && to ? customRange(from, to) : null;
  });
  /** `?week=AAAA-MM-DD`: cualquier día de la semana; una semana futura muestra la actual. */
  protected readonly range = computed(() => {
    const custom = this.custom();
    if (custom) return custom;
    const day = parseDay(this.params().get('week'));
    const r = day ? weekRange(day) : this.current();
    return r.start > this.current().start ? this.current() : r;
  });
  protected readonly isCurrent = computed(() => this.range().start.getTime() === this.current().start.getTime());
  /** Vencidos, quietos y lo que viene son el estado de hoy: solo se muestran si el rango incluye hoy. */
  protected readonly showNow = computed(() => inRange(this.clock.now(), this.range()));
  protected readonly fromParam = computed(() => dayParam(this.range().start));
  protected readonly toParam = computed(() => dayParam(addDays(this.range().end, -1)));
  protected readonly today = computed(() => dayParam(this.clock.now()));

  protected readonly loading = computed(() => this.leads.loading() || this.followUps.loading());
  protected readonly error = computed(() => this.leads.error() || this.followUps.error());
  protected readonly report = computed(() => weekReport(this.leads.leads(), this.followUps.pending(), this.range(), this.clock.now()));

  protected readonly title = computed(() => {
    const { start, end } = this.range();
    const last = addDays(end, -1);
    // El año solo si el rango no es del año en curso.
    const otherYear = start.getFullYear() !== this.clock.now().getFullYear() || last.getFullYear() !== start.getFullYear();
    const f = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', ...(otherYear ? { year: 'numeric' } : {}) });
    const range = f.formatRange(start, last);
    return this.custom() ? range : t('report.weekOf', { range });
  });

  /** Resumen en una frase: entró, se ganó, se perdió. */
  protected readonly summary = computed(() => {
    const r = this.report();
    const n = r.created.length;
    const w = r.won.length;
    const l = r.lost.length;
    return t('report.sum', {
      leads: t(n === 0 ? 'report.sum.leads0' : n === 1 ? 'report.sum.leads1' : 'report.sum.leadsN', { n }),
      won: t(w === 0 ? 'report.sum.won0' : w === 1 ? 'report.sum.won1' : 'report.sum.wonN', { n: w, value: moneyLabel(r.wonTotal) }),
      lost: t(l === 0 ? 'report.sum.lost0' : l === 1 ? 'report.sum.lost1' : 'report.sum.lostN', { n: l }),
    });
  });

  protected readonly sources = computed(() => {
    const rows = this.report().bySource;
    const max = Math.max(1, ...rows.map((s) => s.count));
    return rows.map((s) => ({ label: sourceLabel(s.source), count: s.count, pct: (s.count / max) * 100 }));
  });

  protected readonly upcoming = computed(() => {
    const days = this.report().upcoming;
    const max = Math.max(1, ...days.map((d) => d.count));
    const f = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric' });
    return days.map((d) => ({ label: f.format(d.day).replace('.', ''), count: d.count, pct: (d.count / max) * 100 }));
  });
  protected readonly upcomingTotal = computed(() => this.report().upcoming.reduce((a, d) => a + d.count, 0));

  protected dayLabel(d: Date | null): string {
    return d ? new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric' }).format(d).replace('.', '') : '';
  }

  protected wonDay(l: Lead): string {
    return this.dayLabel(wonDate(l));
  }

  protected lostDay(l: Lead): string {
    return this.dayLabel(lostDate(l));
  }

  /** "Servicio B · Plata · Ana": lo que se vendió, en qué categoría y quién. */
  protected dealMeta(l: Lead, withTier: boolean): string {
    const parts = [dealTitle(l) || l.company];
    if (withTier && l.serviceId) parts.push(tierLabel(l.tier));
    parts.push(this.members.name(l.assigneeId));
    return parts.filter(Boolean).join(' · ');
  }

  protected stalledMeta(l: Lead): string {
    return [stageMeta(l.stage).label, l.value ? moneyLabel(l.value) : '', this.members.name(l.assigneeId)].filter(Boolean).join(' · ');
  }

  protected followUpMeta(note: string, channel: Parameters<typeof channelLabel>[0], assigneeId: string): string {
    return [note || channelLabel(channel), this.members.name(assigneeId)].join(' · ');
  }

  protected orphanMeta(l: Lead): string {
    return [stageMeta(l.stage).label, this.members.name(l.assigneeId)].join(' · ');
  }

  protected go(weeks: number): void {
    const start = addDays(this.range().start, weeks * 7);
    this.setWeek(start >= this.current().start ? null : dayParam(start));
  }

  protected thisWeek(): void {
    this.setParams({ week: null, from: null, to: null });
  }

  /** Pasa a elegir fechas, empezando por la semana que se está viendo. */
  protected pickDates(): void {
    this.setParams({ week: null, from: this.fromParam(), to: this.toParam() });
  }

  protected setRange(r: { from: string; to: string }): void {
    this.setParams({ week: null, from: r.from, to: r.to });
  }

  private setWeek(week: string | null): void {
    this.setParams({ week, from: null, to: null });
  }

  private setParams(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

