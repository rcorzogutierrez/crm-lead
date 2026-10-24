import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucidePlus, LucideSearch } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { ContactSummary, ContactsService, phoneDigits } from '../../core/contacts.service';
import { moneyLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { MembersService } from '../../core/members.service';
import { Contact } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UiService } from '../../core/ui.service';
import { Avatar } from '../../shared/avatar';
import { DueChip } from '../../shared/due-chip';
import { EmptyState } from '../../shared/empty-state';

type Kind = 'all' | 'customers' | 'prospects' | 'idle' | 'archived';

const KINDS: { id: Kind; label: I18nKey }[] = [
  { id: 'all', label: 'contacts.all' },
  { id: 'customers', label: 'contacts.customers' },
  { id: 'prospects', label: 'contacts.prospects' },
  { id: 'idle', label: 'contacts.idle' },
  { id: 'archived', label: 'contacts.archived' },
];

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Clientes y prospectos, con lo que han comprado y lo que tienen abierto. */
@Component({
  selector: 'app-contacts-list',
  imports: [RouterLink, Avatar, DueChip, EmptyState, LucidePlus, LucideSearch],
  templateUrl: './contacts-list.html',
})
export class ContactsList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly contacts = inject(ContactsService);
  protected readonly members = inject(MembersService);
  protected readonly ui = inject(UiService);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  /** "Archivados" solo aparece si hay alguno (o si ya está elegido en la URL). */
  protected readonly kinds = computed(() =>
    KINDS.filter((k) => k.id !== 'archived' || this.kind() === 'archived' || this.contacts.contacts().some((c) => c.archived)),
  );
  protected readonly money = moneyLabel;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly search = computed(() => this.params().get('search') ?? '');
  protected readonly kind = computed<Kind>(() => (this.params().get('type') as Kind) || 'all');
  protected readonly migrating = signal(false);

  protected readonly rows = computed(() => {
    const q = normalize(this.search().trim());
    const digits = phoneDigits(this.search());
    const kind = this.kind();
    return this.contacts
      .contacts()
      .map((c) => ({ c, s: this.contacts.summary(c.id) }))
      .filter(({ c, s }) => {
        // Los archivados se ocultan salvo en su propio filtro.
        if (c.archived !== (kind === 'archived')) return false;
        const customer = s.wonCount > 0;
        if (kind === 'customers' && !customer) return false;
        if (kind === 'prospects' && customer) return false;
        if (kind === 'idle' && (!customer || s.openCount > 0)) return false;
        // El teléfono se compara por dígitos: "55 1234" encuentra "+52 (55) 1234-5678".
        const phoneHit = digits.length >= 3 && phoneDigits(c.phone).includes(digits);
        if (q && !phoneHit && !normalize(`${c.name} ${c.company} ${c.email} ${c.phone}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.c.name.localeCompare(b.c.name, intlLocale()));
  });

  protected setParam(key: string, value: string | null): void {
    void this.router.navigate([], { queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected open(c: Contact): void {
    void this.router.navigate(['/contacts', c.id]);
  }

  protected since(s: ContactSummary): string {
    return s.customerSince
      ? new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric' }).format(s.customerSince).replace('.', '')
      : '';
  }

  protected async migrate(): Promise<void> {
    this.migrating.set(true);
    try {
      const n = await this.contacts.migrateLegacy();
      this.toast.show(t('contacts.migrated', { n }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.migrating.set(false);
    }
  }
}
