import { DestroyRef, Service, inject, signal } from '@angular/core';

/** Reloj compartido: avanza cada minuto para refrescar fechas relativas. */
@Service()
export class Clock {
  private readonly _now = signal(new Date());
  readonly now = this._now.asReadonly();

  constructor() {
    const id = setInterval(() => this._now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
