import { Component, computed, input } from '@angular/core';
import { Stage, stageMeta } from '../core/models';

@Component({
  selector: 'app-stage-badge',
  template: `{{ meta().label }}`,
  host: {
    class: 'inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold whitespace-nowrap',
    '[class]': 'meta().badge',
  },
})
export class StageBadge {
  readonly stage = input.required<Stage>();
  protected readonly meta = computed(() => stageMeta(this.stage()));
}
