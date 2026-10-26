import { Service, effect, inject, signal } from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';

/**
 * Datos de la empresa que emite las facturas (doc `meta/company`). Todo el equipo los lee
 * (el vendedor también factura); solo un admin los cambia. Pensado para EE. UU.: el impuesto
 * (sales tax) va aparte y su % es el valor por defecto de cada factura.
 */
export interface Company {
  legalName: string;
  tradeName: string;
  /** EIN u otro número fiscal. */
  taxId: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  /** Logo reducido en el navegador y guardado como data URL (cabe en el documento). */
  logo: string;
  /** Mes en que empieza el año fiscal (1 = enero). */
  fiscalYearStart: number;
  /** % de impuesto por defecto en cada factura (sales tax). */
  taxRate: number;
  /** Prefijo del número de factura ("INV-"). */
  invoicePrefix: string;
}

export type CompanyDraft = Company;

export const EMPTY_COMPANY: Company = {
  legalName: '',
  tradeName: '',
  taxId: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  website: '',
  logo: '',
  fiscalYearStart: 1,
  taxRate: 0,
  invoicePrefix: 'INV-',
};

/** Tamaño máximo del logo guardado (las reglas lo vuelven a comprobar). */
export const LOGO_MAX_CHARS = 200_000;

function mapCompany(d: Record<string, unknown>): Company {
  const str = (k: keyof Company) => (typeof d[k] === 'string' ? (d[k] as string) : (EMPTY_COMPANY[k] as string));
  const num = (k: keyof Company) => (typeof d[k] === 'number' && Number.isFinite(d[k]) ? (d[k] as number) : (EMPTY_COMPANY[k] as number));
  return {
    legalName: str('legalName'),
    tradeName: str('tradeName'),
    taxId: str('taxId'),
    address1: str('address1'),
    address2: str('address2'),
    city: str('city'),
    state: str('state'),
    zip: str('zip'),
    phone: str('phone'),
    email: str('email'),
    website: str('website'),
    logo: str('logo'),
    fiscalYearStart: num('fiscalYearStart'),
    taxRate: num('taxRate'),
    invoicePrefix: str('invoicePrefix'),
  };
}

/** Nombre que se muestra: el comercial si lo hay, si no la razón social. */
export function companyName(c: Pick<Company, 'legalName' | 'tradeName'>): string {
  return c.tradeName || c.legalName;
}

/** Dirección en líneas ("Suite 4", "Miami, FL 33101"). */
export function companyAddress(c: Pick<Company, 'address1' | 'address2' | 'city' | 'state' | 'zip'>): string[] {
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [c.address1, c.address2, cityLine].filter(Boolean);
}

@Service()
export class CompanyService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _company = signal<Company>(EMPTY_COMPANY);
  private readonly _loaded = signal(false);
  readonly company = this._company.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  /** ¿Están los datos mínimos para facturar? */
  readonly ready = () => !!companyName(this._company());

  constructor() {
    effect((onCleanup) => {
      if (this.auth.status() !== 'member') return;
      const stop = onSnapshot(
        doc(this.db, 'meta', 'company'),
        (snap) => {
          this._company.set(mapCompany(snap.data() ?? {}));
          this._loaded.set(true);
        },
        (err) => console.error(err),
      );
      onCleanup(stop);
    });
  }

  save(draft: CompanyDraft): Promise<void> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) out[k] = typeof v === 'string' && k !== 'logo' ? v.trim() : v;
    return setDoc(doc(this.db, 'meta', 'company'), { ...out, updatedAt: serverTimestamp(), updatedBy: this.auth.uid() });
  }
}

/**
 * Reduce una imagen a un logo pequeño (máx. 480 × 160 px) y la devuelve como data URL.
 * Acepta PNG, JPG, WebP y SVG; se prueba WebP (conserva la transparencia) y, si el navegador
 * no lo genera, PNG.
 */
export async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 480;
    const h = img.naturalHeight || 160;
    const scale = Math.min(1, 480 / w, 160 / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
