import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { LucideBanknote, LucideUndo2 } from '@lucide/angular';
import { AuthService } from '../core/auth.service';
import { Clock } from '../core/clock.service';
import { centsLabel, dateLabel } from '../core/dates';
import { firestoreErrorMessage } from '../core/firestore-utils';
import { I18nKey, intlLocale, t } from '../core/i18n/i18n';
import { PAYMENT_METHODS, PaymentMethod, invoiceBalance, payState, round2 } from '../core/invoice-math';
import { Invoice, InvoicesService, Payment } from '../core/invoices.service';
import { dayParam } from '../core/reports';
import { ToastService } from '../core/toast.service';
import { PayStateChip } from './pay-state-chip';

const METHOD_LABEL: Record<PaymentMethod, I18nKey> = {
  cash: 'pay.m.cash',
  card: 'pay.m.card',
  transfer: 'pay.m.transfer',
  zelle: 'pay.m.zelle',
  check: 'pay.m.check',
  other: 'pay.m.other',
};

let seq = 0;

/**
 * Cobro de una factura: lo pagado, el saldo y los pagos como renglones de libro (fecha en el
 * margen, importe a la derecha). Registrar un pago se abre aquí debajo; un admin deshace uno
 * con motivo y queda tachado. Se usa en la ficha de la venta y en la página de la factura.
 */
@Component({
  selector: 'app-invoice-payments',
  host: { class: 'block' },
  imports: [PayStateChip, LucideBanknote, LucideUndo2],
  template: `
    @let inv = invoice();
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
        <app-pay-state-chip [state]="state()" />
        <span class="text-ink-2 tabular">{{ t('pay.summary', { paid: cents(inv.paid), total: cents(inv.total) }) }}</span>
        @if (inv.dueAt && state() !== 'paid' && state() !== 'void') {
          <span class="tabular" [class]="state() === 'overdue' ? 'font-semibold text-ribbon' : 'text-ink-2'">
            {{ t(state() === 'overdue' ? 'pay.overdueSince' : 'pay.dueOn', { date: date(inv.dueAt) }) }}
          </span>
        }
      </p>
      @if (state() !== 'void' && state() !== 'paid') {
        <p class="text-sm tabular">
          <span class="text-ink-2">{{ t('pay.balance') }}</span>
          <span class="ml-2 text-base font-bold" [class.text-ribbon]="state() === 'overdue'">{{ cents(balance()) }}</span>
        </p>
      }
    </div>

    @if (loadError()) {
      <p class="mt-3 text-sm text-ribbon" role="alert">{{ loadError() }}</p>
    } @else if (payments().length) {
      <ul class="mt-3 border-t border-rule" [attr.aria-label]="t('pay.received')">
        @for (p of payments(); track p.id) {
          <li class="border-b border-rule">
            <div class="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)_auto_auto]">
              <span class="text-ink-2 tabular" [class.line-through]="p.undone">{{ shortDate(p.paidAt) }}</span>
              <span class="min-w-0" [class.text-ink-3]="p.undone">
                <span class="font-semibold" [class.line-through]="p.undone">{{ method(p.method) }}</span>
                @if (p.note) { <span class="text-ink-2"> · {{ p.note }}</span> }
                <span class="block text-xs text-ink-3">
                  {{ p.undone ? t('pay.undoneTag', { reason: p.undoReason }) : t('pay.by', { name: p.createdByName }) }}
                </span>
              </span>
              <span class="whitespace-nowrap tabular" [class]="p.undone ? 'text-ink-3 line-through' : 'font-bold'">{{ cents(p.amount) }}</span>
              @if (auth.isAdmin() && !p.undone && inv.status === 'issued') {
                <button
                  type="button"
                  class="btn-ghost btn-sm col-start-3 justify-self-end sm:col-start-auto"
                  [attr.aria-expanded]="undoing() === p.id"
                  [attr.aria-label]="t('pay.undoConfirm', { amount: cents(p.amount) })"
                  (click)="startUndo(p)"
                >
                  <svg lucideUndo2 [size]="14"></svg>
                  {{ t('pay.undo') }}
                </button>
              }
            </div>
            @if (undoing() === p.id) {
              <form class="mb-3 rounded-lg border border-ribbon/40 bg-sheet p-3" novalidate (submit)="confirmUndo($event, p)" [attr.aria-label]="t('pay.undoNow')">
                <p class="text-sm font-semibold">{{ t('pay.undoConfirm', { amount: cents(p.amount) }) }}</p>
                <p class="mt-0.5 text-xs text-ink-2">{{ t('pay.undoHint') }}</p>
                <label class="field-label mt-2" [for]="uid + '-undo'">{{ t('pay.undoReason') }}</label>
                <input [id]="uid + '-undo'" class="input" autocomplete="off" maxlength="500" [value]="undoReason()" (input)="undoReason.set($any($event.target).value)" />
                <div class="mt-3 flex justify-end gap-2">
                  <button type="button" class="btn-ghost btn-sm" (click)="undoing.set(null)">{{ t('common.cancel') }}</button>
                  <button type="submit" class="btn-danger btn-sm" [disabled]="saving() || !undoReason().trim()">{{ t('pay.undoNow') }}</button>
                </div>
              </form>
            }
          </li>
        }
      </ul>
    } @else if (loaded() && state() !== 'void') {
      <p class="mt-3 border-t border-rule pt-3 text-sm text-ink-2">{{ t('pay.none') }}</p>
    }

    @if (inv.status === 'issued' && balance() > 0) {
      @if (!canPay()) {
        <p class="mt-3 text-xs text-ink-3">{{ t('pay.onlyOwner') }}</p>
      } @else if (!adding()) {
        <button #addBtn type="button" class="btn-secondary btn-sm mt-3" [attr.aria-expanded]="false" (click)="open()">
          <svg lucideBanknote [size]="16"></svg>
          {{ t('pay.add') }}
        </button>
      } @else {
        <form class="mt-3 space-y-3 rounded-lg border border-rule-strong bg-sheet-2/60 p-3 sm:p-4" novalidate (submit)="save($event)" [attr.aria-label]="t('pay.add')">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div class="flex min-h-8 items-end justify-between gap-2">
                <label class="field-label" [for]="uid + '-amount'">{{ t('pay.amount') }}</label>
                <button type="button" class="min-h-8 text-xs font-semibold text-pen hover:underline" (click)="amount.set(balanceInput())">{{ t('pay.full') }}</button>
              </div>
              <input
                #amountInput
                [id]="uid + '-amount'"
                class="input tabular"
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0.01"
                [max]="balance()"
                [value]="amount()"
                [attr.aria-invalid]="!!amountError()"
                [attr.aria-describedby]="amountError() ? uid + '-amount-err' : null"
                (input)="amount.set($any($event.target).value)"
              />
              @if (amountError()) {
                <p class="field-error" [id]="uid + '-amount-err'">{{ amountError() }}</p>
              }
            </div>
            <div>
              <div class="flex min-h-8 items-end">
                <label class="field-label" [for]="uid + '-date'">{{ t('pay.date') }}</label>
              </div>
              <input
                [id]="uid + '-date'"
                class="input tabular"
                type="date"
                [max]="today()"
                [value]="day()"
                [attr.aria-invalid]="!!dateError()"
                [attr.aria-describedby]="dateError() ? uid + '-date-err' : null"
                (input)="day.set($any($event.target).value)"
              />
              @if (dateError()) {
                <p class="field-error" [id]="uid + '-date-err'">{{ dateError() }}</p>
              }
            </div>
          </div>
          <div>
            <p class="field-label" [id]="uid + '-method'">{{ t('pay.method') }}</p>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" [attr.aria-labelledby]="uid + '-method'">
              @for (m of methods; track m) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="methodChoice() === m"
                  (click)="methodChoice.set(m)"
                  class="inline-flex h-8 items-center rounded-md border px-2.5 text-[0.8125rem] font-semibold transition-colors"
                  [class]="methodChoice() === m ? 'border-pen bg-pen-soft text-pen-strong' : 'border-rule-strong bg-sheet text-ink-2 hover:text-ink'"
                >
                  {{ method(m) }}
                </button>
              }
            </div>
          </div>
          <div>
            <label class="field-label" [for]="uid + '-note'">{{ t('pay.note') }}</label>
            <input [id]="uid + '-note'" class="input" autocomplete="off" maxlength="500" [placeholder]="t('pay.notePlaceholder')" [value]="note()" (input)="note.set($any($event.target).value)" />
          </div>
          <div class="flex justify-end gap-2 border-t border-rule pt-3">
            <button type="button" class="btn-ghost btn-sm" (click)="close()">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn-primary btn-sm" [disabled]="saving()">{{ t('pay.add') }}</button>
          </div>
        </form>
      }
    }
  `,
})
export class InvoicePayments {
  protected readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);
  private readonly invoices = inject(InvoicesService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly invoice = input.required<Invoice>();

  /** Prefijo de ids propio de cada instancia (ids únicos en la página). */
  protected readonly uid = `pay-${++seq}`;

  protected readonly t = t;
  protected readonly cents = centsLabel;
  protected readonly date = dateLabel;
  protected readonly methods = PAYMENT_METHODS;

  protected readonly payments = signal<Payment[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly adding = signal(false);
  protected readonly amount = signal('');
  protected readonly day = signal('');
  protected readonly methodChoice = signal<PaymentMethod>('transfer');
  protected readonly note = signal('');
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);

  protected readonly undoing = signal<string | null>(null);
  protected readonly undoReason = signal('');

  private readonly addBtn = viewChild<ElementRef<HTMLButtonElement>>('addBtn');
  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  protected readonly state = computed(() => payState(this.invoice(), this.clock.now()));
  protected readonly balance = computed(() => invoiceBalance(this.invoice()));
  protected readonly balanceInput = computed(() => this.balance().toFixed(2));
  protected readonly today = computed(() => dayParam(this.clock.now()));
  /** Registra el responsable de la factura o un admin (igual que las reglas). */
  protected readonly canPay = computed(() => this.auth.isAdmin() || this.invoice().assigneeId === this.auth.uid());

  protected readonly amountError = computed(() => {
    if (!this.tried()) return null;
    const n = Number(this.amount());
    return n > 0 && round2(n) <= this.balance() + 0.005 ? null : t('pay.tooMuch');
  });
  protected readonly dateError = computed(() => (this.tried() && (!this.day() || this.day() > this.today()) ? t('pay.futureDate') : null));

  constructor() {
    effect((onCleanup) => {
      const id = this.invoice().id;
      this.loaded.set(false);
      this.loadError.set(null);
      const stop = this.invoices.watchPayments(
        id,
        (list) => {
          this.payments.set(list);
          this.loaded.set(true);
        },
        (err) => this.loadError.set(firestoreErrorMessage(err)),
      );
      onCleanup(stop);
    });
  }

  protected method(m: PaymentMethod): string {
    return t(METHOD_LABEL[m] ?? 'pay.m.other');
  }

  /** "26 oct 26": la fecha del pago en el margen del libro. */
  protected shortDate(d: Date | null): string {
    return d ? d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: '2-digit' }).replace('.', '') : '';
  }

  /** Abre el formulario con todo el saldo y la fecha de hoy; el monto queda seleccionado. */
  protected open(): void {
    this.amount.set(this.balanceInput());
    this.day.set(this.today());
    this.note.set('');
    this.tried.set(false);
    this.adding.set(true);
    afterNextRender(() => this.amountInput()?.nativeElement.select(), { injector: this.injector });
  }

  protected close(): void {
    this.adding.set(false);
    afterNextRender(() => this.addBtn()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.tried.set(true);
    if (this.amountError() || this.dateError() || this.saving()) return;
    this.saving.set(true);
    try {
      const inv = this.invoice();
      const amount = round2(Number(this.amount()));
      const left = invoiceBalance({ total: inv.total, paid: inv.paid + amount });
      // La fecha del input es local; a mediodía para que no cambie de día con la zona horaria.
      await this.invoices.addPayment(inv, { amount, method: this.methodChoice(), paidAt: new Date(`${this.day()}T12:00:00`), note: this.note() });
      this.toast.show(left < 0.005 ? t('pay.savedPaid') : t('pay.saved', { left: centsLabel(left) }));
      this.close();
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Abre la confirmación debajo del pago; el foco va al motivo. */
  protected startUndo(p: Payment): void {
    this.undoReason.set('');
    this.undoing.set(this.undoing() === p.id ? null : p.id);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>(`#${this.uid}-undo`)?.focus(), { injector: this.injector });
  }

  protected async confirmUndo(event: Event, p: Payment): Promise<void> {
    event.preventDefault();
    const reason = this.undoReason().trim();
    if (!reason || this.saving()) return;
    this.saving.set(true);
    try {
      await this.invoices.undoPayment(this.invoice(), p, reason);
      this.undoing.set(null);
      this.toast.show(t('pay.undone'));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
