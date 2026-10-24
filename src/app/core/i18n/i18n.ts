import { signal } from '@angular/core';
import { en } from './en';
import { es, I18nKey } from './es';

export type Lang = 'es' | 'en';
export type { I18nKey };

const STORAGE_KEY = 'crm-lead.lang';
const DICTS: Record<Lang, Record<I18nKey, string>> = { es, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // Sin acceso a localStorage: idioma base.
  }
  // El producto es en español; el inglés se elige con el selector y se recuerda.
  return 'es';
}

const _lang = signal<Lang>(initialLang());

/** Idioma actual de la interfaz. Es una signal: plantillas y computed se actualizan solas al cambiarlo. */
export const lang = _lang.asReadonly();

export function setLang(value: Lang): void {
  _lang.set(value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Preferencia solo para esta sesión.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}

/**
 * Traduce una clave. Los `{nombre}` del texto se sustituyen con `params`.
 * Lee la signal de idioma, así que en una plantilla se re-evalúa al cambiar de idioma.
 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  let text = DICTS[_lang()][key] ?? es[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Locale para Intl (fechas y números). */
export function intlLocale(): string {
  return _lang() === 'en' ? 'en-US' : 'es';
}

if (typeof document !== 'undefined') document.documentElement.lang = _lang();
