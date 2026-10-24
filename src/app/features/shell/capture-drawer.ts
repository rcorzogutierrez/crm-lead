import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormField, email, form, min, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LucideX } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { ContactChannel, LeadSource, OPEN_STAGES, SOURCES, Stage } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { ChannelPicker } from '../../shared/channel-picker';
import { WhenPicker } from '../../shared/when-picker';
import { presetDate } from '../../core/dates';

interface CaptureModel {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  stage: Stage;
  value: number;
  assigneeId: string;
  notes: string;
}

function emptyModel(uid: string): CaptureModel {
  return {
    name: '',
    company: '',
    phone: '',
    email: '',
    source: 'web',
    stage: 'new',
    value: 0,
    assigneeId: uid,
    notes: '',
  };
}

/**
 * Captura rápida de un lead: lo mínimo arriba (nombre, teléfono) y la primera
 * próxima acción ya programada por defecto, para que ningún lead nazca huérfano.
 */
@Component({
  selector: 'app-capture-drawer',
  imports: [FormField, ChannelPicker, WhenPicker, LucideX],
  templateUrl: './capture-drawer.html',
})
export class CaptureDrawer {
  protected readonly ui = inject(UiService);
  private readonly auth = inject(AuthService);
  private readonly leads = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly sources = SOURCES;
  protected readonly stages = OPEN_STAGES;

  protected readonly model = signal<CaptureModel>(emptyModel(''));
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'Escribe al menos un nombre.' });
    email(p.email, { message: 'Ese email no parece válido.' });
    min(p.value, 0, { message: 'El valor no puede ser negativo.' });
  });

  protected readonly scheduleNext = signal(true);
  protected readonly nextAt = signal(presetDate('tomorrow', new Date()));
  protected readonly nextChannel = signal<ContactChannel>('call');
  protected readonly nextNote = signal('');
  protected readonly saveError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.ui.captureOpen()) {
        if (!el.open) {
          this.reset();
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected close(): void {
    this.ui.captureOpen.set(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected async save(event: Event, openAfter: boolean): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    await submit(this.f, async () => {
      try {
        const draft = this.model();
        const id = await this.leads.create(draft);
        if (this.scheduleNext()) {
          await this.followUps.schedule(
            { id, name: draft.name, company: draft.company, assigneeId: draft.assigneeId || this.auth.uid() },
            this.nextAt(),
            this.nextChannel(),
            this.nextNote(),
          );
        }
        this.toast.show(`${draft.name} quedó en la agenda.`, {
          action: openAfter ? undefined : { label: 'Abrir', run: () => this.router.navigate(['/leads', id]) },
        });
        this.close();
        if (openAfter) void this.router.navigate(['/leads', id]);
      } catch (err) {
        this.saveError.set(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  private reset(): void {
    this.model.set(emptyModel(this.auth.uid()));
    this.f().reset();
    this.scheduleNext.set(true);
    this.nextAt.set(presetDate('tomorrow', new Date()));
    this.nextChannel.set('call');
    this.nextNote.set('');
    this.saveError.set(null);
  }
}
