import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { I18nKey, lang, t } from './i18n';

/** Título de la pestaña: "<pantalla traducida> · CRM Lead", y se actualiza al cambiar de idioma. */
@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private key: string | undefined;

  constructor() {
    super();
    effect(() => {
      lang();
      this.apply();
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    this.title.setTitle(this.key ? `${t(this.key as I18nKey)} · CRM Lead` : 'CRM Lead');
  }
}
