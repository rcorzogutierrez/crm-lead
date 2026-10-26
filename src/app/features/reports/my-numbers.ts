import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { addDays, moneyLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { PriceTier, stageMeta, tierLabel } from '../../core/models';
import { Period, customRange, dayParam, followUpScore, myNumbers, parseDay, periodRange, precedingRange, previousRange, rangeDays } from '../../core/reports';
import { RangePicker } from './range-picker';

type Choice = Period | 'custom';

const PERIODS: readonly { id: Period; label: I18nKey; current: I18nKey; previous: I18nKey }[] = [
  { id: 'week', label: 'report.period.week', current: 'report.period.thisWeek', previous: 'report.period.prevWeek' },
  { id: 'month', label: 'report.period.month', current: 'report.period.thisMonth', previous: 'report.period.prevMonth' },
  { id: 'quarter', label: 'report.period.quarter', current: 'report.period.thisQuarter', previous: 'report.period.prevQuarter' },
];

/** Tono de cada categoría: la misma tinta índigo, más intensa cuanto más alta. */
const TIER_TONE: Record<PriceTier, string> = {
  bronze: 'bg-pen/25',
  silver: 'bg-pen/60',
  gold: 'bg-pen',
};

/** Mis números: lo que ve cada vendedor de sí mismo (también el admin, sobre sus propios leads). */
@Component({
  selector: 'app-my-numbers',
  imports: [RouterLink, RangePicker, LucideChevronRight],
  templateUrl: './my-numbers.html',
})
export class MyNumbersView {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clock = inject(Clock);
  private readonly auth = inject(AuthService);
  private readonly leads = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);

  protected readonly t = t;
  protected readonly money = moneyLabel;
  protected readonly periods = PERIODS;
  protected readonly tierTone = TIER_TONE;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  /** Rango elegido a mano (`?period=custom&from=&to=`); sin fechas válidas, del día 1 del mes a hoy. */
  protected readonly custom = computed(() => {
    if (this.params().get('period') !== 'custom') return null;
    const now = this.clock.now();
    const from = parseDay(this.params().get('from')) ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseDay(this.params().get('to')) ?? now;
    return customRange(from, to);
  });
  protected readonly period = computed<Choice>(() => {
    const p = this.params().get('period');
    return p === 'week' || p === 'quarter' || p === 'custom' ? p : 'month';
  });
  private readonly meta = computed(() => PERIODS.find((p) => p.id === this.period()));
  protected readonly range = computed(() => {
    const p = this.period();
    return p === 'custom' ? this.custom()! : periodRange(p, this.clock.now());
  });
  /** Un rango a mano se compara con los mismos días justo antes. */
  private readonly prev = computed(() => {
    const p = this.period();
    return p === 'custom' ? precedingRange(this.range()) : previousRange(p, this.range());
  });
  protected readonly fromParam = computed(() => dayParam(this.range().start));
  protected readonly toParam = computed(() => dayParam(addDays(this.range().end, -1)));
  protected readonly today = computed(() => dayParam(this.clock.now()));

  protected readonly rangeLabel = computed(() => {
    const { start, end } = this.range();
    const otherYear = start.getFullYear() !== this.clock.now().getFullYear() || addDays(end, -1).getFullYear() !== start.getFullYear();
    const f = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', ...(otherYear ? { year: 'numeric' } : {}) });
    return f.formatRange(this.range().start, addDays(this.range().end, -1));
  });

  protected readonly loading = this.leads.loading;
  protected readonly error = this.leads.error;
  private readonly mine = computed(() => this.leads.leads().filter((l) => l.assigneeId === this.auth.uid()));
  protected readonly n = computed(() => myNumbers(this.mine(), this.range(), this.prev()));
  protected readonly overdue = computed(() => this.followUps.overdue().filter((f) => f.assigneeId === this.auth.uid()).length);

  /** Follow-ups hechos con fecha en el periodo: se piden a Firestore (la app solo escucha los pendientes). */
  private readonly done = resource({
    params: () => ({ uid: this.auth.uid(), start: this.range().start, end: this.range().end }),
    loader: ({ params }) => this.followUps.doneBetween(params.uid, params.start, params.end),
  });
  protected readonly doneLoading = this.done.isLoading;
  protected readonly doneError = computed(() => (this.done.error() ? firestoreErrorMessage(this.done.error()) : ''));
  protected readonly score = computed(() => {
    if (!this.done.hasValue()) return null;
    const s = followUpScore(this.done.value());
    const total = s.onTime + s.late;
    return { ...s, total, pct: total ? Math.round((s.onTime / total) * 100) : 0 };
  });

  protected readonly currentLabel = computed(() => {
    const m = this.meta();
    return m ? t(m.current) : t('report.period.thisRange');
  });
  protected readonly previousLabel = computed(() => {
    const m = this.meta();
    return m ? t(m.previous) : t('report.period.prevRange', { n: rangeDays(this.range()) });
  });

  /** Barras de "lo que vendí": este periodo frente al anterior, a la misma escala. */
  protected readonly compare = computed(() => {
    const { wonTotal, prevTotal } = this.n();
    const max = Math.max(wonTotal, prevTotal, 1);
    return { current: (wonTotal / max) * 100, previous: (prevTotal / max) * 100 };
  });

  protected readonly openRows = computed(() => {
    const rows = this.n().open;
    const max = Math.max(1, ...rows.map((r) => r.value));
    return rows.map((r) => ({ ...r, label: stageMeta(r.stage).label, dot: stageMeta(r.stage).dot, pct: (r.value / max) * 100 }));
  });

  protected readonly tiers = computed(() => this.n().tiers.map((x) => ({ ...x, label: tierLabel(x.tier) })));
  protected readonly tierTotal = computed(() => this.n().tiers.reduce((a, x) => a + x.count, 0));

  protected setPeriod(period: Choice): void {
    // Personalizado empieza con las fechas del periodo que se estaba viendo.
    const custom = period === 'custom' ? { from: this.fromParam(), to: this.toParam() } : { from: null, to: null };
    this.navigate({ period: period === 'month' ? null : period, ...custom });
  }

  protected setRange(r: { from: string; to: string }): void {
    this.navigate({ period: 'custom', from: r.from, to: r.to });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
