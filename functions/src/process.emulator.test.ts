import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT, sha256Hex, validatePayload } from './intake-core';
import { processIntake } from './process';

// Prueba `processIntake` contra el emulador de Firestore (`npm run test:emulator`).
// Empresa acme: ana (admin), luis y pedro (vendedores), inés (desactivada).

const SECRET = 'S3cr3t-'.repeat(6);
const T = 'acme';
let db: Firestore;
const app = initializeApp({ projectId: 'demo-crm-lead' }, 'intake-test');

function form(extra: Record<string, string> = {}) {
  const r = validatePayload({ name: 'María Gómez', email: 'maria@ejemplo.com', phone: '3055550101', ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const base = () => db.collection('tenants').doc(T);
async function all(col: string) {
  return (await base().collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any>);
}

beforeAll(() => {
  db = getFirestore(app);
});
afterAll(() => deleteApp(app));

beforeEach(async () => {
  await db.recursiveDelete(db.collection('tenants'));
  await base().set({ name: 'Acme', active: true });
  const m = base().collection('members');
  await m.doc('ana').set({ uid: 'ana', role: 'admin', active: true });
  await m.doc('luis').set({ uid: 'luis', role: 'member', active: true });
  await m.doc('pedro').set({ uid: 'pedro', role: 'member', active: true });
  await m.doc('ines').set({ uid: 'ines', role: 'member', active: false });
  await base().collection('intakeKeys').doc('web').set({
    name: 'Web Acme',
    assigneeId: 'luis',
    active: true,
    secretHash: sha256Hex(SECRET),
  });
});

describe('processIntake', () => {
  it('crea contacto, negocio, actividad, próxima acción y entrada, asignados al de la clave', async () => {
    const out = await processIntake(db, T, 'web', SECRET, form({ submissionId: 's1', interest: 'Auto', message: 'Hola' }));
    expect(out.duplicate).toBe(false);

    const [contact] = await all('contacts');
    expect(contact).toMatchObject({ name: 'María Gómez', email: 'maria@ejemplo.com', assigneeId: 'luis', openBy: { luis: 1 }, statsV: 1 });
    const [lead] = await all('leads');
    expect(lead).toMatchObject({ id: out.leadId, contactId: contact.id, assigneeId: 'luis', source: 'web', stage: 'new', detail: 'Auto', notes: 'Hola' });
    expect(lead.origin).toMatchObject({ keyId: 'web', site: 'Web Acme' });
    const [fu] = await all('followups');
    expect(fu).toMatchObject({ leadId: out.leadId, assigneeId: 'luis', channel: 'call', status: 'pending' });
    expect((fu.dueAt as Timestamp).toMillis()).toBe((lead.nextFollowUpAt as Timestamp).toMillis());
    const acts = await base().collection('leads').doc(out.leadId).collection('activities').get();
    expect(acts.docs.map((d) => d.get('type'))).toEqual(['created']);
    const intake = await base().collection('intake').doc('web_s1').get();
    expect(intake.data()).toMatchObject({ status: 'processed', leadId: out.leadId, assigneeId: 'luis' });
    expect(intake.data()).not.toHaveProperty('secret');
    const key = await base().collection('intakeKeys').doc('web').get();
    expect(key.get('receivedCount')).toBe(1);
  });

  it('un reintento con el mismo submissionId no duplica', async () => {
    const a = await processIntake(db, T, 'web', SECRET, form({ submissionId: 's1' }));
    const b = await processIntake(db, T, 'web', SECRET, form({ submissionId: 's1' }));
    expect(b).toEqual({ id: a.id, leadId: a.leadId, duplicate: true });
    expect(await all('leads')).toHaveLength(1);
  });

  it('rechaza secreto incorrecto, clave desactivada o empresa suspendida', async () => {
    await expect(processIntake(db, T, 'web', SECRET + 'x', form())).rejects.toMatchObject({ status: 401 });
    await expect(processIntake(db, T, 'otra', SECRET, form())).rejects.toMatchObject({ status: 401 });
    await expect(processIntake(db, 'beta', 'web', SECRET, form())).rejects.toMatchObject({ status: 401 });
    await base().collection('intakeKeys').doc('web').update({ active: false });
    await expect(processIntake(db, T, 'web', SECRET, form())).rejects.toMatchObject({ status: 401 });
    await base().collection('intakeKeys').doc('web').update({ active: true });
    await base().update({ active: false });
    await expect(processIntake(db, T, 'web', SECRET, form())).rejects.toMatchObject({ status: 401 });
    expect(await all('leads')).toHaveLength(0);
  });

  it('contacto existente: va a su dueño y, si ya tiene negocio abierto con él, añade nota sin abrir otro', async () => {
    await base().collection('contacts').doc('c1').set({ name: 'María', email: 'maria@ejemplo.com', phone: '', assigneeId: 'pedro', openBy: { pedro: 1 }, statsV: 1, archived: true });
    await base().collection('leads').doc('l1').set({ contactId: 'c1', assigneeId: 'pedro', stage: 'qualified', name: 'María', company: '', nextFollowUpAt: null });

    const out = await processIntake(db, T, 'web', SECRET, form({ message: 'Otra vez' }));
    expect(out.leadId).toBe('l1');
    expect(await all('leads')).toHaveLength(1);
    expect(await all('contacts')).toHaveLength(1);
    const acts = await base().collection('leads').doc('l1').collection('activities').get();
    expect(acts.docs[0].data()).toMatchObject({ type: 'note', createdBy: 'pedro' });
    const lead = await base().collection('leads').doc('l1').get();
    expect(lead.get('nextFollowUpAt')).toBeInstanceOf(Timestamp);
    const [fu] = await all('followups');
    expect(fu).toMatchObject({ leadId: 'l1', assigneeId: 'pedro' });
  });

  it('contacto existente sin negocio abierto: negocio nuevo y lo reactiva', async () => {
    await base().collection('contacts').doc('c1').set({ name: 'María', email: '', phone: '3055550101', assigneeId: 'ines', openBy: {}, statsV: 1, archived: true });
    const out = await processIntake(db, T, 'web', SECRET, form({ email: '' }));
    const lead = await base().collection('leads').doc(out.leadId).get();
    // La dueña está desactivada: va al responsable de la clave.
    expect(lead.data()).toMatchObject({ contactId: 'c1', assigneeId: 'luis' });
    const c = await base().collection('contacts').doc('c1').get();
    expect(c.data()).toMatchObject({ archived: false, openBy: { luis: 1 } });
  });

  it('sin responsable en la clave, va a un admin activo', async () => {
    await base().collection('intakeKeys').doc('web').update({ assigneeId: '' });
    const out = await processIntake(db, T, 'web', SECRET, form());
    const lead = await base().collection('leads').doc(out.leadId).get();
    expect(lead.get('assigneeId')).toBe('ana');
  });

  it('corta con 429 al pasar el límite por minuto', async () => {
    await base().collection('intakeKeys').doc('web').update({ windowStart: Timestamp.now(), windowCount: RATE_LIMIT });
    await expect(processIntake(db, T, 'web', SECRET, form())).rejects.toMatchObject({ status: 429 });
  });
});
