import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { LucideBadgeCheck, LucideCalendarClock, LucidePlus, LucideUserRound, LucideX } from '@lucide/angular';
import { CatalogService } from '../../core/catalog.service';
import { ContactsService } from '../../core/contacts.service';
import { moneyLabel } from '../../core/dates';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { EditLine, linesOfficial, linesPricing, linesValue, pricedLines } from '../../core/deal-lines';
import { Contact, ContactChannel, LeadSource, OPEN_STAGES, PriceTier, SOURCES, Stage } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { ChannelPicker } from '../../shared/channel-picker';
import { LinesEditor } from '../../shared/lines-editor';
import { TierPicker } from '../../shared/tier-picker';
import { WhenPicker } from '../../shared/when-picker';
import { presetDate } from '../../core/dates';

interface CaptureModel {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  stage: Stage;
  assigneeId: string;
  notes: string;
  detail: string;
}

function emptyModel(uid: string): CaptureModel {
  return {
    name: '',
    company: '',
    phone: '',
    email: '',
    source: 'web',
    stage: 'new',
    assigneeId: uid,
    notes: '',
    detail: '',
  };
}

/**
 * Captura rápida: quién (o un contacto que ya existe), qué servicio quiere y cómo quedó.
 * "Le interesa" programa la primera próxima acción (por defecto, para que ningún negocio
 * nazca huérfano); "Vendido" lo guarda ya ganado, con la postventa programada.
 * Crea el contacto y su negocio en un solo paso.
 */
@Component({
  selector: 'app-capture-drawer',
  imports: [FormField, RouterLink, ChannelPicker, WhenPicker, TierPicker, LinesEditor, LucideX, LucidePlus, LucideUserRound, LucideCalendarClock, LucideBadgeCheck],
  templateUrl: './capture-drawer.html',
})
export class CaptureDrawer {
  protected readonly ui = inject(UiService);
  protected readonly auth = inject(AuthService);
  private readonly leads = inject(LeadsService);
  private readonly followUps = inject(FollowUpsService);
  protected readonly members = inject(MembersService);
  protected readonly catalog = inject(CatalogService);
  protected readonly contacts = inject(ContactsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly t = t;
  protected readonly sources = SOURCES;
  protected readonly stages = OPEN_STAGES;

  protected readonly model = signal<CaptureModel>(emptyModel(''));
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'form.nameRequired' });
    email(p.email, { message: 'form.emailInvalid' });
  });

  /** Contacto elegido en el buscador o al abrir desde su ficha ("Nuevo negocio"). */
  protected readonly chosenId = signal<string | null>(null);
  protected readonly fixedContact = computed(() => {
    const id = this.chosenId();
    return id ? (this.contacts.byId().get(id) ?? null) : null;
  });

  // Buscador "¿Para quién?": sugiere contactos mientras se escribe el nombre.
  protected readonly suggestOpen = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly suggestions = computed(() => this.contacts.search(this.model().name));
  /** Opciones del listbox: los contactos y, al final, "nuevo contacto". */
  protected readonly optionCount = computed(() => this.suggestions().length + 1);
  protected readonly showSuggestions = computed(() => this.suggestOpen() && this.suggestions().length > 0);
  /** Contacto existente con el mismo email o teléfono que lo escrito. */
  protected readonly match = computed<Contact | null>(() => {
    if (this.fixedContact()) return null;
    const m = this.model();
    return this.contacts.findMatch(m.email, m.phone);
  });
  /** Ante una coincidencia: añadir el negocio a ese contacto o crear otro. */
  protected readonly useMatch = signal(true);
  protected readonly targetContact = computed(() => this.fixedContact() ?? (this.useMatch() ? this.match() : null));

  protected readonly tier = signal<PriceTier>('bronze');
  /** Servicios que quiere comprar (uno o varios) y su precio oficial de hoy. */
  protected readonly lines = signal<EditLine[]>([{ serviceId: '', quantity: 1 }]);
  protected readonly priced = computed(() => pricedLines(this.lines(), this.catalog.byId()));
  protected readonly official = computed(() => linesOfficial(this.priced()));
  protected readonly money = moneyLabel;
  protected readonly value = computed(() => linesValue(this.priced(), this.catalog.rate(this.tier())));

  /** Cómo quedó: "open" = le interesa (sigue con próxima acción), "won" = ya compró. */
  protected readonly outcome = signal<'open' | 'won'>('open');
  protected readonly sold = computed(() => this.outcome() === 'won');
  protected readonly postSale = signal(true);
  /** Una venta necesita saber qué se vendió (si hay catálogo). */
  protected readonly needService = computed(() => this.sold() && this.catalog.active().length > 0 && !this.priced().length);
  protected readonly showNeedService = signal(false);

  protected readonly scheduleNext = signal(true);
  protected readonly nextAt = signal(presetDate('tomorrow', new Date()));
  protected readonly nextChannel = signal<ContactChannel>('call');
  protected readonly nextNote = signal('');
  protected readonly saveError = signal<string | null>(null);
  /** Pregunta en línea antes de cerrar si ya se escribió algo (Esc, fondo, Cancelar). */
  protected readonly confirmDiscard = signal(false);

  /** Hay algo escrito que se perdería al cerrar. Los datos que vienen de la ficha del contacto no cuentan. */
  private readonly hasDraft = computed(() => {
    const m = this.model();
    const typedContact = !this.ui.captureContactId() && [m.name, m.company, m.phone, m.email].some((v) => v.trim());
    return typedContact || this.lines().some((l) => l.serviceId) || !!m.detail.trim() || !!m.notes.trim() || !!this.nextNote().trim();
  });

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

  protected onNameInput(): void {
    this.suggestOpen.set(true);
    this.activeIndex.set(0);
  }

  protected onNameKey(event: KeyboardEvent): void {
    if (!this.showSuggestions()) return;
    const n = this.optionCount();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % n);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + n) % n);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const c = this.suggestions()[this.activeIndex()];
      if (c) this.choose(c);
      else this.suggestOpen.set(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.suggestOpen.set(false);
    }
  }

  protected choose(c: Contact): void {
    this.chosenId.set(c.id);
    this.suggestOpen.set(false);
    this.model.update((m) => ({ ...m, name: c.name, company: c.company, email: c.email, phone: c.phone, assigneeId: this.ownerOf(c) }));
    // Directo a "qué quiere comprar".
    this.focusLater(() => document.getElementById('c-service')?.focus());
  }

  /** Vuelve a la búsqueda (solo si no se abrió desde la ficha del contacto). */
  protected unchoose(): void {
    this.chosenId.set(null);
    this.model.update((m) => ({ ...m, name: '', company: '', email: '', phone: '' }));
    this.focusLater(() => document.getElementById('c-name')?.focus());
  }

  protected boughtLabel(n: number): string {
    return n === 1 ? t('capture.bought1') : t('capture.boughtN', { n });
  }

  protected close(): void {
    this.ui.captureOpen.set(false);
    this.ui.captureContactId.set(null);
  }

  /** Cerrar sin guardar: si hay algo escrito, primero se pregunta en el pie del panel. */
  protected requestClose(): void {
    if (!this.hasDraft() || this.confirmDiscard()) {
      this.close();
      return;
    }
    this.confirmDiscard.set(true);
    this.focusLater(() => document.getElementById('c-keep')?.focus());
  }

  /** Esc nativo del <dialog>: se detiene para preguntar; un segundo Esc ya cierra. */
  protected onCancel(event: Event): void {
    if (this.hasDraft() && !this.confirmDiscard()) {
      event.preventDefault();
      this.requestClose();
    }
  }

  protected keepEditing(): void {
    this.confirmDiscard.set(false);
    this.focusLater(() => document.getElementById('c-name')?.focus() ?? document.getElementById('c-service')?.focus());
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.requestClose();
  }

  protected async save(event: Event, openAfter: boolean): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    if (this.needService()) {
      this.showNeedService.set(true);
      document.getElementById('c-service')?.focus();
      return;
    }
    await submit(this.f, async () => {
      try {
        const m = this.model();
        const contact = this.targetContact();
        const lines = this.priced();
        const pricing = lines.length ? linesPricing(lines, this.tier(), this.catalog.rate(this.tier())) : null;
        const person = contact ?? m;
        const { leadId: id } = await this.leads.create({
          contactId: contact?.id ?? null,
          contact: {
            name: person.name,
            company: person.company,
            email: person.email,
            phone: person.phone,
            assigneeId: m.assigneeId,
            notes: '',
          },
          source: m.source,
          stage: this.sold() ? 'won' : m.stage,
          assigneeId: m.assigneeId,
          notes: m.notes,
          detail: m.detail,
          pricing,
          firstFollowUp: this.firstFollowUp(),
        });
        this.toast.show(t(this.sold() ? 'capture.savedSale' : 'capture.saved', { name: person.name }), {
          action: openAfter ? undefined : { label: t('common.open'), run: () => this.router.navigate(['/leads', id]) },
        });
        this.close();
        if (openAfter) void this.router.navigate(['/leads', id]);
      } catch (err) {
        this.saveError.set(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  /** Vendido: la postventa (si se deja marcada). Le interesa: la próxima acción elegida. */
  private firstFollowUp(): { dueAt: Date; channel: ContactChannel; note: string } | null {
    if (this.sold()) {
      return this.postSale() ? { dueAt: this.followUps.postSaleDate(), channel: 'call', note: t('postsale.note') } : null;
    }
    return this.scheduleNext() ? { dueAt: this.nextAt(), channel: this.nextChannel(), note: this.nextNote() } : null;
  }

  /**
   * Responsable del negocio nuevo: el dueño de la cuenta del contacto, si sigue activo.
   * Solo cuenta para un admin; un vendedor siempre crea negocios a su nombre.
   */
  private ownerOf(c: Contact): string {
    const me = this.auth.uid();
    if (!this.auth.isAdmin()) return me;
    return this.members.active().some((m) => m.uid === c.assigneeId) ? c.assigneeId : me;
  }

  /** Mueve el foco cuando el cambio ya está pintado. */
  private focusLater(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }

  private reset(): void {
    const model = emptyModel(this.auth.uid());
    this.chosenId.set(untracked(() => this.ui.captureContactId()));
    this.suggestOpen.set(false);
    const fixed = untracked(() => this.fixedContact());
    if (fixed) {
      Object.assign(model, { name: fixed.name, company: fixed.company, email: fixed.email, phone: fixed.phone, assigneeId: this.ownerOf(fixed) });
    }
    this.model.set(model);
    this.f().reset();
    this.useMatch.set(true);
    this.lines.set([{ serviceId: '', quantity: 1 }]);
    this.tier.set('bronze');
    this.outcome.set('open');
    this.postSale.set(true);
    this.showNeedService.set(false);
    this.scheduleNext.set(true);
    this.nextAt.set(presetDate('tomorrow', new Date()));
    this.nextChannel.set('call');
    this.nextNote.set('');
    this.saveError.set(null);
    this.confirmDiscard.set(false);
  }
}
