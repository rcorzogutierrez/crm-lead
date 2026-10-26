import { Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dealTitle } from '../core/deal-lines';
import { moneyLabel } from '../core/dates';
import { firestoreErrorMessage } from '../core/firestore-utils';
import { FollowUpsService } from '../core/followups.service';
import { t } from '../core/i18n/i18n';
import { LeadsService } from '../core/leads.service';
import { LOST_REASONS, Lead, LostCode } from '../core/models';
import { ToastService } from '../core/toast.service';

/**
 * Cerrar un negocio, igual desde la ficha y desde el pipeline: ganado propone la postventa,
 * perdido pide un motivo de la lista. Los follow-ups pendientes se cancelan en el mismo paso.
 */
@Component({
  selector: 'app-close-deal',
  imports: [RouterLink],
  template: `
    <form
      #box
      class="space-y-3 rounded-lg border p-4"
      [class]="to() === 'won' ? 'border-ok/40 bg-ok-soft' : 'border-rule-strong bg-sheet'"
      [attr.aria-labelledby]="'close-title-' + lead().id"
      (submit)="save($event)"
      (keydown.escape)="cancelled.emit()"
    >
      <p [id]="'close-title-' + lead().id" class="font-bold">
        {{ to() === 'won' ? t('close.wonTitle', { name: title() }) : t('close.lostTitle', { name: title() }) }}
      </p>

      @if (needsService()) {
        <p class="text-sm" role="alert">
          {{ t('close.needsService') }}
          <a class="font-semibold text-pen hover:underline" [routerLink]="['/leads', lead().id]">{{ t('close.goChooseService') }}</a>
        </p>
      } @else if (to() === 'won') {
        @if (lead().value) {
          <p class="text-sm text-ink-2">{{ t('close.wonValue', { value: money(lead().value) }) }}</p>
        }
        <label class="flex min-h-8 items-center gap-2 text-sm font-medium">
          <input type="checkbox" class="size-4" [checked]="postSale()" (change)="postSale.set($any($event.target).checked)" />
          {{ t('close.postSale') }}
        </label>
      } @else {
        <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-label]="t('detail.lostWhy')">
          @for (r of reasons; track r.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="code() === r.id"
              (click)="code.set(r.id)"
              class="inline-flex h-8 items-center rounded-md border px-2.5 text-[0.8125rem] font-semibold transition-colors"
              [class]="code() === r.id ? 'border-pen bg-pen-soft text-pen-strong' : 'border-rule-strong bg-sheet text-ink-2 hover:text-ink'"
            >
              {{ r.label }}
            </button>
          }
        </div>
        <div>
          <label class="field-label" [for]="'close-detail-' + lead().id">{{ t('close.detail') }}</label>
          <input
            [id]="'close-detail-' + lead().id"
            class="input"
            autocomplete="off"
            [placeholder]="t('detail.lostPlaceholder')"
            [value]="detail()"
            (input)="detail.set($any($event.target).value)"
          />
        </div>
      }

      @if (pendingCount()) {
        <p class="text-xs text-ink-2">
          {{ pendingCount() === 1 ? t('close.cancels1') : t('close.cancelsN', { n: pendingCount() }) }}
        </p>
      }
      @if (error(); as err) {
        <p class="text-sm font-medium text-ribbon" role="alert">{{ err }}</p>
      }
      <div class="flex flex-wrap items-center justify-end gap-2">
        <button type="button" class="btn-ghost btn-sm" [disabled]="busy()" (click)="cancelled.emit()">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn-primary btn-sm" [disabled]="busy() || needsService() || (to() === 'lost' && !code())">
          {{ busy() ? t('common.saving') : to() === 'won' ? t('close.markWon') : t('detail.markLost') }}
        </button>
      </div>
    </form>
  `,
})
export class CloseDeal {
  private readonly leads = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);
  private readonly toast = inject(ToastService);

  readonly lead = input.required<Lead>();
  readonly to = input.required<'won' | 'lost'>();
  readonly done = output<void>();
  readonly cancelled = output<void>();

  protected readonly t = t;
  protected readonly money = moneyLabel;
  protected readonly reasons = LOST_REASONS;
  protected readonly code = signal<LostCode | null>(null);
  protected readonly detail = signal('');
  protected readonly postSale = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Una venta lleva al menos un servicio (los negocios antiguos sin servicio lo eligen antes en la ficha). */
  protected readonly needsService = computed(() => this.to() === 'won' && !this.lead().serviceId);
  protected readonly title = computed(() => dealTitle(this.lead()) || this.lead().name);
  protected readonly pendingCount = computed(() => this.followUps.forLead(this.lead().id).length);

  private readonly box = viewChild.required<ElementRef<HTMLFormElement>>('box');

  constructor() {
    // Foco en el primer control para seguir con el teclado (el motivo o la casilla de postventa).
    afterNextRender(() => this.box().nativeElement.querySelector<HTMLElement>('[role=radio], input')?.focus());
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const lead = this.lead();
    const to = this.to();
    if ((to === 'lost' && !this.code()) || this.needsService()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.leads.moveToStage(lead, to, to === 'lost' ? { code: this.code(), detail: this.detail() } : null);
      if (to === 'won' && this.postSale()) {
        await this.followUps.schedulePostSale(lead);
        this.toast.show(t('close.wonPostSale', { name: this.title() }));
      } else {
        this.toast.show(to === 'won' ? t('detail.won', { name: this.title() }) : t('detail.lostMsg', { name: this.title() }));
      }
      this.done.emit();
    } catch (err) {
      this.error.set(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
