import { Component, effect, input, signal, untracked } from '@angular/core';

/**
 * Marca grande del login, "el embudo se llena": al entrar, los renglones del embudo aparecen de
 * arriba abajo y el lead cae blanco por dentro y sale amarillo (convertido). Con cada palabra del
 * titular (`beat`) el embudo se enciende de arriba abajo y el lead destella, al ritmo del fondo.
 * Mismo dibujo que `shared/logo.ts`; con movimiento reducido queda el dibujo final, quieto.
 */
@Component({
  selector: 'app-login-brand',
  template: `
    <div class="login-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" [class.is-beat]="beats() > 0" [class.is-odd]="beats() % 2 === 1">
        <defs>
          <linearGradient id="login-brand-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2a2575" />
            <stop offset="1" stop-color="#5b4ff0" />
          </linearGradient>
        </defs>
        <rect class="lb-tile" width="64" height="64" rx="18" fill="url(#login-brand-grad)" />
        <rect class="lb-bar" x="14" y="17" width="36" height="7" rx="3.5" fill="#fff" opacity=".4" />
        <rect class="lb-bar" x="19" y="28.5" width="26" height="7" rx="3.5" fill="#fff" opacity=".7" />
        <rect class="lb-bar" x="24" y="40" width="16" height="7" rx="3.5" fill="#fff" />
        <circle class="lb-ring" cx="47" cy="43.5" r="4" fill="none" stroke="#ffd25e" stroke-width="1.5" />
        <circle class="lb-lead" cx="47" cy="43.5" r="4" fill="#ffd25e" />
      </svg>
    </div>
    <p class="date-face login-brand-name">CRM Lead</p>
  `,
  host: { class: 'login-brand' },
})
export class LoginBrand {
  /** Índice de la palabra del titular: cada cambio es un latido. */
  readonly beat = input(0);

  /** Latidos desde que se abrió (la entrada ya es la animación del primero); la paridad reinicia la animación. */
  protected readonly beats = signal(0);

  constructor() {
    let first = true;
    effect(() => {
      this.beat();
      untracked(() => {
        if (first) first = false;
        else this.beats.update((n) => n + 1);
      });
    });
  }
}
