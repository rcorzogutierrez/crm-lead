import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideX } from '@lucide/angular';
import { t } from './core/i18n/i18n';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LucideX],
  template: `
    <router-outlet />
    <div
      class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex print:hidden flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end"
      aria-live="polite"
      role="status"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="toast pointer-events-auto flex max-w-md items-center gap-3 rounded-lg py-2.5 pr-2 pl-4 text-sm font-medium shadow-lift"
          [class]="toast.tone === 'error' ? 'bg-ribbon text-white' : 'bg-ink text-white'"
        >
          <span class="flex-1">{{ toast.text }}</span>
          @if (toast.action) {
            <button type="button" class="rounded-md px-2 py-1 font-bold text-highlight hover:bg-white/10" (click)="toast.action.run(); toasts.dismiss(toast.id)">
              {{ toast.action.label }}
            </button>
          }
          <button type="button" class="grid size-7 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white" [attr.aria-label]="t('toast.close')" (click)="toasts.dismiss(toast.id)">
            <svg lucideX [size]="14"></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
  protected readonly t = t;
}
