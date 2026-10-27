import { Component, booleanAttribute, input } from '@angular/core';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';
import { LoginAgenda } from './login-agenda';

/**
 * Tablero de las pantallas de acceso ("Pizarra"): fondo de agenda que corre, brillo índigo que sigue
 * al cursor, marca y selector de idioma. El contenido (titular, hoja) se proyecta centrado.
 */
@Component({
  selector: 'app-auth-board',
  imports: [Logo, LangSwitch, LoginAgenda],
  template: `
    <div
      class="login-board relative isolate flex min-h-dvh flex-col overflow-hidden text-rail-ink"
      (pointermove)="follow($event)"
    >
      <span class="login-glow" aria-hidden="true"></span>
      <app-login-agenda [beat]="beat()" />

      <header
        class="login-in flex items-center justify-between gap-3 px-5 py-5 sm:px-8"
        style="--d: 0ms"
      >
        @if (brand()) {
          <span aria-hidden="true"></span>
        } @else {
          <div class="flex items-center gap-2.5">
            <app-logo [size]="36" />
            <span class="date-face text-lg font-bold tracking-tight">CRM Lead</span>
          </div>
        }
        <app-lang-switch tone="rail" />
      </header>

      <main class="flex flex-1 items-center justify-center px-4 pt-2 pb-12 text-center sm:pb-16">
        <div class="w-full max-w-3xl">
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthBoard {
  /** Cada cambio trae una cita nueva al fondo (en el login, la palabra del titular). */
  readonly beat = input(0);
  /** La marca va en grande sobre el titular: la cabecera solo lleva el idioma. */
  readonly brand = input(false, { transform: booleanAttribute });

  /** El brillo índigo sigue al puntero con retardo suave (la transición está en CSS). */
  protected follow(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    // Las variables van en el propio brillo, no en el tablero: así no se recalculan los estilos de toda la página.
    const glow = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.login-glow');
    glow?.style.setProperty('--gx', `${event.clientX}px`);
    glow?.style.setProperty('--gy', `${event.clientY}px`);
  }
}
