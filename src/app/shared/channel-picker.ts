import { Component, model } from '@angular/core';
import { CHANNELS, ContactChannel } from '../core/models';
import { ChannelIcon } from './channel-icon';

/** Canal de la próxima acción (llamada, WhatsApp, email, reunión, tarea). */
@Component({
  selector: 'app-channel-picker',
  host: { class: 'block' },
  imports: [ChannelIcon],
  template: `
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Canal">
      @for (c of channels; track c.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="value() === c.id"
          (click)="value.set(c.id)"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[0.8125rem] font-semibold transition-colors duration-150"
          [class]="
            value() === c.id
              ? 'border-pen bg-pen-soft text-pen-strong'
              : 'border-rule-strong bg-sheet text-ink-2 hover:border-ink-3 hover:text-ink'
          "
        >
          <app-channel-icon [type]="c.id" [size]="14" />
          {{ c.label }}
        </button>
      }
    </div>
  `,
})
export class ChannelPicker {
  readonly value = model<ContactChannel>('call');
  protected readonly channels = CHANNELS;
}
