import { Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { dealTitle } from '../../core/deal-lines';
import { RouterLink } from '@angular/router';
import { LucideLock } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { ContactsService } from '../../core/contacts.service';
import { FollowUpsService } from '../../core/followups.service';
import { moneyLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Lead, STAGES, Stage, isClosed, stageMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';
import { CloseDeal } from '../../shared/close-deal';
import { DueChip } from '../../shared/due-chip';
import { ScheduleForm } from '../../shared/schedule-form';
import { DEAL_TABS, SectionTabs } from '../../shared/section-tabs';
import { UiService } from '../../core/ui.service';

/**
 * Pipeline por etapas. Arrastrar una tarjeta la cambia de etapa;
 * con teclado, Alt + ← / → sobre la tarjeta hace lo mismo.
 */
@Component({
  selector: 'app-pipeline',
  imports: [RouterLink, DueChip, Avatar, CloseDeal, ScheduleForm, SectionTabs, LucideLock],
  templateUrl: './pipeline.html',
})
export class Pipeline {
  protected readonly leadsService = inject(LeadsService);
  protected readonly members = inject(MembersService);
  protected readonly auth = inject(AuthService);
  private readonly contacts = inject(ContactsService);
  private readonly followUps = inject(FollowUpsService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);


  protected readonly t = t;
  protected readonly dealTabs = DEAL_TABS;
  protected readonly money = moneyLabel;
  protected readonly scope = signal<'mine' | 'team'>('team');
  /** Todos, solo clientes nuevos (prospectos) o solo recompras de clientes. */
  protected readonly kind = signal<'all' | 'new' | 'repeat'>('all');
  protected readonly dragging = signal<string | null>(null);
  protected readonly over = signal<Stage | null>(null);
  /** Cierre en curso: se abre encima del tablero, igual que en la ficha. */
  protected readonly closing = signal<{ lead: Lead; to: 'won' | 'lost' } | null>(null);
  /** Negocio que quedó sin próxima acción al cambiar de etapa. */
  protected readonly nexting = signal<Lead | null>(null);

  protected readonly columns = computed(() => {
    const leads = this.leadsService
      .leads()
      .filter((l) => !this.auth.isAdmin() || this.scope() === 'team' || l.assigneeId === this.auth.uid())
      .filter((l) => this.kind() === 'all' || (this.kind() === 'repeat') === this.isRepeat(l));
    return STAGES.map((s) => {
      const items = leads
        .filter((l) => l.stage === s.id)
        .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0));
      return {
        ...s,
        items,
        total: moneyLabel(items.reduce((sum, l) => sum + l.value, 0)),
      };
    });
  });

  constructor() {
    inject(UiService).rememberDealsView('/pipeline');
  }

  /** Recompra: el contacto ya había ganado otro negocio. */
  protected isRepeat(lead: Lead): boolean {
    return this.contacts.summary(lead.contactId).wonCount > (lead.stage === 'won' ? 1 : 0);
  }

  protected title(lead: Lead): string {
    return dealTitle(lead) || lead.name;
  }

  protected onDragStart(event: DragEvent, lead: Lead): void {
    if (this.leadsService.locked(lead)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', lead.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragging.set(lead.id);
  }

  protected onDragEnd(): void {
    this.dragging.set(null);
    this.over.set(null);
  }

  protected onDragOver(event: DragEvent, stage: Stage): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.over.set(stage);
  }

  protected onDrop(event: DragEvent, stage: Stage): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || this.dragging();
    this.onDragEnd();
    const lead = id ? this.leadsService.byId().get(id) : undefined;
    if (lead) void this.move(lead, stage);
  }

  protected onCardKey(event: KeyboardEvent, lead: Lead): void {
    if (!event.altKey || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    event.preventDefault();
    if (this.leadsService.locked(lead)) {
      this.toast.show(t('detail.wonLocked'));
      return;
    }
    const idx = STAGES.findIndex((s) => s.id === lead.stage);
    const next = STAGES[idx + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      void this.move(lead, next.id).then(() => {
        // Si se abrió el cierre o la próxima acción, el foco ya está allí.
        if (!this.closing() && !this.nexting()) requestAnimationFrame(() => document.getElementById(`card-${lead.id}`)?.focus());
      });
    }
  }

  private async move(lead: Lead, stage: Stage): Promise<void> {
    if (lead.stage === stage) return;
    this.nexting.set(null);
    // Ganar o perder abre el mismo paso de cierre que en la ficha (motivo, postventa).
    if (isClosed(stage)) {
      this.closing.set({ lead, to: stage as 'won' | 'lost' });
      return;
    }
    this.closing.set(null);
    const from = lead.stage;
    try {
      await this.leadsService.moveToStage(lead, stage);
      this.toast.show(t('detail.movedTo', { name: this.title(lead), stage: stageMeta(stage).label }), {
        action: {
          label: t('common.undo'),
          run: () => this.toast.follow(this.leadsService.moveToStage({ ...lead, stage }, from), t('common.undone')),
        },
      });
      // Un negocio abierto siempre tiene próxima acción: si no la tiene, se pide aquí mismo.
      if (!this.followUps.forLead(lead.id).length) {
        this.nexting.set({ ...lead, stage });
        afterNextRender(() => document.getElementById('next-panel-title')?.focus(), { injector: this.injector });
      }
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }
}
