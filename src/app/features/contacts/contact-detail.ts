import { Component, Injector, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { dealServices, dealTitle } from '../../core/deal-lines';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArchive,
  LucideArchiveRestore,
  LucideArrowLeft,
  LucideCheck,
  LucideMail,
  LucideMessageCircle,
  LucidePhone,
  LucidePlus,
  LucideTrash2,
  LucideUsers,
} from '@lucide/angular';
import { ActivitiesService } from '../../core/activities.service';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock.service';
import { ContactsService } from '../../core/contacts.service';
import { agoLabel, fullLabel, moneyLabel } from '../../core/dates';
import { LiveQuery, firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { intlLocale, t } from '../../core/i18n/i18n';
import { MembersService } from '../../core/members.service';
import { Activity, Contact, ContactDraft, Lead, activityLabel, lostReasonLabel, stageMeta, tierLabel, wonDate } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { ChannelIcon } from '../../shared/channel-icon';
import { mailHref, telHref, whatsappHref } from '../../shared/contact-links';
import { EmptyState } from '../../shared/empty-state';
import { FollowUpItem } from '../../shared/followup-item';
import { StageBadge } from '../../shared/stage-badge';


interface HistoryEntry extends Activity {
  lead: Lead;
}

/** Ficha del cliente: sus negocios abiertos, lo que ya compró y todo su historial junto. */
@Component({
  selector: 'app-contact-detail',
  imports: [
    RouterLink,
    FormField,
    ChannelIcon,
    EmptyState,
    FollowUpItem,
    StageBadge,
    LucideArrowLeft,
    LucideCheck,
    LucidePhone,
    LucideMessageCircle,
    LucideMail,
    LucidePlus,
    LucideTrash2,
    LucideUsers,
    LucideArchive,
    LucideArchiveRestore,
  ],
  templateUrl: './contact-detail.html',
})
export class ContactDetail {
  /** Viene de la ruta `/contacts/:id`. */
  readonly id = input.required<string>();

  private readonly clock = inject(Clock);
  protected readonly contacts = inject(ContactsService);
  private readonly activitiesService = inject(ActivitiesService);
  protected readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  protected readonly ui = inject(UiService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly t = t;
  protected readonly lostLabel = lostReasonLabel;
  protected readonly money = moneyLabel;
  protected readonly tierName = tierLabel;

  protected readonly contact = computed(() => this.contacts.byId().get(this.id()));
  protected readonly loading = this.contacts.loading;
  protected readonly summary = computed(() => this.contacts.summary(this.id()));
  protected readonly openValue = computed(() => this.summary().open.reduce((s, l) => s + l.value, 0));
  protected readonly othersNames = computed(() =>
    new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(this.summary().othersOpen.map((uid) => this.members.name(uid))),
  );
  protected readonly showLost = signal(false);
  /** Confirmación en línea de archivar o eliminar (solo admin). */
  protected readonly confirming = signal<'archive' | 'delete' | null>(null);
  protected readonly busy = signal(false);
  protected readonly dealCount = computed(() => {
    const s = this.summary();
    return s.open.length + s.won.length + s.lost.length;
  });
  /** Un cliente con ventas no se elimina: se archiva. */
  protected readonly canDelete = computed(() => this.auth.isAdmin() && this.summary().wonCount === 0);
  protected readonly editing = signal(false);

  protected readonly tel = computed(() => telHref(this.contact()?.phone ?? ''));
  protected readonly wa = computed(() => whatsappHref(this.contact()?.phone ?? ''));
  protected readonly mail = computed(() => mailHref(this.contact()?.email ?? ''));

  /** Historial de cada lead del contacto, escuchado en vivo y mezclado por fecha. */
  private readonly histories = signal<{ lead: Lead; q: LiveQuery<Activity> }[]>([]);
  protected readonly history = computed<HistoryEntry[]>(() =>
    this.histories()
      .flatMap(({ lead, q }) => q.data().map((a) => ({ ...a, lead })))
      .sort((a, b) => (b.createdAt?.getTime() ?? Date.now()) - (a.createdAt?.getTime() ?? Date.now())),
  );
  protected readonly historyLoading = computed(() => this.histories().some(({ q }) => q.loading()));
  protected readonly historyLimit = signal(15);

  protected readonly model = signal<ContactDraft>({ name: '', company: '', email: '', phone: '', assigneeId: '', notes: '' });
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'form.nameEmpty' });
    email(p.email, { message: 'form.emailInvalid' });
  });

  private readonly leadIds = computed(() => {
    const s = this.summary();
    return [...s.open, ...s.won, ...s.lost].map((l) => l.id).sort().join(',');
  });

  constructor() {
    effect((onCleanup) => {
      this.leadIds();
      const s = untracked(() => this.summary());
      const leads = [...s.open, ...s.won, ...s.lost];
      const entries = leads.map((lead) => ({ lead, q: this.activitiesService.watch(lead.id, 50) }));
      this.histories.set(entries);
      onCleanup(() => entries.forEach((e) => e.q.stop()));
    });
  }

  protected startEdit(): void {
    const c = this.contact();
    if (!c) return;
    this.model.set({ name: c.name, company: c.company, email: c.email, phone: c.phone, assigneeId: c.assigneeId, notes: c.notes });
    this.f().reset();
    this.editing.set(true);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const c = this.contact();
    if (!c) return;
    await submit(this.f, async () => {
      try {
        await this.contacts.update(c, this.model());
        this.editing.set(false);
        this.toast.show(t('detail.saved'));
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  /** Abre la confirmación en línea y lleva el foco a su pregunta; al cerrar, vuelve al botón. */
  protected openConfirm(kind: 'archive' | 'delete'): void {
    this.confirming.set(kind);
    this.focusLater('confirm-title');
  }
  protected closeConfirm(): void {
    const kind = this.confirming();
    this.confirming.set(null);
    if (kind) this.focusLater(kind === 'archive' ? 'manage-archive' : 'manage-delete');
  }
  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  protected async archive(c: Contact): Promise<void> {
    this.busy.set(true);
    try {
      await this.contacts.archive(c, t('contact.archivedReason'));
      this.confirming.set(null);
      this.focusLater('archived-banner');
      this.toast.show(t('contact.archivedMsg', { name: c.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async unarchive(c: Contact): Promise<void> {
    try {
      await this.contacts.unarchive(c);
      this.focusLater('manage-archive');
      this.toast.show(t('contact.unarchived', { name: c.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected async remove(c: Contact): Promise<void> {
    this.busy.set(true);
    try {
      await this.contacts.remove(c);
      this.toast.show(t('contact.deleted', { name: c.name }));
      void this.router.navigateByUrl('/contacts');
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected nextFor(lead: Lead) {
    return this.followUps.forLead(lead.id)[0] ?? null;
  }

  protected dealServices(l: Lead): string {
    return dealServices(l) || t('lead.noService');
  }

  protected dealTitle(l: Lead): string {
    return dealTitle(l) || t('lead.noService');
  }

  protected dateLabel(d: Date | null): string {
    return d ? new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '') : '—';
  }
  protected wonOn(l: Lead): string {
    return this.dateLabel(wonDate(l));
  }
  protected since(): string {
    const d = this.summary().customerSince;
    return d ? new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric' }).format(d).replace('.', '') : '';
  }
  protected ago(d: Date | null): string {
    return agoLabel(d, this.clock.now());
  }
  protected activityLabel(a: Activity): string {
    return activityLabel(a.type);
  }
  protected activityBody(a: HistoryEntry): string {
    if (a.type === 'created' && (a.body === a.lead.serviceName || a.body === dealServices(a.lead))) return '';
    if (a.type === 'stage' && a.from && a.to && a.to !== 'lost') return `${stageMeta(a.from).label} → ${stageMeta(a.to).label}`;
    return a.body;
  }
  protected full = fullLabel;
}
