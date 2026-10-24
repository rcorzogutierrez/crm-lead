import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCalendarClock,
  LucideCheck,
  LucideMessageCircle,
  LucidePhone,
  LucideX,
} from '@lucide/angular';
import { Clock } from '../core/clock.service';
import { dueLabel, dueState, presetDate, timeLabel } from '../core/dates';
import { firestoreErrorMessage } from '../core/firestore-utils';
import { FollowUpsService } from '../core/followups.service';
import { LeadsService } from '../core/leads.service';
import { MembersService } from '../core/members.service';
import { ContactChannel, FollowUp, channelLabel } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Avatar } from './avatar';
import { ChannelIcon } from './channel-icon';
import { ChannelPicker } from './channel-picker';
import { telHref, whatsappHref } from './contact-links';
import { WhenPicker } from './when-picker';

type Mode = 'idle' | 'complete' | 'snooze';

/**
 * Una entrada de la agenda: a quién, por qué canal y qué hacer.
 * "Hecho" abre en línea el registro del resultado y la siguiente acción.
 */
@Component({
  selector: 'app-followup-item',
  imports: [RouterLink, Avatar, ChannelIcon, ChannelPicker, WhenPicker, LucideCheck, LucideCalendarClock, LucidePhone, LucideMessageCircle, LucideX],
  templateUrl: './followup-item.html',
  host: { class: 'block' },
})
export class FollowUpItem {
  private readonly clock = inject(Clock);
  private readonly followUps = inject(FollowUpsService);
  private readonly leads = inject(LeadsService);
  protected readonly members = inject(MembersService);
  private readonly toast = inject(ToastService);

  readonly fu = input.required<FollowUp>();
  /** Muestra la fecha (fuera de la página de hoy) en vez de solo la hora. */
  readonly showDate = input(false);
  readonly showLead = input(true);
  readonly showAssignee = input(false);

  protected readonly mode = signal<Mode>('idle');
  protected readonly busy = signal(false);
  protected readonly outcome = signal('');
  protected readonly scheduleNext = signal(true);
  protected readonly nextChannel = signal<ContactChannel>('call');
  protected readonly nextAt = signal(presetDate('in3', new Date()));
  protected readonly nextNote = signal('');

  protected readonly lead = computed(() => this.leads.byId().get(this.fu().leadId));
  protected readonly tel = computed(() => telHref(this.lead()?.phone ?? ''));
  protected readonly wa = computed(() => whatsappHref(this.lead()?.phone ?? ''));
  protected readonly state = computed(() => dueState(this.fu().dueAt, this.clock.now()));
  protected readonly when = computed(() =>
    this.showDate() || this.state() === 'overdue'
      ? `${dueLabel(this.fu().dueAt, this.clock.now())} · ${timeLabel(this.fu().dueAt)}`
      : timeLabel(this.fu().dueAt),
  );
  protected readonly channelName = computed(() => channelLabel(this.fu().channel));

  protected open(mode: Mode): void {
    this.mode.set(this.mode() === mode ? 'idle' : mode);
    if (mode === 'complete') {
      this.outcome.set('');
      this.nextChannel.set(this.fu().channel);
      this.nextAt.set(presetDate('in3', this.clock.now()));
      this.nextNote.set('');
      this.scheduleNext.set(true);
    }
  }

  protected async complete(event: Event): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    try {
      await this.followUps.complete(this.fu(), {
        outcome: this.outcome(),
        next: this.scheduleNext()
          ? { dueAt: this.nextAt(), channel: this.nextChannel(), note: this.nextNote() }
          : null,
      });
      this.toast.show(
        this.scheduleNext() ? `Hecho. Siguiente con ${this.fu().leadName} programado.` : 'Hecho.',
      );
      this.mode.set('idle');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async snooze(preset: 'tomorrow' | 'in3' | 'nextWeek'): Promise<void> {
    this.busy.set(true);
    try {
      const fu = this.fu();
      const original = fu.dueAt;
      await this.followUps.reschedule(fu, presetDate(preset, this.clock.now()));
      this.toast.show('Reprogramado.', {
        action: { label: 'Deshacer', run: () => void this.followUps.reschedule(fu, original) },
      });
      this.mode.set('idle');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    try {
      await this.followUps.cancel(this.fu());
      this.toast.show('Follow-up descartado.');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }
}
