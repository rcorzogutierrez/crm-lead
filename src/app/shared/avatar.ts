import { Component, computed, input } from '@angular/core';

/** Iniciales del miembro (o foto de Google si existe). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (photo()) {
      <img [src]="photo()" alt="" class="size-full rounded-full object-cover" referrerpolicy="no-referrer" />
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

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  });
}
