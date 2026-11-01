import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Lógica pura de la entrada de leads desde sitios web (sin Firestore): leer el token,
 * validar el formulario, limitar la frecuencia y elegir responsable. Se prueba en
 * `intake-core.spec.ts`; `index.ts` la usa dentro de la transacción.
 */

/** Token que se entrega al sitio: `<empresaId>.<claveId>.<secreto>`. */
export interface IntakeToken {
  tenantId: string;
  keyId: string;
  secret: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

/** Lee `Authorization: Bearer <token>`; null si falta o no tiene la forma esperada. */
export function parseToken(header: string | undefined): IntakeToken | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '');
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const [tenantId, keyId, secret] = parts;
  if (!ID.test(tenantId) || !ID.test(keyId) || !SECRET.test(secret)) return null;
  return { tenantId, keyId, secret };
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Compara el hash del secreto recibido con el guardado, en tiempo constante. */
export function secretMatches(secret: string, storedHash: unknown): boolean {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(sha256Hex(secret), 'hex'), Buffer.from(storedHash, 'hex'));
}

/** Lo que el sitio puede mandar (todo texto); lo demás se ignora. */
export interface IntakePayload {
  submissionId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  interest: string;
  message: string;
  page: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

/** Tamaño máximo de cada campo (caracteres). */
export const LIMITS: Record<keyof IntakePayload, number> = {
  submissionId: 64,
  name: 120,
  email: 160,
  phone: 40,
  company: 120,
  interest: 120,
  message: 2000,
  page: 300,
  utmSource: 100,
  utmMedium: 100,
  utmCampaign: 100,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult = { ok: true; data: IntakePayload } | { ok: false; error: string };

/** Valida y limpia el cuerpo JSON del formulario. `error` es el campo que falla. */
export function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body' };
  const src = body as Record<string, unknown>;
  const data = {} as IntakePayload;
  for (const key of Object.keys(LIMITS) as (keyof IntakePayload)[]) {
    const raw = src[key];
    if (raw !== undefined && raw !== null && typeof raw !== 'string') return { ok: false, error: key };
    // Espacios de más fuera; sin caracteres de control (salvo saltos de línea en el mensaje).
    const value = (raw ?? '')
      .replace(key === 'message' ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ')
      .trim();
    if (value.length > LIMITS[key]) return { ok: false, error: key };
    data[key] = value;
  }
  data.email = data.email.toLowerCase();
  if (data.name.length < 2) return { ok: false, error: 'name' };
  if (data.email && !EMAIL.test(data.email)) return { ok: false, error: 'email' };
  if (data.phone && !/\d{6,}/.test(data.phone.replace(/\D/g, ''))) return { ok: false, error: 'phone' };
  if (!data.email && !data.phone) return { ok: false, error: 'contact' };
  if (data.submissionId && !ID.test(data.submissionId)) return { ok: false, error: 'submissionId' };
  if (data.page && !/^https?:\/\//i.test(data.page)) return { ok: false, error: 'page' };
  return { ok: true, data };
}

/** Envíos por clave y minuto antes de responder 429. */
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60_000;

/** Ventana fija por clave: devuelve si se acepta y cómo queda el contador. */
export function rateWindow(
  now: number,
  windowStart: number | null,
  windowCount: number,
): { allowed: boolean; windowStart: number; windowCount: number } {
  if (windowStart === null || now - windowStart >= RATE_WINDOW_MS || now < windowStart) {
    return { allowed: true, windowStart: now, windowCount: 1 };
  }
  if (windowCount >= RATE_LIMIT) return { allowed: false, windowStart, windowCount };
  return { allowed: true, windowStart, windowCount: windowCount + 1 };
}

/**
 * Responsable del negocio: el dueño del contacto si ya existe y sigue activo; si no, el
 * responsable de la clave del sitio; si tampoco, un admin activo (que luego lo reasigna).
 */
export function pickAssignee(
  contactOwner: string | null,
  keyAssignee: string | null,
  activeAdmins: readonly string[],
  isActive: (uid: string) => boolean,
): string | null {
  if (contactOwner && isActive(contactOwner)) return contactOwner;
  if (keyAssignee && isActive(keyAssignee)) return keyAssignee;
  return [...activeAdmins].sort()[0] ?? null;
}

/** Texto del historial cuando el contacto ya tenía un negocio abierto con ese vendedor. */
export function repeatNote(site: string, p: IntakePayload): string {
  const head = `Nuevo formulario web (${site})`;
  const extra = [p.interest, p.message].filter(Boolean).join(' — ');
  return extra ? `${head}: ${extra}` : head;
}
