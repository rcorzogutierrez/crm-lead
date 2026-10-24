import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideX } from '@lucide/angular';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LucideX],
  template: `
    <router-outlet />
    <div
      class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end"
      aria-live="polite"
      role="status"
    >
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="toast pointer-events-auto flex max-w-md items-center gap-3 rounded-lg py-2.5 pr-2 pl-4 text-sm font-medium shadow-lift"
          [class]="t.tone === 'error' ? 'bg-ribbon text-white' : 'bg-ink text-white'"
        >
          <span class="flex-1">{{ t.text }}</span>
          @if (t.action) {
            <button type="button" class="rounded-md px-2 py-1 font-bold text-highlight hover:bg-white/10" (click)="t.action.run(); toasts.dismiss(t.id)">
              {{ t.action.label }}
            </button>
          }
          <button type="button" class="grid size-7 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar aviso" (click)="toasts.dismiss(t.id)">
            <svg lucideX [size]="14"></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
