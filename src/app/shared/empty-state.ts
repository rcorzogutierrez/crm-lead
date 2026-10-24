import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <p class="font-semibold text-ink">{{ title() }}</p>
    <p class="mt-1 max-w-[46ch] text-sm text-ink-2"><ng-content /></p>
    <div class="mt-3 empty:hidden"><ng-content select="[actions]" /></div>
  `,
  host: { class: 'block px-4 py-6' },
})
export class EmptyState {
  readonly title = input.required<string>();
}
