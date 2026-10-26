import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, viewChildren } from '@angular/core';
import { LucidePlus, LucideX } from '@lucide/angular';
import { CatalogService } from '../core/catalog.service';
import { moneyLabel } from '../core/dates';
import { EditLine, MAX_LINES } from '../core/deal-lines';
import { t } from '../core/i18n/i18n';

/**
 * Servicios de una compra: uno o varios, cada uno con su cantidad si se cobra por unidad.
 * Un servicio no se repite (para eso está la cantidad). Lo usan la captura y la ficha.
 */
@Component({
  selector: 'app-lines-editor',
  imports: [LucidePlus, LucideX],
  host: { class: 'block' },
  template: `
    <ul class="space-y-3 sm:space-y-2" [attr.aria-label]="t('lines.label')">
      @for (line of lines(); track $index; let i = $index) {
        <!-- En el móvil el servicio ocupa su renglón y la cantidad va debajo, para leer el nombre entero. -->
        <li class="flex flex-wrap items-end gap-2 not-first:border-t not-first:border-rule not-first:pt-3 sm:flex-nowrap sm:not-first:border-0 sm:not-first:pt-0">
          <div class="min-w-0 basis-full sm:basis-auto sm:flex-1">
            @if (i === 0) {
              <label class="field-label" [for]="idPrefix() + '-service'">{{ t('field.service') }}</label>
            }
            <select
              #select
              class="input"
              [id]="i === 0 ? idPrefix() + '-service' : idPrefix() + '-service-' + i"
              [attr.aria-label]="i === 0 ? null : t('lines.serviceN', { n: i + 1 })"
              [attr.aria-invalid]="i === 0 && invalid() ? true : null"
              [attr.aria-describedby]="i === 0 && invalid() ? errorId() : null"
              (change)="setService(i, $any($event.target).value)"
            >
              @if (i === 0 ? allowNone() : !line.serviceId) {
                <option value="" [selected]="!line.serviceId">{{ i === 0 ? t('capture.noService') : t('lines.choose') }}</option>
              }
              @for (s of optionsFor(i); track s.id) {
                <option [value]="s.id" [selected]="s.id === line.serviceId">
                  {{ s.name }} · {{ money(s.price) }}@if (s.unit) { / {{ s.unit }}}@if (!s.active) { ({{ t('svc.archivedBadge') }})}
                </option>
              }
            </select>
          </div>
          @if (unitOf(line); as unit) {
            <div class="w-28 shrink-0">
              @if (i === 0) {
                <label class="field-label" [for]="idPrefix() + '-qty'">{{ t('lines.qty') }}</label>
              }
              <div class="relative">
                <input
                  class="input pr-16 tabular"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  [id]="i === 0 ? idPrefix() + '-qty' : idPrefix() + '-qty-' + i"
                  [attr.aria-label]="t('field.quantity', { unit })"
                  [value]="line.quantity"
                  (input)="setQuantity(i, $any($event.target).value)"
                />
                <span class="pointer-events-none absolute inset-y-0 right-3 flex max-w-12 items-center truncate text-xs text-ink-3" aria-hidden="true">{{ unit }}</span>
              </div>
            </div>
          }
          @if (lines().length > 1) {
            <button
              type="button"
              class="btn-icon btn-ghost mb-0.5 shrink-0"
              [attr.aria-label]="t('lines.remove', { name: nameOf(line) || t('lines.serviceN', { n: i + 1 }) })"
              (click)="remove(i)"
            >
              <svg lucideX [size]="16"></svg>
            </button>
          }
        </li>
      }
    </ul>
    @if (canAdd()) {
      <button type="button" class="btn-ghost btn-sm mt-2 text-pen" (click)="add()">
        <svg lucidePlus [size]="16"></svg>
        {{ t('lines.add') }}
      </button>
    }
  `,
})
export class LinesEditor {
  private readonly catalog = inject(CatalogService);
  private readonly injector = inject(Injector);

  readonly lines = model.required<EditLine[]>();
  /** Prefijo de los id ("c" en la captura, "p" en la ficha): `c-service`, `c-qty`… */
  readonly idPrefix = input('c');
  /** La primera línea puede quedar "sin servicio por ahora". */
  readonly allowNone = input(true);
  /** Servicios archivados que ya están en el negocio (siguen elegibles allí). */
  readonly keepIds = input<readonly string[]>([]);
  readonly invalid = input(false);
  readonly errorId = input<string | null>(null);

  protected readonly t = t;
  protected readonly money = moneyLabel;
  private readonly selects = viewChildren<ElementRef<HTMLSelectElement>>('select');

  private readonly choices = computed(() => {
    const keep = new Set(this.keepIds());
    return [...this.catalog.byId().values()].filter((s) => s.active || keep.has(s.id));
  });

  protected readonly canAdd = computed(() => {
    const ls = this.lines();
    const used = new Set(ls.map((l) => l.serviceId));
    return (
      !!ls[0]?.serviceId &&
      ls.every((l) => l.serviceId) &&
      ls.length < MAX_LINES &&
      this.catalog.active().some((s) => !used.has(s.id))
    );
  });

  /** Servicios de esta línea: los que no están ya en otra. */
  protected optionsFor(i: number) {
    const others = new Set(this.lines().filter((_, j) => j !== i).map((l) => l.serviceId));
    return this.choices().filter((s) => !others.has(s.id));
  }

  protected unitOf(line: EditLine): string {
    return this.catalog.byId().get(line.serviceId)?.unit ?? '';
  }

  protected nameOf(line: EditLine): string {
    return this.catalog.byId().get(line.serviceId)?.name ?? '';
  }

  protected setService(i: number, serviceId: string): void {
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { serviceId, quantity: 1 } : l)));
  }

  protected setQuantity(i: number, raw: string): void {
    const quantity = Math.max(1, Math.floor(Number(raw) || 1));
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { ...l, quantity } : l)));
  }

  protected add(): void {
    this.lines.update((ls) => [...ls, { serviceId: '', quantity: 1 }]);
    this.focusSelect(() => this.lines().length - 1);
  }

  protected remove(i: number): void {
    this.lines.update((ls) => ls.filter((_, j) => j !== i));
    this.focusSelect(() => Math.max(0, i - 1));
  }

  private focusSelect(index: () => number): void {
    afterNextRender(() => this.selects()[index()]?.nativeElement.focus(), { injector: this.injector });
  }
}
