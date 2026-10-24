import { Service, signal } from '@angular/core';

/** Estado de interfaz compartido entre el shell y las vistas. */
@Service()
export class UiService {
  /** Panel de captura rápida de lead. */
  readonly captureOpen = signal(false);
  /** Contacto al que se le abre un negocio nuevo desde su ficha (null = captura normal). */
  readonly captureContactId = signal<string | null>(null);

  openCapture(contactId: string | null = null): void {
    this.captureContactId.set(contactId);
    this.captureOpen.set(true);
  }
}
