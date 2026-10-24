import { Component, input } from '@angular/core';

let siguienteId = 0;

/** Marca de CRM Lead: embudo de ventas con el lead que se convierte (mismo dibujo que favicon.svg). */
@Component({
  selector: 'app-logo',
  template: `
    <svg viewBox="0 0 64 64" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2a2575" />
          <stop offset="1" stop-color="#5b4ff0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" [attr.fill]="'url(#' + gradId + ')'" />
      <rect x="14" y="17" width="36" height="7" rx="3.5" fill="#fff" opacity=".4" />
      <rect x="19" y="28.5" width="26" height="7" rx="3.5" fill="#fff" opacity=".7" />
      <rect x="24" y="40" width="16" height="7" rx="3.5" fill="#fff" />
      <circle cx="47" cy="43.5" r="4" fill="#ffd25e" />
    </svg>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Logo {
  readonly size = input(32);
  /** Id único: el riel y la barra móvil conviven en el DOM y uno de ellos está oculto. */
  protected readonly gradId = `crm-lead-logo-${++siguienteId}`;
}
