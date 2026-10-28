import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { addDays } from '../../core/dates';
import { FollowUpsService } from '../../core/followups.service';
import { intlLocale, t } from '../../core/i18n/i18n';
import { CHANNELS, FollowUp, channelLabel } from '../../core/models';
import { MonthDay, monthAgenda, monthRange } from '../../core/month-agenda';
import { ChannelIcon } from '../../shared/channel-icon';

/**
 * El mes de la agenda: cada día con sus acciones por canal, para ver de un vistazo dónde se amontonan
 * y repartirlas. Tocar un día abre su página en la agenda.
 */
@Component({
  selector: 'app-agenda-month',
  imports: [RouterLink, ChannelIcon],
  templateUrl: './agenda-month.html',
})
export class AgendaMonth {
  private readonly clock = inject(Clock);
  private readonly auth = inject(AuthService);
  private readonly followUps = inject(FollowUpsService);

  /** Día 1 del mes que se muestra. */
  readonly month = input.required<Date>();
  /** Un admin con "Todo el equipo": todo; si no, solo lo suyo. */
  readonly team = input(false);
  /** Con "Todo el equipo", un solo vendedor elegido en la tabla del equipo. */
  readonly seller = input<string | null>(null);

  protected readonly t = t;
  protected readonly channels = CHANNELS;

  private readonly range = computed(() => monthRange(this.month()), {
    equal: (a, b) => a.start.getTime() === b.start.getTime(),
  });
  private readonly doneLive = this.followUps.doneIn(() => this.range());

  private readonly mine = (f: FollowUp) =>
    !this.auth.isAdmin() ||
    (this.team() ? !this.seller() || f.assigneeId === this.seller() : f.assigneeId === this.auth.uid());

  protected readonly agenda = computed(() =>
    monthAgenda(
      this.month(),
      this.followUps.pending().filter(this.mine),
      this.doneLive.data().filter(this.mine),
      this.clock.now(),
    ),
  );

  protected readonly loading = computed(() => this.followUps.loading() || this.doneLive.loading());
  readonly error = computed(() => this.doneLive.error());

  /** Iniciales de los días de la semana (lunes primero), en el idioma de la interfaz. */
  protected readonly weekdays = computed(() => {
    const start = this.range().start;
    const long = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long' });
    const short = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { long: long.format(d), short: short.format(d).replace('.', '') };
    });
  });

  protected readonly summary = computed(() => {
    const a = this.agenda();
    if (!a.total) return '';
    const parts = [t(a.total === 1 ? 'month.sum.total1' : 'month.sum.totalN', { n: a.total })];
    if (a.done) parts.push(t(a.done === 1 ? 'month.sum.done1' : 'month.sum.doneN', { n: a.done }));
    if (a.late) parts.push(t(a.late === 1 ? 'month.sum.late1' : 'month.sum.lateN', { n: a.late }));
    if (a.peak && a.peak.total > 1)
      parts.push(t('month.sum.peak', { day: this.dayName(a.peak.date), n: a.peak.total }));
    return parts.join(' · ');
  });

  /** Nombre accesible de la celda: fecha, acciones por canal y avisos. */
  protected label(d: MonthDay): string {
    const parts = [this.dayName(d.date)];
    parts.push(
      d.counts.length
        ? d.counts.map((c) => `${channelLabel(c.channel)}: ${c.n}`).join(', ')
        : t('month.cellEmpty'),
    );
    if (d.late) parts.push(t(d.late === 1 ? 'month.sum.late1' : 'month.sum.lateN', { n: d.late }));
    if (d.heavy) parts.push(t('month.heavy'));
    return parts.join('. ');
  }

  protected dayName(d: Date): string {
    return new Intl.DateTimeFormat(intlLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(d);
  }
}
