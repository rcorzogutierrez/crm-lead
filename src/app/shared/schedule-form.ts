import { Component, inject, input, output, signal } from '@angular/core';
import { presetDate } from '../core/dates';
import { firestoreErrorMessage } from '../core/firestore-utils';
import { FollowUpsService } from '../core/followups.service';
import { ContactChannel, Lead } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ChannelPicker } from './channel-picker';
import { WhenPicker } from './when-picker';

/** Programa la próxima acción de un lead. */
@Component({
  selector: 'app-schedule-form',
  imports: [ChannelPicker, WhenPicker],
  template: `
    <form class="space-y-3" (submit)="save($event)">
      <app-channel-picker [(value)]="channel" />
      <app-when-picker [(value)]="when" />
      <input
        class="input"
        aria-label="Qué hay que hacer"
        placeholder="Qué hay que hacer (opcional)"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
      />
      <div class="flex items-center justify-end gap-2">
        @if (cancellable()) {
          <button type="button" class="btn-ghost btn-sm" (click)="cancelled.emit()">Cancelar</button>
        }
        <button type="submit" class="btn-primary btn-sm" [disabled]="saving()">
          {{ saving() ? 'Programando…' : 'Programar' }}
        </button>
      </div>
    </form>
  `,
})
export class ScheduleForm {
  private readonly followUps = inject(FollowUpsService);
  private readonly toast = inject(ToastService);

  readonly lead = input.required<Pick<Lead, 'id' | 'name' | 'company' | 'assigneeId'>>();
  readonly cancellable = input(true);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly channel = signal<ContactChannel>('call');
  protected readonly when = signal(presetDate('tomorrow', new Date()));
  protected readonly note = signal('');
  protected readonly saving = signal(false);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.saving.set(true);
    try {
      await this.followUps.schedule(this.lead(), this.when(), this.channel(), this.note());
      this.toast.show('Próxima acción programada.');
      this.note.set('');
      this.saved.emit();
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
