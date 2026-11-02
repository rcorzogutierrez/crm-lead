import { Service, inject } from '@angular/core';
import { DocumentData, doc, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { toDate } from './firestore-utils';
import { TenantService } from './tenant.service';
import { teamQuery } from './team-query';

/**
 * Clave de un sitio web que manda formularios al CRM (`intakeKeys/{id}`). El sitio recibe el
 * token `<empresa>.<clave>.<secreto>` y lo usa en `POST /api/intake` (función `intake`); aquí
 * solo queda el hash del secreto. Los contadores los escribe la función.
 */
export interface SiteKey {
  id: string;
  name: string;
  domain: string;
  /** Vendedor que recibe sus negocios; vacío = un admin (que luego reparte). */
  assigneeId: string;
  active: boolean;
  receivedCount: number;
  lastReceivedAt: Date | null;
  createdAt: Date | null;
}

export interface NewSite {
  name: string;
  domain: string;
  assigneeId: string;
}

function mapSite(id: string, d: DocumentData): SiteKey {
  return {
    id,
    name: d['name'] ?? '',
    domain: d['domain'] ?? '',
    assigneeId: d['assigneeId'] ?? '',
    active: d['active'] !== false,
    receivedCount: typeof d['receivedCount'] === 'number' ? d['receivedCount'] : 0,
    lastReceivedAt: toDate(d['lastReceivedAt']),
    createdAt: toDate(d['createdAt']),
  };
}

/** Secreto aleatorio de 40 caracteres en base64url (240 bits). */
export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Dominio sin protocolo ni ruta: "https://www.acme.com/contacto" → "www.acme.com". */
export function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '');
}

/** Sitios web de la empresa activa (solo admin). */
@Service()
export class SitesService {
  private readonly tenant = inject(TenantService);
  private readonly auth = inject(AuthService);

  private readonly live = teamQuery(
    () => query(this.tenant.col('intakeKeys'), orderBy('createdAt', 'asc')),
    mapSite,
    () => this.auth.isAdmin(),
  );

  readonly sites = this.live.data;
  readonly loading = this.live.loading;
  readonly error = this.live.error;

  /**
   * Crea la clave y devuelve el token completo. Es la única vez que existe el secreto:
   * en Firestore solo se guarda su hash.
   */
  async create(input: NewSite): Promise<string> {
    const ref = doc(this.tenant.col('intakeKeys'));
    const secret = randomSecret();
    await setDoc(ref, {
      name: input.name.trim(),
      domain: cleanDomain(input.domain),
      assigneeId: input.assigneeId,
      active: true,
      secretHash: await sha256Hex(secret),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    return `${this.tenant.id()}.${ref.id}.${secret}`;
  }

  setAssignee(id: string, assigneeId: string): Promise<void> {
    return updateDoc(this.tenant.doc('intakeKeys', id), { assigneeId, updatedAt: serverTimestamp() });
  }

  setActive(id: string, active: boolean): Promise<void> {
    return updateDoc(this.tenant.doc('intakeKeys', id), { active, updatedAt: serverTimestamp() });
  }
}
