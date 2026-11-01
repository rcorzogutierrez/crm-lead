import { Component, Injector, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideBuilding2, LucideLogOut } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { PlatformService, Tenant } from '../../core/platform.service';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Panel de la plataforma (solo super-admin): empresas, su admin, crear una nueva y
 * suspender o reactivar. Va fuera del riel porque no pertenece a ninguna empresa.
 */
@Component({
  selector: 'app-platform-page',
  imports: [FormField, RouterLink, EmptyState, LangSwitch, Logo, LucideArrowLeft, LucideBuilding2, LucideLogOut],
  templateUrl: './platform-page.html',
  host: { class: 'block min-h-dvh' },
})
export class PlatformPage {
  protected readonly auth = inject(AuthService);
  protected readonly platform = inject(PlatformService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly t = t;

  protected readonly activeCount = computed(() => this.platform.tenants().filter((c) => c.active).length);

  protected readonly createModel = signal({ name: '', email: '' });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name, { message: 'platform.nameRequired' });
    required(p.email, { message: 'team.emailRequired' });
    email(p.email, { message: 'form.emailInvalid' });
  });

  /** Empresa a la que se está por suspender (confirmación en línea). */
  protected readonly confirmId = signal<string | null>(null);
  /** Empresa a la que se está invitando a otro admin. */
  protected readonly inviting = signal<{ id: string; email: string; error: I18nKey | null } | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.status() === 'signedOut') void this.router.navigateByUrl('/login');
    });
  }

  protected dateLabel(d: Date): string {
    return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private focusLater(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.createForm, async () => {
      const { name, email: mail } = this.createModel();
      try {
        await this.platform.create(name, mail);
        this.toast.show(t('platform.created', { name: name.trim(), email: mail.trim().toLowerCase() }));
        this.createModel.set({ name: '', email: '' });
        this.createForm().reset();
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
      return undefined;
    });
  }

  protected askSuspend(c: Tenant): void {
    this.inviting.set(null);
    this.confirmId.set(c.id);
    this.focusLater(() => document.getElementById('suspend-q-' + c.id)?.focus());
  }

  protected cancelSuspend(c: Tenant): void {
    this.confirmId.set(null);
    this.focusLater(() => document.getElementById('suspend-' + c.id)?.focus());
  }

  protected async setActive(c: Tenant, active: boolean): Promise<void> {
    this.busy.set(true);
    try {
      await this.platform.setActive(c.id, active);
      this.confirmId.set(null);
      this.toast.show(t(active ? 'platform.reactivated' : 'platform.suspended', { name: c.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected askInvite(c: Tenant): void {
    this.confirmId.set(null);
    this.inviting.set({ id: c.id, email: '', error: null });
    this.focusLater(() => document.getElementById('invite-email-' + c.id)?.focus());
  }

  protected cancelInvite(c: Tenant): void {
    this.inviting.set(null);
    this.focusLater(() => document.getElementById('invite-' + c.id)?.focus());
  }

  protected setInviteEmail(value: string): void {
    this.inviting.update((i) => (i ? { ...i, email: value, error: null } : i));
  }

  protected async sendInvite(event: Event, c: Tenant): Promise<void> {
    event.preventDefault();
    const inv = this.inviting();
    if (inv?.id !== c.id) return;
    const mail = inv.email.trim().toLowerCase();
    if (!mail) return this.inviting.set({ ...inv, error: 'team.emailRequired' });
    if (!EMAIL_RE.test(mail)) return this.inviting.set({ ...inv, error: 'form.emailInvalid' });
    // Ya invitado o ya admin: las reglas no dejan rehacer una invitación, y no hace falta.
    const who = this.platform.admins()[c.id];
    if (who?.invites.includes(mail)) return this.inviting.set({ ...inv, error: 'platform.alreadyInvited' });
    if (who?.admins.some((a) => a.email.toLowerCase() === mail)) {
      return this.inviting.set({ ...inv, error: 'platform.alreadyAdmin' });
    }
    this.busy.set(true);
    try {
      await this.platform.inviteAdmin(c.id, mail);
      this.toast.show(t('platform.invited', { email: mail, name: c.name }));
      this.cancelInvite(c);
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected signOut(): void {
    void this.auth.signOut(this.auth.status() === 'member' ? 'manual' : null);
  }
}
