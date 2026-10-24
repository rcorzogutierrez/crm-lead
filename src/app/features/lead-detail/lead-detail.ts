import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormField, email, form, min, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideMail,
  LucideMessageCircle,
  LucidePhone,
  LucideTrash2,
} from '@lucide/angular';
import { ActivitiesService } from '../../core/activities.service';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { agoLabel, fullLabel } from '../../core/dates';
import { LiveQuery, firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import {
  Activity,
  ActivityType,
  LeadDraft,
  SOURCES,
  STAGES,
  Stage,
  sourceLabel,
  stageMeta,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ChannelIcon } from '../../shared/channel-icon';
import { mailHref, telHref, whatsappHref } from '../../shared/contact-links';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { ScheduleForm } from '../../shared/schedule-form';

const LOG_TYPES: { id: ActivityType; label: I18nKey }[] = [
  { id: 'note', label: 'act.note' },
  { id: 'call', label: 'channel.call' },
  { id: 'whatsapp', label: 'channel.whatsapp' },
  { id: 'email', label: 'channel.email' },
  { id: 'meeting', label: 'channel.meeting' },
];

const ACTIVITY_LABEL: Record<ActivityType, I18nKey> = {
  note: 'act.note',
  call: 'channel.call',
  whatsapp: 'channel.whatsapp',
  email: 'channel.email',
  meeting: 'channel.meeting',
  task: 'channel.task',
  stage: 'act.stage',
  created: 'act.created',
  followup: 'act.followup',
};

/** Ficha del lead: próxima acción, historial tipo diario y datos editables. */
@Component({
  selector: 'app-lead-detail',
  imports: [
    RouterLink,
    FormField,
    ChannelIcon,
    EmptyState,
    FollowUpItem,
    ScheduleForm,
    LucideArrowLeft,
    LucidePhone,
    LucideMessageCircle,
    LucideMail,
    LucideTrash2,
  ],
  templateUrl: './lead-detail.html',
})
export class LeadDetail {
  /** Viene de la ruta `/leads/:id`. */
  readonly id = input.required<string>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clock = inject(Clock);
  private readonly auth = inject(AuthService);
  private readonly leadsService = inject(LeadsService);
  private readonly activitiesService = inject(ActivitiesService);
  protected readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly stages = STAGES;
  protected readonly sources = SOURCES;
  protected readonly logTypes = LOG_TYPES;

  protected readonly lead = computed(() => this.leadsService.byId().get(this.id()));
  protected readonly loading = this.leadsService.loading;
  protected readonly pending = computed(() => this.followUps.pending().filter((f) => f.leadId === this.id()));
  protected readonly stageIndex = computed(() => STAGES.findIndex((s) => s.id === this.lead()?.stage));

  protected readonly tel = computed(() => telHref(this.lead()?.phone ?? ''));
  protected readonly wa = computed(() => whatsappHref(this.lead()?.phone ?? ''));
  protected readonly mail = computed(() => mailHref(this.lead()?.email ?? ''));

  private readonly activitiesQuery = signal<LiveQuery<Activity> | null>(null);
  protected readonly activities = computed(() => this.activitiesQuery()?.data() ?? []);
  protected readonly activitiesLoading = computed(() => this.activitiesQuery()?.loading() ?? true);

  // Registro de actividad
  protected readonly logType = signal<ActivityType>('note');
  protected readonly logBody = signal('');
  protected readonly logging = signal(false);

  // Programar otra acción
  protected readonly addingNext = signal(false);

  // Etapa perdida
  protected readonly askLostReason = signal(false);
  protected readonly lostReason = signal('');

  // Borrado
  protected readonly confirmDelete = signal(false);

  // Edición de datos
  protected readonly model = signal<LeadDraft>({
    name: '',
    company: '',
    email: '',
    phone: '',
    source: 'web',
    stage: 'new',
    value: 0,
    assigneeId: '',
    notes: '',
  });
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'form.nameEmpty' });
    email(p.email, { message: 'form.emailInvalid' });
    min(p.value, 0, { message: 'form.valueNegative' });
  });

  constructor() {
    // Historial en vivo del lead actual.
    effect((onCleanup) => {
      const id = this.id();
      const q = untracked(() => this.activitiesService.watch(id, this.destroyRef));
      this.activitiesQuery.set(q);
      onCleanup(() => q.stop());
    });

    // Carga el formulario cuando cambia el lead (sin pisar ediciones en curso).
    effect(() => {
      const lead = this.lead();
      if (!lead) return;
      untracked(() => {
        if (this.f().dirty()) return;
        this.model.set({
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          stage: lead.stage,
          value: lead.value,
          assigneeId: lead.assigneeId,
          notes: lead.notes,
        });
      });
    });
  }

  protected async setStage(stage: Stage): Promise<void> {
    const lead = this.lead();
    if (!lead || lead.stage === stage) return;
    if (stage === 'lost') {
      this.askLostReason.set(true);
      return;
    }
    try {
      await this.leadsService.moveToStage(lead, stage);
      if (stage === 'won') this.toast.show(t('detail.won', { name: lead.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async confirmLost(event: Event): Promise<void> {
    event.preventDefault();
    const lead = this.lead();
    if (!lead) return;
    try {
      await this.leadsService.moveToStage(lead, 'lost', this.lostReason().trim());
      this.askLostReason.set(false);
      this.lostReason.set('');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async log(event: Event): Promise<void> {
    event.preventDefault();
    const body = this.logBody().trim();
    if (!body) return;
    this.logging.set(true);
    try {
      await this.activitiesService.log(this.id(), this.logType(), body);
      this.logBody.set('');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.logging.set(false);
    }
  }

  protected async saveDetails(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      try {
        const { stage: _stage, ...patch } = this.model();
        await this.leadsService.update(this.id(), patch);
        this.f().reset();
        this.toast.show(t('detail.saved'));
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  protected discardDetails(): void {
    this.f().reset();
    const lead = this.lead();
    if (lead) {
      this.model.set({
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        stage: lead.stage,
        value: lead.value,
        assigneeId: lead.assigneeId,
        notes: lead.notes,
      });
    }
  }

  protected async remove(): Promise<void> {
    const lead = this.lead();
    if (!lead) return;
    try {
      await this.leadsService.remove(lead.id);
      this.toast.show(t('detail.deleted', { name: lead.name }));
      void this.router.navigateByUrl('/leads');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected canDelete(): boolean {
    const lead = this.lead();
    return !!lead && (this.auth.isAdmin() || lead.createdBy === this.auth.uid());
  }

  protected activityLabel(a: Activity): string {
    return t(ACTIVITY_LABEL[a.type] ?? 'act.note');
  }
  /** Los cambios de etapa se muestran en el idioma actual, no en el que se guardaron. */
  protected activityBody(a: Activity): string {
    if (a.type === 'stage' && a.from && a.to && a.to !== 'lost') return `${stageMeta(a.from).label} → ${stageMeta(a.to).label}`;
    return a.body;
  }
  protected activityTime(a: Activity): string {
    return a.createdAt
      ? new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(a.createdAt).replace('.', '')
      : t('ago.now');
  }
  protected activityHour(a: Activity): string {
    return a.createdAt
      ? new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(a.createdAt)
      : '';
  }
  protected ago(d: Date | null): string {
    return agoLabel(d, this.clock.now());
  }
  protected full = fullLabel;
  protected sourceName = sourceLabel;
  protected stageName = (s: Stage) => stageMeta(s).label;
}
