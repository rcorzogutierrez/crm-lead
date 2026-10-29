import { Component, computed, inject, input, model } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { moneyLabel } from '../../core/dates';
import { FollowUpsService } from '../../core/followups.service';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { FollowUp } from '../../core/models';
import { teamDay } from '../../core/team-day';
import { Avatar } from '../../shared/avatar';

/**
 * Cómo va el día de cada vendedor (solo admin, "Todo el equipo"): hechos de hoy, vencidos,
 * negocios sin próxima acción y ventas de hoy. Tocar un nombre deja la agenda solo con lo suyo.
 */
@Component({
  selector: 'app-team-day-table',
  imports: [Avatar],
  host: { class: 'block' },
  template: `
    <section class="sheet overflow-hidden" aria-labelledby="team-day-title">
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5">
        <h2 id="team-day-title" class="section-title">{{ t('today.team.title') }}</h2>
        @if (selectedName(); as name) {
          <p class="text-sm text-ink-2" aria-live="polite">{{ t('today.team.showing', { name }) }}</p>
          <button type="button" class="ml-auto btn-ghost btn-sm text-pen hover:text-pen-strong" (click)="seller.set(null)">
            {{ t('today.team.clear') }}
          </button>
        }
      </header>
      <!-- Móvil: una fila apilada por vendedor -->
      <ul class="divide-y divide-rule sm:hidden">
        @for (r of rows(); track r.uid) {
          <li class="px-4 py-2.5" [class.bg-pen-soft]="seller() === r.uid">
            <button
              type="button"
              class="flex min-h-8 max-w-full items-center gap-2 text-left font-semibold"
              [attr.aria-pressed]="seller() === r.uid"
              [attr.aria-label]="t('today.team.filter', { name: r.name })"
              (click)="seller.set(seller() === r.uid ? null : r.uid)"
            >
              <app-avatar [name]="r.name" [photo]="r.photo" size="sm" />
              <span class="truncate">{{ r.name }}</span>
              @if (r.uid === auth.uid()) {
                <span class="shrink-0 font-normal text-ink-3">{{ t('today.team.you') }}</span>
              }
            </button>
            <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-8 text-[0.8125rem] text-ink-2 tabular">
              <span>{{ r.planned ? t('today.team.doneOfN', { done: r.done, n: r.planned }) : t('today.team.nothing') }}</span>
              @if (r.overdue) {
                <span class="rounded bg-ribbon px-1.5 py-0.5 text-xs font-bold text-white">{{
                  t(r.overdue === 1 ? 'today.sum.overdue1' : 'today.sum.overdueN', { n: r.overdue })
                }}</span>
              }
              @if (r.orphans) {
                <span class="rounded border-[1.5px] border-dashed border-ribbon px-1.5 py-px text-xs font-bold text-ribbon">{{
                  t(r.orphans === 1 ? 'today.team.orphans1' : 'today.team.orphansN', { n: r.orphans })
                }}</span>
              }
              @if (r.wonCount) {
                <span class="font-semibold text-ink">{{ t(r.wonCount === 1 ? 'today.team.sale1' : 'today.team.saleN', { n: r.wonCount, amount: money(r.wonTotal) }) }}</span>
              }
            </p>
          </li>
        }
      </ul>
      <div class="hidden overflow-x-auto sm:block">
        <table class="w-full min-w-[34rem] text-sm">
          <thead>
            <tr class="border-b border-rule text-xs text-ink-3">
              <th scope="col" class="w-full max-w-0 px-4 py-2 text-left font-bold">{{ t('today.team.seller') }}</th>
              <th scope="col" class="px-3 py-2 text-left font-bold whitespace-nowrap">{{ t('today.team.done') }}</th>
              <th scope="col" class="px-3 py-2 text-right font-bold whitespace-nowrap">{{ t('today.team.overdue') }}</th>
              <th scope="col" class="px-3 py-2 text-right font-bold whitespace-nowrap">{{ t('today.orphans') }}</th>
              <th scope="col" class="px-4 py-2 text-right font-bold whitespace-nowrap">{{ t('today.team.sales') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-rule">
            @for (r of rows(); track r.uid) {
              <tr [class.bg-pen-soft]="seller() === r.uid">
                <td class="w-full max-w-0 px-4 py-2">
                  <button
                    type="button"
                    class="flex max-w-full items-center gap-2 rounded-md text-left font-semibold hover:text-pen"
                    [attr.aria-pressed]="seller() === r.uid"
                    [attr.aria-label]="t('today.team.filter', { name: r.name })"
                    (click)="seller.set(seller() === r.uid ? null : r.uid)"
                  >
                    <app-avatar [name]="r.name" [photo]="r.photo" size="sm" />
                    <span class="truncate">{{ r.name }}</span>
                    @if (r.uid === auth.uid()) {
                      <span class="shrink-0 font-normal text-ink-3">{{ t('today.team.you') }}</span>
                    }
                  </button>
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  @if (r.planned) {
                    <span class="inline-flex items-center gap-2 tabular">
                      <span class="h-1.5 w-14 overflow-hidden rounded-full bg-rule" aria-hidden="true">
                        <span class="block h-full rounded-full bg-ok" [style.width.%]="(r.done / r.planned) * 100"></span>
                      </span>
                      {{ t('today.team.ofN', { done: r.done, n: r.planned }) }}
                    </span>
                  } @else {
                    <span class="text-ink-3">{{ t('today.team.nothing') }}</span>
                  }
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap tabular">
                  @if (r.overdue) {
                    <span class="rounded bg-ribbon px-1.5 py-0.5 text-xs font-bold text-white">{{
                      t(r.overdue === 1 ? 'today.sum.overdue1' : 'today.sum.overdueN', { n: r.overdue })
                    }}</span>
                  } @else {
                    <span class="text-ink-3">0</span>
                  }
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap tabular">
                  @if (r.orphans) {
                    <span class="rounded border-[1.5px] border-dashed border-ribbon px-1.5 py-px text-xs font-bold text-ribbon">{{
                      t(r.orphans === 1 ? 'today.team.orphans1' : 'today.team.orphansN', { n: r.orphans })
                    }}</span>
                  } @else {
                    <span class="text-ink-3">0</span>
                  }
                </td>
                <td class="px-4 py-2 text-right whitespace-nowrap tabular">
                  @if (r.wonCount) {
                    <span class="font-semibold">{{ t('today.team.salesN', { n: r.wonCount, amount: money(r.wonTotal) }) }}</span>
                  } @else {
                    <span class="text-ink-3">0</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class TeamDayTable {
  protected readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);
  private readonly followUps = inject(FollowUpsService);
  private readonly leads = inject(LeadsService);
  private readonly members = inject(MembersService);

  /** Hechos de hoy de todo el equipo (los escucha la página del día). */
  readonly done = input.required<FollowUp[]>();
  /** Vendedor cuya agenda se está mirando; null = todo el equipo. */
  readonly seller = model<string | null>(null);

  protected readonly t = t;
  protected readonly money = moneyLabel;

  protected readonly rows = computed(() =>
    teamDay(this.members.members(), this.followUps.pending(), this.done(), this.leads.leads(), this.clock.now()),
  );
  protected readonly selectedName = computed(() => this.rows().find((r) => r.uid === this.seller())?.name ?? null);
}
