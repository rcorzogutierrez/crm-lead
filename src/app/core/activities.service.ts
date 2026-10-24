import { DestroyRef, Service, inject } from '@angular/core';
import {
  DocumentData,
  addDoc,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';
import { LiveQuery, liveQuery, toDate } from './firestore-utils';
import { Activity, ActivityType } from './models';

function mapActivity(id: string, d: DocumentData): Activity {
  return {
    id,
    type: d['type'] ?? 'note',
    body: d['body'] ?? '',
    createdBy: d['createdBy'] ?? '',
    createdAt: toDate(d['createdAt']),
    from: d['from'],
    to: d['to'],
  };
}

const CONTACT_TYPES: ActivityType[] = ['call', 'whatsapp', 'email', 'meeting'];

/** Historial de interacciones de un lead. */
@Service()
export class ActivitiesService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  /** Escucha el historial de un lead; se cancela con el DestroyRef dado. */
  watch(leadId: string, destroyRef: DestroyRef, max = 200): LiveQuery<Activity> {
    return liveQuery(
      query(collection(this.db, 'leads', leadId, 'activities'), orderBy('createdAt', 'desc'), limit(max)),
      mapActivity,
      destroyRef,
    );
  }

  /** Registra una interacción. Si es un contacto, actualiza la fecha de último contacto. */
  async log(leadId: string, type: ActivityType, body: string): Promise<void> {
    await addDoc(collection(this.db, 'leads', leadId, 'activities'), {
      type,
      body: body.trim(),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (CONTACT_TYPES.includes(type)) patch['lastContactAt'] = serverTimestamp();
    await updateDoc(doc(this.db, 'leads', leadId), patch);
  }
}
