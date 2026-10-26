import { Component, Injector, afterNextRender, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
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
import { DealLine, EditLine, dealLines, dealTitle, linesOfficial, linesPricing, linesValue, pricedLines, staleLines } from '../../core/deal-lines';
import { MembersService } from '../../core/members.service';
import {
  Activity,
  ActivityType,
  ContactChannel,
  activityLabel,
  Lead,
  LeadDraft,
  PriceTier,
  SOURCES,
  STAGES,
  Stage,
  sourceLabel,
  channelLabel,
  isClosed,
  lostReasonLabel,
  stageMeta,
  tierLabel,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { ChannelIcon } from '../../shared/channel-icon';
import { mailHref, telHref, whatsappHref } from '../../shared/contact-links';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { ScheduleForm } from '../../shared/schedule-form';
import { LinesEditor } from '../../shared/lines-editor';
import { TierPicker } from '../../shared/tier-picker';
import { DealInvoice } from '../../shared/deal-invoice';
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
    LinesEditor,
    CloseDeal,
    DealInvoice,
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
  private readonly injector = inject(Injector);
  private readonly clock = inject(Clock);
  protected readonly auth = inject(AuthService);
  protected readonly leadsService = inject(LeadsService);
  private readonly activitiesService = inject(ActivitiesService);
  protected readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  protected readonly catalog = inject(CatalogService);
  protected readonly contacts = inject(ContactsService);
  private readonly toast = inject(ToastService);
  protected readonly ui = inject(UiService);

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
  /** Servicios del negocio con su precio pactado. */
  protected readonly lines = computed(() => {
    const lead = this.lead();
    return lead ? dealLines(lead) : [];
  });
  protected readonly title = computed(() => {
    const lead = this.lead();
    return lead ? dealTitle(lead) : '';
  });
  /** Precios oficiales nuevos pendientes de decidir (negocio abierto, aún no aceptados ni descartados). */
  protected readonly priceChanges = computed(() => (this.isOpen() ? staleLines(this.lines(), this.catalog.byId()) : []));

  // Edición del precio: servicios, cantidades y categoría (solo mientras el negocio está abierto).
  // Vuelven a lo guardado cuando cambia lo pactado (no con cualquier cambio del negocio).
  private readonly savedPricing = computed(
    () => {
      const lead = this.lead();
      const lines: EditLine[] = this.lines().map((x) => ({ serviceId: x.serviceId, quantity: x.quantity }));
      return {
        lines: lines.length ? lines : [{ serviceId: '', quantity: 1 }],
        tier: (lead?.serviceId ? lead.tier : 'bronze') as PriceTier,
      };
    },
    { equal: (a, b) => a.tier === b.tier && sameLines(a.lines, b.lines) },
  );
  protected readonly pLines = linkedSignal(() => this.savedPricing().lines);
  protected readonly pTier = linkedSignal(() => this.savedPricing().tier);
  /** Lo elegido con precio: lo que ya estaba en su lugar conserva el pactado. */
  protected readonly pPriced = computed(() => pricedLines(this.pLines(), this.catalog.byId(), this.lines()));
  protected readonly pOfficial = computed(() => linesOfficial(this.pPriced()));
  protected readonly keepIds = computed(() => this.lines().map((x) => x.serviceId));
  /** Si no cambia la categoría se conserva el % pactado; si cambia, se usa el vigente. */
  protected readonly pPct = computed(() => {
    const lead = this.lead();
    return lead && lead.serviceId && this.pTier() === lead.tier ? lead.tierPct : this.catalog.rate(this.pTier());
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
    const chosen = this.pPriced().map((x) => ({ serviceId: x.serviceId, quantity: x.quantity }));
    const saved = this.lines().map((x) => ({ serviceId: x.serviceId, quantity: x.quantity }));
    return !sameLines(chosen, saved) || (chosen.length > 0 && this.pTier() !== lead.tier);
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
  /** Entrada del historial que el admin está por borrar (confirmación en línea). */
  protected readonly removingActivity = signal<string | null>(null);
  protected readonly busy = signal(false);

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
      this.toast.show(t('detail.movedTo', { name: dealTitle(lead) || lead.name, stage: stageMeta(stage).label }), {
        action: {
          label: t('common.undo'),
          run: () => this.toast.follow(this.leadsService.moveToStage({ ...lead, stage }, from), t('common.undone')),
        },
      });
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected unitLabel(serviceId: string): string {
    const unit = this.catalog.byId().get(serviceId)?.unit;
    return unit ? ' / ' + unit : '';
  }

  protected resetPricing(): void {
    const saved = this.savedPricing();
    this.pLines.set(saved.lines);
    this.pTier.set(saved.tier);
  }

  protected async savePricing(): Promise<void> {
    const lead = this.lead();
    const lines = this.pPriced();
    if (!lead || !lines.length) return;
    const tierPct = this.pPct();
    const value = linesValue(lines, tierPct);
    const before = this.lines();
    const changes: string[] = [];
    const sameServices = lines.length === before.length && lines.every((x, i) => x.serviceId === before[i].serviceId);
    if (!sameServices) changes.push(t('pricing.noteServices', { names: lines.map((x) => x.serviceName).join(' + ') }));
    else if (lines.length === 1 && lines[0].quantity !== before[0].quantity) {
      changes.push(t('pricing.noteQty', { from: before[0].quantity, to: lines[0].quantity }));
    } else if (lines.some((x, i) => x.quantity !== before[i].quantity)) {
      changes.push(t('pricing.noteServices', { names: lines.map((x) => `${x.serviceName} × ${x.quantity}`).join(' + ') }));
    }
    if (lead.serviceId && this.pTier() !== lead.tier) changes.push(`${tierLabel(lead.tier)} → ${tierLabel(this.pTier())}`);
    changes.push(t('pricing.noteValue', { value: moneyLabel(value) }));
    await this.writePricing(lead, lines, this.pTier(), tierPct, changes.join(' · '), t('pricing.saved'));
  }

  /** Acepta los precios oficiales nuevos (y el % vigente de su categoría). */
  protected async acceptNewPrice(): Promise<void> {
    const lead = this.lead();
    const changes = this.priceChanges();
    if (!lead || !changes.length) return;
    const lines = this.lines().map((x, i) => {
      const c = changes.find((ch) => ch.index === i);
      return c ? { ...x, unitPrice: c.to, ack: null } : x;
    });
    const tierPct = this.catalog.rate(lead.tier);
    const value = moneyLabel(linesValue(lines, tierPct));
    const note =
      changes.length === 1
        ? t('pricing.noteAccepted', { from: moneyLabel(changes[0].from), to: moneyLabel(changes[0].to), value })
        : t('pricing.noteAcceptedN', { names: changes.map((c) => c.name).join(', '), value });
    await this.writePricing(lead, lines, lead.tier, tierPct, note, t('pricing.saved'));
  }

  /** Mantiene los precios pactados y no vuelve a avisar por estos precios oficiales. */
  protected async keepOldPrice(): Promise<void> {
    const lead = this.lead();
    const changes = this.priceChanges();
    if (!lead || !changes.length) return;
    const lines = this.lines().map((x, i) => {
      const c = changes.find((ch) => ch.index === i);
      return c ? { ...x, ack: c.to } : x;
    });
    const note =
      changes.length === 1
        ? t('pricing.noteKept', { price: moneyLabel(changes[0].from), ignored: moneyLabel(changes[0].to) })
        : t('pricing.noteKeptN', { names: changes.map((c) => c.name).join(', ') });
    await this.writePricing(lead, lines, lead.tier, lead.tierPct, note, t('pricing.kept'));
  }

  private async writePricing(lead: Lead, lines: DealLine[], tier: PriceTier, tierPct: number, note: string, done: string): Promise<void> {
    this.pSaving.set(true);
    try {
      await this.leadsService.updatePricing(lead, { ...linesPricing(lines, tier, tierPct), note });
      this.toast.show(done);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.pSaving.set(false);
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

  protected askRemoveActivity(a: Activity): void {
    this.removingActivity.set(a.id);
    afterNextRender(() => document.getElementById('del-act-q-' + a.id)?.focus(), { injector: this.injector });
  }

  protected cancelRemoveActivity(a: Activity): void {
    this.removingActivity.set(null);
    afterNextRender(() => document.getElementById('del-act-' + a.id)?.focus(), { injector: this.injector });
  }

  protected async removeActivity(a: Activity): Promise<void> {
    const lead = this.lead();
    if (!lead) return;
    this.busy.set(true);
    try {
      await this.activitiesService.remove(lead.id, a, [lead.name, dealTitle(lead)].filter(Boolean).join(' · '));
      this.removingActivity.set(null);
      this.toast.show(t('detail.entryDeleted'));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected canDelete(): boolean {
    const lead = this.lead();
    // Igual que las reglas: el admin, o su creador si sigue siendo el responsable y no está ganado.
    return (
      !!lead &&
      !lead.invoiceId &&
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

/** Mismos servicios y cantidades, en el mismo orden. */
function sameLines(a: readonly EditLine[], b: readonly EditLine[]): boolean {
  return a.length === b.length && a.every((x, i) => x.serviceId === b[i].serviceId && x.quantity === b[i].quantity);
}
