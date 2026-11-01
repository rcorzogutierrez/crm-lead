import { Service, inject, signal } from '@angular/core';
import { CollectionReference, DocumentReference, collection, doc } from 'firebase/firestore';
import { FIRESTORE } from './firebase';

/** Clave de `localStorage` con la última empresa elegida en este navegador. */
export const TENANT_KEY = 'crm-lead.tenant';

/**
 * Empresa activa (tenant). Todos los datos del CRM viven en `tenants/{id}/…`: contactos, negocios,
 * follow-ups, catálogo, facturas, Ajustes, equipo y registro de borrados. Los servicios construyen
 * sus rutas con `col()` y `doc()`, así una consulta nunca puede tocar otra empresa.
 *
 * La fija `AuthService` al dar de alta la sesión. Leer la ruta dentro de un `effect` o de
 * `teamQuery` hace que la consulta se rehaga si cambia la empresa.
 */
@Service()
export class TenantService {
  private readonly db = inject(FIRESTORE);
  private readonly _id = signal<string | null>(null);
  private readonly _name = signal('');

  readonly id = this._id.asReadonly();
  readonly name = this._name.asReadonly();

  set(id: string | null, name = ''): void {
    this._id.set(id);
    this._name.set(name);
  }

  setName(name: string): void {
    this._name.set(name);
  }

  /** Ruta de la empresa activa; falla si no hay ninguna (nunca se escribe fuera de una empresa). */
  private base(): string {
    const id = this._id();
    if (!id) throw new Error('No hay empresa activa');
    return `tenants/${id}`;
  }

  /** Colección dentro de la empresa activa: `col('leads')`, `col('leads', id, 'activities')`. */
  col(path: string, ...segments: string[]): CollectionReference {
    return collection(this.db, this.base(), path, ...segments);
  }

  /** Documento dentro de la empresa activa: `doc('leads', id)`, `doc('meta', 'company')`. */
  doc(path: string, ...segments: string[]): DocumentReference {
    return doc(this.db, this.base(), path, ...segments);
  }
}
