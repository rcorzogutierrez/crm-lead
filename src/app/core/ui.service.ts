import { Service, signal } from '@angular/core';

/** Estado de interfaz compartido entre el shell y las vistas. */
@Service()
export class UiService {
  /** Panel de captura rápida de lead. */
  readonly captureOpen = signal(false);

  openCapture(): void {
    this.captureOpen.set(true);
  }
}
