import { Service, effect, inject, signal, untracked } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { LiveQuery, liveQuery, toDate } from './firestore-utils';

/** Empresa (tenant) vista desde la plataforma: solo sus metadatos, nunca sus datos. */
export interface Tenant {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date | null;
}

/** Quién administra una empresa: sus admins y las invitaciones de admin aún sin usar. */
export interface TenantAdmins {
  admins: { name: string; email: string; active: boolean }[];
  invites: string[];
  members: number;
}

/**
 * Panel del super-admin de la plataforma: crea empresas, invita a su primer admin y las
 * suspende o reactiva. Las reglas le dejan leer la empresa y su equipo, no sus contactos,
 * negocios ni facturas.
 */
@Service()
export class PlatformService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly current = signal<LiveQuery<Tenant> | null>(null);
  private readonly _admins = signal<Record<string, TenantAdmins>>({});

  readonly tenants = () => this.current()?.data() ?? [];
  readonly loading = () => this.current()?.loading() ?? true;
  readonly error = () => this.current()?.error() ?? null;
  readonly admins = this._admins.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (!this.auth.platformAdmin()) {
        this.current.set(null);
        return;
      }
      const q = untracked(() =>
        liveQuery(query(collection(this.db, 'tenants'), orderBy('name')), (id, d) => ({
          id,
          name: d['name'] ?? '',
          active: d['active'] === true,
          createdAt: toDate(d['createdAt']),
        })),
      );
      this.current.set(q);
      onCleanup(() => q.stop());
    });
    // Equipo de cada empresa (una lectura por empresa; son pocas).
    effect(() => {
      for (const t of this.tenants()) {
        if (!untracked(this._admins)[t.id]) void this.loadAdmins(t.id);
      }
    });
  }

  async loadAdmins(tenantId: string): Promise<void> {
    const [members, invites] = await Promise.all([
      getDocs(collection(this.db, 'tenants', tenantId, 'members')),
      getDocs(collection(this.db, 'tenants', tenantId, 'invites')),
    ]).catch(() => [null, null]);
    if (!members || !invites) return;
    const entry: TenantAdmins = {
      admins: members.docs
        .map((d) => d.data())
        .filter((m) => m['role'] === 'admin')
        .map((m) => ({ name: m['displayName'] ?? '', email: m['email'] ?? '', active: m['active'] === true })),
      invites: invites.docs.map((d) => d.data()).filter((i) => i['role'] === 'admin').map((i) => i['email'] ?? ''),
      members: members.docs.filter((d) => d.data()['active'] === true).length,
    };
    this._admins.update((all) => ({ ...all, [tenantId]: entry }));
  }

  /** Crea la empresa e invita a su primer admin en el mismo lote. */
  async create(name: string, adminEmail: string): Promise<string> {
    const ref = doc(collection(this.db, 'tenants'));
    const email = adminEmail.trim().toLowerCase();
    const batch = writeBatch(this.db);
    batch.set(ref, { name: name.trim(), active: true, createdBy: this.auth.uid(), createdAt: serverTimestamp() });
    batch.set(doc(this.db, 'tenants', ref.id, 'invites', email), {
      email,
      role: 'admin',
      invitedBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    this._admins.update((all) => ({ ...all, [ref.id]: { admins: [], invites: [email], members: 0 } }));
    return ref.id;
  }

  /** Invita a otro admin a una empresa (por ejemplo, si el primero no llegó a entrar). */
  async inviteAdmin(tenantId: string, adminEmail: string): Promise<void> {
    const email = adminEmail.trim().toLowerCase();
    await setDoc(doc(this.db, 'tenants', tenantId, 'invites', email), {
      email,
      role: 'admin',
      invitedBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await this.loadAdmins(tenantId);
  }

  /** Suspende (nadie de la empresa entra) o reactiva una empresa. Sus datos no se tocan. */
  setActive(tenantId: string, active: boolean): Promise<void> {
    return updateDoc(doc(this.db, 'tenants', tenantId), { active, updatedAt: serverTimestamp() });
  }
}
