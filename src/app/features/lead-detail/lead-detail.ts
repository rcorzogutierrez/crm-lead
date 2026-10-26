import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { FormField, email, form, min, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideLock,
  LucideMail,
  LucideMessageCircle,
  LucidePhone,
  LucideTrash2,
  LucideTriangleAlert,
  LucideUserRound,
} from '@lucide/angular';
import { CatalogService } from '../../core/catalog.service';
import { ContactsService } from '../../core/contacts.service';
import { moneyLabel } from '../../core/dates';
import { ActivitiesService } from '../../core/activities.service';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { agoLabel, dueLabel, fullLabel } from '../../core/dates';
import { LiveQuery, firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import {
  Activity,
  ActivityType,
  ContactChannel,
  activityLabel,
  LeadDraft,
  PriceTier,
  SOURCES,
  STAGES,
  Stage,
  sourceLabel,
  channelLabel,
  isClosed,
  lostReasonLabel,
  salePrice,
  stageMeta,
  tierLabel,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ChannelIcon } from '../../shared/channel-icon';
import { mailHref, telHref, whatsappHref } from '../../shared/contact-links';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { ScheduleForm } from '../../shared/schedule-form';
import { TierPicker } from '../../shared/tier-picker';
import { CloseDeal } from '../../shared/close-deal';

const LOG_TYPES: { id: ActivityType; label: I18nKey }[] = [
  { id: 'note', label: 'act.note' },
  { id: 'call', label: 'channel.call' },
  { id: 'whatsapp', label: 'channel.whatsapp' },
  { id: 'email', label: 'channel.email' },
  { id: 'meeting', label: 'channel.meeting' },
];


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
    TierPicker,
    CloseDeal,
    LucideArrowLeft,
    LucideTriangleAlert,
    LucideUserRound,
    LucidePhone,
    LucideMessageCircle,
    LucideLock,
    LucideMail,
    LucideTrash2,
  ],
  templateUrl: './lead-detail.html',
})
export class LeadDetail {
  /** Viene de la ruta `/leads/:id`. */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly clock = inject(Clock);
  protected readonly auth = inject(AuthService);
  private readonly leadsService = inject(LeadsService);
  private readonly activitiesService = inject(ActivitiesService);
  protected readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  protected readonly catalog = inject(CatalogService);
  protected readonly contacts = inject(ContactsService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly stages = STAGES;
  protected readonly sources = SOURCES;
  protected readonly logTypes = LOG_TYPES;
  protected readonly lostLabel = lostReasonLabel;

  protected readonly lead = computed(() => this.leadsService.byId().get(this.id()));
  protected readonly loading = this.leadsService.loading;
  protected readonly pending = computed(() => this.followUps.pending().filter((f) => f.leadId === this.id()));
  /** Venta ganada y quien mira no es admin: no se reabre ni se borra. */
  protected readonly locked = computed(() => {
    const lead = this.lead();
    return !!lead && this.leadsService.locked(lead);
  });
  protected readonly stageIndex = computed(() => STAGES.findIndex((s) => s.id === this.lead()?.stage));

  protected readonly money = moneyLabel;
  protected readonly tierName = tierLabel;
  protected readonly isOpen = computed(() => {
    const lead = this.lead();
    return !!lead && !isClosed(lead.stage);
  });
  protected readonly contact = computed(() => {
    const id = this.lead()?.contactId;
    return id ? (this.contacts.byId().get(id) ?? null) : null;
  });
  /** Servicio del catálogo tal como está hoy (su precio oficial puede haber cambiado). */
  protected readonly service = computed(() => {
    const id = this.lead()?.serviceId;
    return id ? (this.catalog.byId().get(id) ?? null) : null;
  });
  /** Precio oficial nuevo pendiente de decidir (lead abierto, aún no aceptado ni descartado). */
  protected readonly priceChange = computed(() => {
    const lead = this.lead();
    const svc = this.service();
    if (!lead || !svc || !this.isOpen() || svc.price === lead.unitPrice || svc.price === lead.priceAck) return null;
    return { from: lead.unitPrice, to: svc.price };
  });

  // Edición del precio: servicio, cantidad y categoría (solo mientras el lead está abierto).
  // Cada uno vuelve al valor guardado cuando cambia el precio pactado del lead (no con cualquier cambio del lead).
  private readonly savedPricing = computed(
    () => {
      const lead = this.lead();
      return {
        serviceId: lead?.serviceId ?? '',
        quantity: lead?.quantity || 1,
        tier: (lead?.serviceId ? lead.tier : 'bronze') as PriceTier,
      };
    },
    { equal: (a, b) => a.serviceId === b.serviceId && a.quantity === b.quantity && a.tier === b.tier },
  );
  protected readonly pServiceId = linkedSignal(() => this.savedPricing().serviceId);
  protected readonly pQuantity = linkedSignal(() => this.savedPricing().quantity);
  protected readonly pTier = linkedSignal(() => this.savedPricing().tier);
  protected readonly pService = computed(() => this.catalog.byId().get(this.pServiceId()) ?? null);
  /** Si no cambia la categoría se conserva el % pactado; si cambia, se usa el vigente. */
  protected readonly pPct = computed(() => {
    const lead = this.lead();
    return lead && lead.serviceId && this.pTier() === lead.tier ? lead.tierPct : this.catalog.rate(this.pTier());
  });
  protected readonly pUnitPrice = computed(() => {
    const lead = this.lead();
    if (lead?.serviceId && lead.serviceId === this.pServiceId()) return lead.unitPrice;
    return this.pService()?.price ?? 0;
  });
  protected readonly pRates = computed(() => {
    const lead = this.lead();
    const rates = { ...this.catalog.rates() };
    if (lead?.serviceId) rates[lead.tier] = lead.tierPct;
    return rates;
  });
  protected readonly pDirty = computed(() => {
    const lead = this.lead();
    if (!lead) return false;
    return (
      this.pServiceId() !== (lead.serviceId ?? '') ||
      (!!this.pService()?.unit && this.pQuantity() !== lead.quantity) ||
      (!!this.pServiceId() && this.pTier() !== lead.tier)
    );
  });
  protected readonly pSaving = signal(false);

  /** Cierre en curso (ganado o perdido): se abre en línea debajo de las etapas. */
  protected readonly closing = signal<'won' | 'lost' | null>(null);

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
  /**
   * Follow-up que vence hoy o ya venció: registrar un contacto lo da por hecho
   * (si no, seguiría saliendo como vencido en Hoy aunque ya se habló con el cliente).
   */
  protected readonly duePending = computed(() => {
    const end = new Date(this.clock.now());
    end.setHours(23, 59, 59, 999);
    return this.pending().find((f) => f.dueAt <= end) ?? null;
  });
  protected readonly completesDue = computed(() => !!this.duePending() && this.logType() !== 'note');
  protected readonly dueText = computed(() => {
    const fu = this.duePending();
    if (!fu) return '';
    const what = fu.note.trim() || channelLabel(fu.channel);
    return `${what} (${dueLabel(fu.dueAt, this.clock.now()).toLowerCase()})`;
  });
  /** El vendedor puede desmarcarlo si la llamada no era la del follow-up. */
  protected readonly completeDue = signal(true);

  // Programar otra acción
  protected readonly addingNext = signal(false);

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
      // La limpieza del effect corta la escucha al cambiar de lead y al destruirse la vista.
      const q = untracked(() => this.activitiesService.watch(id));
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
    // Ganar o perder pasa por el mismo paso de cierre que en el pipeline.
    if (isClosed(stage)) {
      this.closing.set(stage as 'won' | 'lost');
      return;
    }
    this.closing.set(null);
    try {
      const from = lead.stage;
      await this.leadsService.moveToStage(lead, stage);
      this.toast.show(t('detail.movedTo', { name: lead.serviceName || lead.name, stage: stageMeta(stage).label }), {
        action: {
          label: t('common.undo'),
          run: () => this.toast.follow(this.leadsService.moveToStage({ ...lead, stage }, from), t('common.undone')),
        },
      });
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected resetPricing(): void {
    const saved = this.savedPricing();
    this.pServiceId.set(saved.serviceId);
    this.pQuantity.set(saved.quantity);
    this.pTier.set(saved.tier);
  }

  protected async savePricing(): Promise<void> {
    const lead = this.lead();
    const svc = this.pService();
    if (!lead || !svc) return;
    const quantity = svc.unit ? Math.max(1, Math.floor(Number(this.pQuantity()) || 1)) : 1;
    const unitPrice = this.pUnitPrice();
    const tierPct = this.pPct();
    const value = salePrice(unitPrice, quantity, tierPct);
    const changes: string[] = [];
    if (lead.serviceId !== svc.id) changes.push(t('pricing.noteService', { name: svc.name }));
    else {
      if (quantity !== lead.quantity) changes.push(t('pricing.noteQty', { from: lead.quantity, to: quantity }));
      if (this.pTier() !== lead.tier) changes.push(`${tierLabel(lead.tier)} → ${tierLabel(this.pTier())}`);
    }
    changes.push(t('pricing.noteValue', { value: moneyLabel(value) }));
    this.pSaving.set(true);
    try {
      await this.leadsService.updatePricing(lead, {
        serviceId: svc.id,
        serviceName: svc.name,
        quantity,
        unitPrice,
        tier: this.pTier(),
        tierPct,
        value,
        note: changes.join(' · '),
      });
      this.toast.show(t('pricing.saved'));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.pSaving.set(false);
    }
  }

  /** Acepta el precio oficial nuevo (y el % vigente de su categoría). */
  protected async acceptNewPrice(): Promise<void> {
    const lead = this.lead();
    const change = this.priceChange();
    if (!lead || !change) return;
    const tierPct = this.catalog.rate(lead.tier);
    const value = salePrice(change.to, lead.quantity, tierPct);
    try {
      await this.leadsService.updatePricing(lead, {
        serviceId: lead.serviceId,
        serviceName: lead.serviceName,
        quantity: lead.quantity,
        unitPrice: change.to,
        tier: lead.tier,
        tierPct,
        value,
        note: t('pricing.noteAccepted', { from: moneyLabel(change.from), to: moneyLabel(change.to), value: moneyLabel(value) }),
      });
      this.toast.show(t('pricing.saved'));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async keepOldPrice(): Promise<void> {
    const lead = this.lead();
    const change = this.priceChange();
    if (!lead || !change) return;
    try {
      await this.leadsService.keepPrice(
        lead,
        change.to,
        t('pricing.noteKept', { price: moneyLabel(change.from), ignored: moneyLabel(change.to) }),
      );
      this.toast.show(t('pricing.kept'));
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
      const due = this.duePending();
      if (due && this.completesDue() && this.completeDue()) {
        await this.followUps.complete(due, { outcome: body, channel: this.logType() as ContactChannel });
        this.toast.show(t('detail.loggedDone'));
      } else {
        await this.activitiesService.log(this.id(), this.logType(), body);
        this.toast.show(t('detail.logged'));
      }
      this.logBody.set('');
      this.completeDue.set(true);
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
        // Etapa y valor tienen su propio flujo; los datos de la persona viven en su contacto.
        const { stage: _stage, value: _value, assigneeId, ...patch } = this.model();
        const lead = this.lead();
        if (lead?.contactId) {
          const { source, notes } = patch;
          await this.leadsService.update(this.id(), { source, notes });
        } else {
          await this.leadsService.update(this.id(), patch);
        }
        // Reasignar es cosa de admin y arrastra los follow-ups pendientes.
        if (lead && this.auth.isAdmin() && assigneeId && assigneeId !== lead.assigneeId) {
          const pending = this.followUps.forLead(lead.id).map((f) => f.id);
          await this.leadsService.reassign(lead, assigneeId, pending);
        }
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
      await this.leadsService.remove(lead);
      this.toast.show(t('detail.deleted', { name: lead.name }));
      void this.router.navigateByUrl('/leads');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected canDelete(): boolean {
    const lead = this.lead();
    // Igual que las reglas: el admin, o su creador si sigue siendo el responsable y no está ganado.
    return (
      !!lead &&
      (this.auth.isAdmin() || (lead.createdBy === this.auth.uid() && lead.assigneeId === this.auth.uid() && lead.stage !== 'won'))
    );
  }

  protected activityLabel(a: Activity): string {
    return activityLabel(a.type);
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
