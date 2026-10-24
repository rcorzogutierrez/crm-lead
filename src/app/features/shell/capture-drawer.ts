import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormField, email, form, min, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { LucidePlus, LucideUserRound, LucideX } from '@lucide/angular';
import { CatalogService } from '../../core/catalog.service';
import { ContactsService } from '../../core/contacts.service';
import { moneyLabel } from '../../core/dates';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { FollowUpsService } from '../../core/followups.service';
import { t } from '../../core/i18n/i18n';
import { LeadsService } from '../../core/leads.service';
import { MembersService } from '../../core/members.service';
import { Contact, ContactChannel, LeadPricing, LeadSource, OPEN_STAGES, PriceTier, SOURCES, Stage, salePrice } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { ChannelPicker } from '../../shared/channel-picker';
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
  serviceId: string;
  quantity: number;
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
    serviceId: '',
    quantity: 1,
    detail: '',
  };
}

/**
 * Captura rápida: quién (o un contacto que ya existe), qué servicio quiere y la
 * primera próxima acción ya programada por defecto, para que ningún lead nazca huérfano.
 * Crea el contacto y su lead en un solo paso.
 */
@Component({
  selector: 'app-capture-drawer',
  imports: [FormField, RouterLink, ChannelPicker, WhenPicker, TierPicker, LucideX, LucidePlus, LucideUserRound],
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

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly t = t;
  protected readonly sources = SOURCES;
  protected readonly stages = OPEN_STAGES;

  protected readonly model = signal<CaptureModel>(emptyModel(''));
  protected readonly f = form(this.model, (p) => {
    required(p.name, { message: 'form.nameRequired' });
    email(p.email, { message: 'form.emailInvalid' });
    min(p.quantity, 1, { message: 'form.quantityMin' });
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
  protected readonly service = computed(() => this.catalog.byId().get(this.model().serviceId) ?? null);
  protected readonly quantity = computed(() => (this.service()?.unit ? Math.max(1, Number(this.model().quantity) || 1) : 1));
  protected readonly official = computed(() => (this.service()?.price ?? 0) * this.quantity());
  protected readonly money = moneyLabel;

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
    return typedContact || !!m.serviceId || !!m.detail.trim() || !!m.notes.trim() || !!this.nextNote().trim();
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
    this.model.update((m) => ({ ...m, name: c.name, company: c.company, email: c.email, phone: c.phone }));
    // Directo a "qué quiere comprar".
    setTimeout(() => document.getElementById('c-service')?.focus());
  }

  /** Vuelve a la búsqueda (solo si no se abrió desde la ficha del contacto). */
  protected unchoose(): void {
    this.chosenId.set(null);
    this.model.update((m) => ({ ...m, name: '', company: '', email: '', phone: '' }));
    setTimeout(() => document.getElementById('c-name')?.focus());
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
    setTimeout(() => document.getElementById('c-keep')?.focus());
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
    setTimeout(() => document.getElementById('c-name')?.focus() ?? document.getElementById('c-service')?.focus());
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.requestClose();
  }

  protected async save(event: Event, openAfter: boolean): Promise<void> {
    event.preventDefault();
    this.saveError.set(null);
    await submit(this.f, async () => {
      try {
        const m = this.model();
        const contact = this.targetContact();
        const svc = this.service();
        const pct = this.catalog.rate(this.tier());
        const pricing: LeadPricing | null = svc
          ? {
              serviceId: svc.id,
              serviceName: svc.name,
              quantity: this.quantity(),
              unitPrice: svc.price,
              tier: this.tier(),
              tierPct: pct,
              value: salePrice(svc.price, this.quantity(), pct),
            }
          : null;
        const person = contact ?? m;
        const draft = { name: person.name, company: person.company, assigneeId: m.assigneeId || this.auth.uid() };
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
          stage: m.stage,
          assigneeId: m.assigneeId,
          notes: m.notes,
          detail: m.detail,
          pricing,
        });
        if (this.scheduleNext()) {
          await this.followUps.schedule(
            { id, name: draft.name, company: draft.company, assigneeId: draft.assigneeId },
            this.nextAt(),
            this.nextChannel(),
            this.nextNote(),
          );
        }
        this.toast.show(t('capture.saved', { name: draft.name }), {
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

  private reset(): void {
    const model = emptyModel(this.auth.uid());
    this.chosenId.set(untracked(() => this.ui.captureContactId()));
    this.suggestOpen.set(false);
    const fixed = untracked(() => this.fixedContact());
    if (fixed) {
      Object.assign(model, { name: fixed.name, company: fixed.company, email: fixed.email, phone: fixed.phone });
    }
    this.model.set(model);
    this.f().reset();
    this.useMatch.set(true);
    this.tier.set('bronze');
    this.scheduleNext.set(true);
    this.nextAt.set(presetDate('tomorrow', new Date()));
    this.nextChannel.set('call');
    this.nextNote.set('');
    this.saveError.set(null);
    this.confirmDiscard.set(false);
  }
}
