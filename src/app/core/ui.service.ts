import { Service, signal } from '@angular/core';

export type DealsView = '/leads' | '/pipeline';

const DEALS_VIEW_KEY = 'crm-lead.dealsView';

function storedDealsView(): DealsView {
  try {
    return localStorage.getItem(DEALS_VIEW_KEY) === '/pipeline' ? '/pipeline' : '/leads';
  } catch {
    return '/leads';
  }
}

/** Estado de interfaz compartido entre el shell y las vistas. */
@Service()
export class UiService {
  /** Panel de captura rápida de un negocio. */
  readonly captureOpen = signal(false);
  /** Contacto al que se le abre un negocio nuevo desde su ficha (null = captura normal). */
  readonly captureContactId = signal<string | null>(null);
  /** Última vista de Negocios (lista o tablero): el menú vuelve a la que se usó. */
  readonly dealsView = signal<DealsView>(storedDealsView());

  openCapture(contactId: string | null = null): void {
    this.captureContactId.set(contactId);
    this.captureOpen.set(true);
  }

  rememberDealsView(view: DealsView): void {
    this.dealsView.set(view);
    try {
      localStorage.setItem(DEALS_VIEW_KEY, view);
    } catch {
      // Sin almacenamiento (navegación privada): solo dura esta sesión.
    }
  }
}
