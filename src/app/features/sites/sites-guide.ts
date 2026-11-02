import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideCopy } from '@lucide/angular';
import { I18nKey, t } from '../../core/i18n/i18n';
import { ToastService } from '../../core/toast.service';
import { SETTINGS_TABS, SectionTabs } from '../../shared/section-tabs';
import { astroAction, astroConfig, astroForm, curlTest, requestBody } from './intake-snippets';

interface Snippet {
  id: string;
  file: string;
  code: string;
}

/**
 * Guía para conectar un sitio web (Astro) con el CRM: qué hace el admin, qué necesita el sitio,
 * la API de `/api/intake` y el código de ejemplo listo para copiar. Solo admin.
 */
@Component({
  selector: 'app-sites-guide',
  imports: [NgTemplateOutlet, RouterLink, SectionTabs, LucideArrowLeft, LucideCopy],
  templateUrl: './sites-guide.html',
})
export class SitesGuide {
  private readonly toast = inject(ToastService);

  protected readonly t = t;
  protected readonly settingsTabs = SETTINGS_TABS;
  protected readonly endpoint = `${location.origin}/api/intake`;

  /** Campos del JSON: nombre, si es obligatorio y su máximo. */
  protected readonly fields: readonly { name: string; need: I18nKey; max: number | null }[] = [
    { name: 'name', need: 'guide.req', max: 120 },
    { name: 'email', need: 'guide.reqOne', max: 160 },
    { name: 'phone', need: 'guide.reqOne', max: 40 },
    { name: 'company', need: 'guide.opt', max: 120 },
    { name: 'interest', need: 'guide.opt', max: 120 },
    { name: 'message', need: 'guide.opt', max: 2000 },
    { name: 'page', need: 'guide.opt', max: 300 },
    { name: 'utmSource · utmMedium · utmCampaign', need: 'guide.opt', max: 100 },
    { name: 'submissionId', need: 'guide.optId', max: 64 },
  ];

  protected readonly responses: readonly { code: string; label: I18nKey }[] = [
    { code: '201', label: 'guide.r201' },
    { code: '200', label: 'guide.r200' },
    { code: '400', label: 'guide.r400' },
    { code: '401', label: 'guide.r401' },
    { code: '429', label: 'guide.r429' },
  ];

  protected readonly body: Snippet = { id: 'body', file: 'JSON', code: requestBody() };
  protected readonly snippets: readonly Snippet[] = [
    { id: 'config', file: 'astro.config.mjs', code: astroConfig() },
    { id: 'action', file: 'src/actions/index.ts', code: astroAction(this.endpoint) },
    { id: 'form', file: 'src/components/LeadForm.astro', code: astroForm() },
  ];
  protected readonly curl: Snippet = { id: 'curl', file: 'Terminal', code: curlTest(this.endpoint) };

  protected async copy(s: Snippet): Promise<void> {
    try {
      await navigator.clipboard.writeText(s.code);
      this.toast.show(t('guide.copied', { file: s.file }));
    } catch {
      this.toast.error(t('sites.copyFailed'));
    }
  }
}
