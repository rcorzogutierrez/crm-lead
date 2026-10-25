import { Service, inject } from '@angular/core';
import { DocumentData, collection, doc, limit, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
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

  /** Escucha el historial de un lead; quien la abre la cierra con `stop()` (p. ej. en la limpieza de un effect). */
  watch(leadId: string, max = 200): LiveQuery<Activity> {
    return liveQuery(
      query(collection(this.db, 'leads', leadId, 'activities'), orderBy('createdAt', 'desc'), limit(max)),
      mapActivity,
    );
  }

  /** Registra una interacción. Si es un contacto, actualiza la fecha de último contacto (en el mismo batch). */
  async log(leadId: string, type: ActivityType, body: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(doc(collection(this.db, 'leads', leadId, 'activities')), {
      type,
      body: body.trim(),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (CONTACT_TYPES.includes(type)) patch['lastContactAt'] = serverTimestamp();
    batch.update(doc(this.db, 'leads', leadId), patch);
    await batch.commit();
  }
}
