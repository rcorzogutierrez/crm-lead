import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { parseToken, validatePayload } from './intake-core.js';
import { HttpError, processIntake } from './process.js';

initializeApp();

/** Cuerpo máximo aceptado (bytes). */
const MAX_BODY = 16 * 1024;

/**
 * Entrada de leads desde sitios web: `POST /api/intake` (ruta de Hosting) con
 * `Authorization: Bearer <empresaId>.<claveId>.<secreto>` y el formulario en JSON.
 * La clave (`tenants/{t}/intakeKeys/{k}`, la crea el admin en Ajustes → Sitios web) decide la
 * empresa y el responsable por defecto. En una sola transacción guarda la entrada y crea
 * contacto, negocio, actividad y la próxima acción "Llamar" para ahora.
 */
export const intake = onRequest(
  { region: 'us-central1', memory: '256MiB', maxInstances: 5, timeoutSeconds: 30 },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method');
      if (!req.is('application/json')) throw new HttpError(415, 'content-type');
      if ((req.rawBody?.length ?? 0) > MAX_BODY) throw new HttpError(413, 'too-large');
      const token = parseToken(req.get('authorization'));
      if (!token) throw new HttpError(401, 'token');
      const valid = validatePayload(req.body);
      if (!valid.ok) throw new HttpError(400, `invalid:${valid.error}`);

      const out = await processIntake(getFirestore(), token.tenantId, token.keyId, token.secret, valid.data);
      res.status(out.duplicate ? 200 : 201).json({ ok: true, ...out });
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status >= 500 || e.status === 429) logger.warn('intake rechazado', { code: e.code });
        res.status(e.status).json({ ok: false, error: e.code });
        return;
      }
      logger.error('intake falló', e);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);
