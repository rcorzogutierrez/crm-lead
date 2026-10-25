import { Component, computed, input, linkedSignal } from '@angular/core';

/** Iniciales del miembro (o foto de Google si existe y carga). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (photo() && !failed()) {
      <img [src]="photo()" alt="" class="size-full rounded-full object-cover" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      {{ initials() }}
    }
  `,
  host: {
    class:
      'inline-grid shrink-0 place-items-center rounded-full bg-pen-soft font-semibold text-pen-strong ring-1 ring-sheet select-none',
    '[class]': 'size() === "sm" ? "size-6 text-[0.625rem]" : "size-8 text-xs"',
    '[attr.title]': 'name()',
    role: 'img',
    '[attr.aria-label]': 'name()',
  },
})
export class Avatar {
  readonly name = input('');
  readonly photo = input<string | null>(null);
  readonly size = input<'sm' | 'md'>('md');

  /** La foto de Google puede caducar o bloquearse: entonces se muestran las iniciales. Se reintenta si cambia la URL. */
  protected readonly failed = linkedSignal({ source: this.photo, computation: () => false });

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  });
}
