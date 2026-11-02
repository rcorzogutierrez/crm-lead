import { Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { LucideCopy, LucideGlobe, LucideKeyRound } from '@lucide/angular';
import { Clock } from '../../core/clock.service';
import { agoLabel, fullLabel } from '../../core/dates';
import { firestoreErrorMessage } from '../../core/firestore-utils';
import { t } from '../../core/i18n/i18n';
import { MembersService } from '../../core/members.service';
import { NewSite, SiteKey, SitesService } from '../../core/sites.service';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { SETTINGS_TABS, SectionTabs } from '../../shared/section-tabs';

/** Token recién creado: se muestra una sola vez. */
interface Revealed {
  site: string;
  token: string;
}

/**
 * Sitios web (solo admin): una clave por sitio que manda formularios al CRM. Cada envío entra
 * como negocio nuevo de la empresa, con "Llamar" para ahora. El token se ve solo al crearlo.
 */
@Component({
  selector: 'app-sites-page',
  imports: [FormField, EmptyState, SectionTabs, LucideCopy, LucideGlobe, LucideKeyRound],
  templateUrl: './sites-page.html',
})
export class SitesPage {
  protected readonly sites = inject(SitesService);
  protected readonly members = inject(MembersService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(Clock);
  private readonly injector = inject(Injector);

  protected readonly t = t;
  protected readonly settingsTabs = SETTINGS_TABS;
  protected readonly full = fullLabel;
  protected readonly endpoint = `${location.origin}/api/intake`;

  protected readonly model = signal<NewSite>({ name: '', domain: '', assigneeId: '' });
  protected readonly siteForm = form(this.model, (p) => {
    required(p.name, { message: 'sites.nameRequired' });
    maxLength(p.name, 80, { message: 'sites.nameLong' });
    maxLength(p.domain, 200, { message: 'sites.domainLong' });
  });

  protected readonly revealed = signal<Revealed | null>(null);
  /** Sitio que el admin está por desactivar (confirmación en línea). */
  protected readonly confirmId = signal<string | null>(null);

  protected readonly summary = computed(() => {
    const all = this.sites.sites();
    const active = all.filter((s) => s.active).length;
    return all.length ? t('sites.count', { active, total: all.length }) : t('sites.intro');
  });

  protected assigneeName(s: SiteKey): string {
    return s.assigneeId ? this.members.name(s.assigneeId) : t('sites.anyAdmin');
  }
  /** El responsable guardado ya no tiene acceso: sus negocios van a un admin. */
  protected assigneeGone(s: SiteKey): boolean {
    return !!s.assigneeId && !this.members.active().some((m) => m.uid === s.assigneeId);
  }
  protected last(s: SiteKey): string {
    return s.lastReceivedAt ? agoLabel(s.lastReceivedAt, this.clock.now()) : '';
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.siteForm, async () => {
      const input = this.model();
      try {
        const token = await this.sites.create(input);
        this.revealed.set({ site: input.name.trim(), token });
        this.model.set({ name: '', domain: '', assigneeId: '' });
        this.siteForm().reset();
        this.focusLater('site-token');
      } catch (err) {
        this.toast.error(firestoreErrorMessage(err));
      }
    });
  }

  protected async copy(): Promise<void> {
    const r = this.revealed();
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.token);
      this.toast.show(t('sites.copied'));
    } catch {
      this.toast.error(t('sites.copyFailed'));
    }
  }

  protected done(): void {
    this.revealed.set(null);
    // Al título, no al campo: enfocar el nombre vacío y salir lo marcaría como error.
    this.focusLater('site-new-title');
  }

  protected async pickAssignee(s: SiteKey, uid: string): Promise<void> {
    try {
      await this.sites.setAssignee(s.id, uid);
      this.toast.show(t('sites.assigneeChanged', { site: s.name, name: uid ? this.members.name(uid) : t('sites.anyAdmin') }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  protected askDisable(s: SiteKey): void {
    this.confirmId.set(s.id);
    this.focusLater('site-off-ok-' + s.id);
  }
  protected cancelDisable(s: SiteKey): void {
    this.confirmId.set(null);
    this.focusLater('site-off-' + s.id);
  }
  protected async setActive(s: SiteKey, active: boolean): Promise<void> {
    try {
      await this.sites.setActive(s.id, active);
      this.confirmId.set(null);
      this.toast.show(t(active ? 'sites.enabled' : 'sites.disabled', { site: s.name }));
    } catch (err) {
      this.toast.error(firestoreErrorMessage(err));
    }
  }

  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
