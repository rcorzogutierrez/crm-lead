import { Component, computed, inject, signal } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import {
  LucideBriefcase,
  LucideCopy,
  LucidePackage,
  LucideReceipt,
  LucideStickyNote,
  LucideUserRound,
  LucideUserX,
} from '@lucide/angular';
import { Clock } from '../../core/clock.service';
import { fullLabel, stampLabel } from '../../core/dates';
import { Deletion, DeletionKind, DeletionsService } from '../../core/deletions.service';
import { I18nKey, intlLocale, t } from '../../core/i18n/i18n';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { SETTINGS_TABS, SectionTabs } from '../../shared/section-tabs';

const KIND_LABEL: Record<DeletionKind, I18nKey> = {
  contact: 'deletion.kind.contact',
  lead: 'deletion.kind.lead',
  activity: 'deletion.kind.activity',
  service: 'deletion.kind.service',
  member: 'deletion.kind.member',
  invoice: 'deletion.kind.invoice',
};

/** Fechas de Firestore como texto legible dentro de la copia de los datos. */
function readable(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(readable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, readable(x)]));
  return v;
}

/**
 * Registro de borrados (solo admin): qué se borró, quién y cuándo, con la copia de los datos
 * para depurar o reconstruir. Nadie lo edita ni lo borra.
 */
@Component({
  selector: 'app-deletions-page',
  imports: [
    EmptyState,
    SectionTabs,
    LucideBriefcase,
    LucideCopy,
    LucidePackage,
    LucideReceipt,
    LucideStickyNote,
    LucideUserRound,
    LucideUserX,
  ],
  templateUrl: './deletions-page.html',
})
export class DeletionsPage {
  protected readonly log = inject(DeletionsService);
  private readonly clock = inject(Clock);
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly settingsTabs = SETTINGS_TABS;
  protected readonly full = fullLabel;
  protected readonly kinds = Object.keys(KIND_LABEL) as DeletionKind[];

  protected readonly kind = signal<DeletionKind | 'all'>('all');
  protected readonly entries = computed(() => {
    const k = this.kind();
    return this.log.entries().filter((e) => k === 'all' || e.kind === k);
  });

  protected kindLabel(k: DeletionKind): string {
    return t(KIND_LABEL[k]);
  }
  protected day(e: Deletion): string {
    return e.at ? new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(e.at).replace('.', '') : t('ago.now');
  }
  protected hour(e: Deletion): string {
    return e.at ? new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(e.at) : '';
  }
  protected stamp(e: Deletion): string {
    return e.at ? stampLabel(e.at, this.clock.now()) : '';
  }
  protected data(e: Deletion): string {
    return JSON.stringify(readable(e.snapshot), null, 2);
  }

  protected async copy(e: Deletion): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.data(e));
      this.toast.show(t('deletion.copied'));
    } catch {
      this.toast.error(t('deletion.copyFailed'));
    }
  }
}
