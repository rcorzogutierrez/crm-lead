import { DocumentReference, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { IntakePayload, pickAssignee, rateWindow, repeatNote, secretMatches } from './intake-core.js';

/** Versión del resumen del contacto (igual que `STATS_VERSION` en `src/app/core/contact-stats.ts`). */
const STATS_VERSION = 1;
/** Etapas cerradas: un negocio así no cuenta como abierto. */
const CLOSED = new Set(['won', 'lost']);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export interface Outcome {
  id: string;
  leadId: string;
  duplicate: boolean;
}

/**
 * Procesa un formulario ya validado en una sola transacción: comprueba la clave y el límite,
 * guarda la entrada y crea (o actualiza) contacto, negocio, actividad y próxima acción.
 */
export async function processIntake(
  db: Firestore,
  tenantId: string,
  keyId: string,
  secret: string,
  p: IntakePayload,
): Promise<Outcome> {
  const base = db.collection('tenants').doc(tenantId);
  const keyRef = base.collection('intakeKeys').doc(keyId);
  // El id lleva la clave delante: un sitio no puede tocar el envío de otro.
  const intakeRef = base.collection('intake').doc(`${keyId}_${p.submissionId || randomUUID()}`);

  return db.runTransaction(async (tx) => {
    // --- Lecturas (todas antes de escribir) ---
    const [tenantSnap, keySnap, intakeSnap] = await Promise.all([tx.get(base), tx.get(keyRef), tx.get(intakeRef)]);
    const key = keySnap.data();
    // Mismo error para empresa o clave inexistente, desactivada o secreto incorrecto: no damos pistas.
    if (!tenantSnap.exists || tenantSnap.get('active') !== true || !key || key['active'] !== true) {
      throw new HttpError(401, 'token');
    }
    if (!secretMatches(secret, key['secretHash'])) throw new HttpError(401, 'token');

    // Reintento del mismo envío: devolvemos lo que ya se creó.
    if (intakeSnap.exists) {
      return { id: intakeRef.id, leadId: intakeSnap.get('leadId') ?? '', duplicate: true };
    }

    const now = Date.now();
    const start = key['windowStart'] instanceof Timestamp ? key['windowStart'].toMillis() : null;
    const rate = rateWindow(now, start, typeof key['windowCount'] === 'number' ? key['windowCount'] : 0);
    if (!rate.allowed) throw new HttpError(429, 'rate-limit');

    // Contacto existente: por email y, si no, por teléfono (tal como se escribió).
    const contacts = base.collection('contacts');
    let contactSnap = p.email ? (await tx.get(contacts.where('email', '==', p.email).limit(1))).docs[0] : undefined;
    if (!contactSnap && p.phone) contactSnap = (await tx.get(contacts.where('phone', '==', p.phone).limit(1))).docs[0];

    const members = base.collection('members');
    const candidates = [contactSnap?.get('assigneeId'), key['assigneeId']].filter(
      (uid): uid is string => typeof uid === 'string' && uid.length > 0,
    );
    const [candidateSnaps, adminsSnap] = await Promise.all([
      Promise.all(candidates.map((uid) => tx.get(members.doc(uid)))),
      tx.get(members.where('role', '==', 'admin').where('active', '==', true)),
    ]);
    const active = new Set(candidateSnaps.filter((s) => s.get('active') === true).map((s) => s.id));
    const assigneeId = pickAssignee(
      (contactSnap?.get('assigneeId') as string | undefined) ?? null,
      (key['assigneeId'] as string | undefined) || null,
      adminsSnap.docs.map((d) => d.id),
      (uid) => active.has(uid),
    );
    if (!assigneeId) throw new HttpError(503, 'no-assignee');

    // Si ya tiene un negocio abierto con ese vendedor, no abrimos otro.
    const openLead = contactSnap
      ? (
          await tx.get(
            base.collection('leads').where('contactId', '==', contactSnap.id).where('assigneeId', '==', assigneeId),
          )
        ).docs.find((d) => !CLOSED.has(d.get('stage')))
      : undefined;

    // --- Escrituras ---
    const site = typeof key['name'] === 'string' && key['name'] ? key['name'] : keyId;
    const stamp = FieldValue.serverTimestamp();
    const nowTs = Timestamp.fromMillis(now);
    const origin = {
      keyId,
      site,
      page: p.page,
      utmSource: p.utmSource,
      utmMedium: p.utmMedium,
      utmCampaign: p.utmCampaign,
    };

    let leadRef: DocumentReference;
    let contactId: string;
    if (openLead) {
      leadRef = openLead.ref;
      contactId = contactSnap!.id;
      const next = openLead.get('nextFollowUpAt');
      tx.update(leadRef, {
        nextFollowUpAt: next instanceof Timestamp && next.toMillis() <= now ? next : nowTs,
        updatedAt: stamp,
      });
      tx.set(leadRef.collection('activities').doc(), {
        type: 'note',
        body: repeatNote(site, p),
        createdBy: assigneeId,
        createdAt: stamp,
      });
    } else {
      leadRef = base.collection('leads').doc();
      if (contactSnap) {
        contactId = contactSnap.id;
        // Un negocio nuevo reactiva al contacto si estaba archivado.
        tx.update(contactSnap.ref, {
          [`openBy.${assigneeId}`]: FieldValue.increment(1),
          archived: false,
          archivedAt: null,
          updatedAt: stamp,
        });
      } else {
        const ref = contacts.doc();
        contactId = ref.id;
        tx.set(ref, {
          statsV: STATS_VERSION,
          wonCount: 0,
          wonTotal: 0,
          firstWonAt: null,
          openBy: { [assigneeId]: 1 },
          name: p.name,
          company: p.company,
          email: p.email,
          phone: p.phone,
          assigneeId,
          notes: '',
          createdBy: assigneeId,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }
      tx.set(leadRef, {
        name: p.name,
        company: p.company,
        email: p.email,
        phone: p.phone,
        source: 'web',
        stage: 'new',
        assigneeId,
        notes: p.message,
        detail: p.interest,
        contactId,
        serviceId: null,
        serviceName: '',
        quantity: 1,
        unitPrice: 0,
        tier: 'bronze',
        tierPct: 0,
        extras: [],
        value: 0,
        priceAck: null,
        lostReason: '',
        lostCode: null,
        nextFollowUpAt: nowTs,
        lastContactAt: null,
        wonAt: null,
        origin,
        intakeId: intakeRef.id,
        createdBy: assigneeId,
        createdAt: stamp,
        updatedAt: stamp,
      });
      tx.set(leadRef.collection('activities').doc(), {
        type: 'created',
        body: `Formulario web · ${site}`,
        createdBy: assigneeId,
        createdAt: stamp,
      });
    }

    tx.set(base.collection('followups').doc(), {
      leadId: leadRef.id,
      leadName: openLead?.get('name') ?? p.name,
      company: openLead?.get('company') ?? p.company,
      assigneeId,
      dueAt: nowTs,
      channel: 'call',
      note: `Formulario web · ${site}`,
      status: 'pending',
      createdBy: assigneeId,
      createdAt: stamp,
    });

    tx.set(intakeRef, {
      ...p,
      keyId,
      site,
      status: 'processed',
      leadId: leadRef.id,
      contactId,
      assigneeId,
      merged: !!openLead,
      receivedAt: stamp,
    });

    tx.update(keyRef, {
      lastReceivedAt: stamp,
      receivedCount: FieldValue.increment(1),
      windowStart: Timestamp.fromMillis(rate.windowStart),
      windowCount: rate.windowCount,
    });

    return { id: intakeRef.id, leadId: leadRef.id, duplicate: false };
  });
}
