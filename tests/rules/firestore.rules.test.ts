import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Firestore,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Pruebas de firestore.rules. Equipo de ejemplo:
// - ana: admin · luis y pedro: vendedores · inés: vendedora desactivada · extraño: sin equipo.
// Catálogo: "web" a 1000 por unidad, categorías por defecto (3 / 5 / 7 %).

let env: RulesTestEnvironment;

const ANA = 'ana';
const LUIS = 'luis';
const PEDRO = 'pedro';
const INES = 'ines';
const STRANGER = 'extrano';

const emailOf = (uid: string) => `${uid}@ejemplo.com`;

function db(uid: string): Firestore {
  return env
    .authenticatedContext(uid, { email: emailOf(uid), email_verified: true })
    .firestore() as unknown as Firestore;
}

const member = (uid: string, role: 'admin' | 'member', active = true) => ({
  uid,
  email: emailOf(uid),
  displayName: uid,
  photoURL: null,
  role,
  active,
});

const contact = (assigneeId: string, createdBy = assigneeId) => ({
  name: 'Cliente',
  company: 'Empresa',
  email: 'cliente@empresa.com',
  phone: '',
  notes: '',
  assigneeId,
  createdBy,
});

// Lead del servicio "web": 2 unidades a 1000 en bronce (+3 %) = 2060.
const lead = (assigneeId: string, extra: Record<string, unknown> = {}) => ({
  name: 'Cliente',
  company: 'Empresa',
  email: 'cliente@empresa.com',
  phone: '',
  notes: '',
  detail: '',
  source: 'web',
  stage: 'new',
  assigneeId,
  createdBy: assigneeId,
  contactId: 'c1',
  serviceId: 'web',
  serviceName: 'Sitio web',
  quantity: 2,
  unitPrice: 1000,
  tier: 'bronze',
  tierPct: 3,
  value: 2060,
  ...extra,
});

const followUp = (leadId: string, assigneeId: string, createdBy = assigneeId) => ({
  leadId,
  leadName: 'Cliente',
  company: 'Empresa',
  assigneeId,
  createdBy,
  dueAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00Z')),
  channel: 'call',
  note: '',
  status: 'pending',
});

/** Carga datos saltándose las reglas. */
async function seed(data: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore() as unknown as Firestore;
    for (const [path, value] of Object.entries(data)) {
      await setDoc(doc(fs, path), value);
    }
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-crm-lead-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed({
    'meta/team': { ownerUid: ANA, name: 'Equipo' },
    [`members/${ANA}`]: member(ANA, 'admin'),
    [`members/${LUIS}`]: member(LUIS, 'member'),
    [`members/${PEDRO}`]: member(PEDRO, 'member'),
    [`members/${INES}`]: member(INES, 'member', false),
    'services/web': {
      name: 'Sitio web',
      description: '',
      price: 1000,
      unit: 'unidad',
      active: true,
    },
    'contacts/c1': contact(LUIS),
    'contacts/c2': contact(PEDRO),
    'leads/luis-1': lead(LUIS),
    'leads/pedro-1': lead(PEDRO, { contactId: 'c2' }),
    'leads/luis-1/activities/a1': { type: 'note', body: 'hola', createdBy: LUIS },
    'leads/pedro-1/activities/a1': { type: 'note', body: 'hola', createdBy: PEDRO },
    'followups/f-luis': followUp('luis-1', LUIS),
    'followups/f-pedro': followUp('pedro-1', PEDRO),
  });
});

describe('Alta en el equipo', () => {
  it('el primer usuario crea el equipo y queda como admin', async () => {
    await env.clearFirestore();
    const fs = db(ANA);
    const batch = writeBatch(fs);
    batch.set(doc(fs, 'meta/team'), { ownerUid: ANA, name: 'Mi equipo' });
    batch.set(doc(fs, `members/${ANA}`), member(ANA, 'admin'));
    await assertSucceeds(batch.commit());
  });

  it('si ya hay equipo, nadie entra como admin sin invitación', async () => {
    await assertFails(setDoc(doc(db(STRANGER), `members/${STRANGER}`), member(STRANGER, 'admin')));
    await assertFails(setDoc(doc(db(STRANGER), `members/${STRANGER}`), member(STRANGER, 'member')));
  });

  it('un invitado entra con el rol de su invitación, no con otro', async () => {
    await seed({
      [`invites/${emailOf(STRANGER)}`]: {
        email: emailOf(STRANGER),
        role: 'member',
        invitedBy: ANA,
      },
    });
    const fs = db(STRANGER);
    await assertFails(setDoc(doc(fs, `members/${STRANGER}`), member(STRANGER, 'admin')));
    await assertSucceeds(setDoc(doc(fs, `members/${STRANGER}`), member(STRANGER, 'member')));
  });

  it('un correo sin verificar no lee nada', async () => {
    const fs = env
      .authenticatedContext(LUIS, { email: emailOf(LUIS), email_verified: false })
      .firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(fs, 'contacts/c1')));
  });

  it('quien no es del equipo o está desactivado no lee datos', async () => {
    await assertFails(getDoc(doc(db(STRANGER), 'contacts/c1')));
    await assertFails(getDoc(doc(db(INES), 'contacts/c1')));
    await assertFails(getDoc(doc(db(INES), 'services/web')));
  });
});

describe('Roles y acceso', () => {
  it('un admin cambia el rol y el acceso de otro miembro', async () => {
    await assertSucceeds(updateDoc(doc(db(ANA), `members/${LUIS}`), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(db(ANA), `members/${PEDRO}`), { active: false }));
  });

  it('nadie cambia su propio rol ni acceso, ni siquiera un admin', async () => {
    await assertFails(updateDoc(doc(db(ANA), `members/${ANA}`), { role: 'member' }));
    await assertFails(updateDoc(doc(db(ANA), `members/${ANA}`), { active: false }));
    await assertFails(updateDoc(doc(db(LUIS), `members/${LUIS}`), { role: 'admin' }));
  });

  it('un vendedor no cambia el rol de otro', async () => {
    await assertFails(updateDoc(doc(db(LUIS), `members/${PEDRO}`), { role: 'admin' }));
    await assertFails(updateDoc(doc(db(LUIS), `members/${ANA}`), { active: false }));
  });

  it('el rol solo puede ser admin o member', async () => {
    await assertFails(updateDoc(doc(db(ANA), `members/${LUIS}`), { role: 'jefe' }));
  });

  it('cada uno actualiza su nombre, pero no otros campos de su ficha', async () => {
    await assertSucceeds(updateDoc(doc(db(LUIS), `members/${LUIS}`), { displayName: 'Luis G.' }));
    await assertFails(updateDoc(doc(db(LUIS), `members/${LUIS}`), { email: 'otro@ejemplo.com' }));
  });

  it('solo un admin invita y cambia el rol de una invitación', async () => {
    const invite = { email: 'nuevo@ejemplo.com', role: 'member', invitedBy: LUIS };
    await assertFails(setDoc(doc(db(LUIS), 'invites/nuevo@ejemplo.com'), invite));
    await assertSucceeds(
      setDoc(doc(db(ANA), 'invites/nuevo@ejemplo.com'), { ...invite, invitedBy: ANA }),
    );
    await assertFails(updateDoc(doc(db(LUIS), 'invites/nuevo@ejemplo.com'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(db(ANA), 'invites/nuevo@ejemplo.com'), { role: 'admin' }));
  });

  it('nadie borra miembros', async () => {
    await assertFails(deleteDoc(doc(db(ANA), `members/${LUIS}`)));
  });
});

describe('Contactos (todo el equipo)', () => {
  it('un vendedor ve los contactos de otros y crea los suyos', async () => {
    await assertSucceeds(getDoc(doc(db(LUIS), 'contacts/c2')));
    await assertSucceeds(getDocs(collection(db(LUIS), 'contacts')));
    await assertSucceeds(setDoc(doc(db(LUIS), 'contacts/c3'), contact(LUIS)));
  });

  it('un vendedor edita un contacto, pero no cambia su responsable', async () => {
    await assertSucceeds(updateDoc(doc(db(LUIS), 'contacts/c2'), { phone: '555' }));
    await assertFails(updateDoc(doc(db(LUIS), 'contacts/c2'), { assigneeId: LUIS }));
  });

  it('solo un admin cambia el responsable o borra un contacto', async () => {
    await assertSucceeds(updateDoc(doc(db(ANA), 'contacts/c2'), { assigneeId: LUIS }));
    await assertFails(deleteDoc(doc(db(LUIS), 'contacts/c1')));
    await assertSucceeds(deleteDoc(doc(db(ANA), 'contacts/c1')));
  });

  it('solo un admin archiva; cualquiera reactiva', async () => {
    await assertFails(updateDoc(doc(db(LUIS), 'contacts/c1'), { archived: true }));
    await assertFails(
      updateDoc(doc(db(LUIS), 'contacts/c1'), { archivedAt: Timestamp.fromDate(new Date()) }),
    );
    await assertSucceeds(
      updateDoc(doc(db(ANA), 'contacts/c1'), { archived: true, archivedAt: Timestamp.fromDate(new Date()) }),
    );
    // Editar otros datos de un archivado no lo reactiva ni lo impide.
    await assertSucceeds(updateDoc(doc(db(LUIS), 'contacts/c1'), { phone: '555' }));
    await assertSucceeds(updateDoc(doc(db(LUIS), 'contacts/c1'), { archived: false, archivedAt: null }));
    await assertFails(updateDoc(doc(db(ANA), 'contacts/c1'), { archived: 'sí' }));
  });

  it('al archivar, el admin pasa sus negocios abiertos a perdido y cancela sus follow-ups', async () => {
    const fs = db(ANA);
    const batch = writeBatch(fs);
    batch.update(doc(fs, 'leads/luis-1'), { stage: 'lost', lostReason: 'Archivado', nextFollowUpAt: null });
    batch.set(doc(fs, 'leads/luis-1/activities/a9'), { type: 'stage', from: 'new', to: 'lost', body: 'Archivado', createdBy: ANA });
    batch.update(doc(fs, 'followups/f-luis'), { status: 'cancelled' });
    batch.update(doc(fs, 'contacts/c1'), { archived: true, archivedAt: Timestamp.fromDate(new Date()), openBy: {} });
    await assertSucceeds(batch.commit());
  });

  it('un admin no borra a un cliente con ventas ganadas', async () => {
    await seed({ 'contacts/c3': { ...contact(LUIS), wonCount: 1, wonTotal: 2060 } });
    await assertFails(deleteDoc(doc(db(ANA), 'contacts/c3')));
    await seed({ 'contacts/c4': { ...contact(LUIS), wonCount: 0, wonTotal: 0 } });
    await assertFails(deleteDoc(doc(db(LUIS), 'contacts/c4')));
    await assertSucceeds(deleteDoc(doc(db(ANA), 'contacts/c4')));
  });

  it('un admin borra un contacto con sus negocios, historial y follow-ups', async () => {
    const fs = db(ANA);
    const first = writeBatch(fs);
    first.delete(doc(fs, 'leads/luis-1/activities/a1'));
    first.delete(doc(fs, 'followups/f-luis'));
    await assertSucceeds(first.commit());
    await assertSucceeds(deleteDoc(doc(fs, 'leads/luis-1')));
    await assertSucceeds(deleteDoc(doc(fs, 'contacts/c1')));
  });

  it('un vendedor no borra el historial ni los follow-ups de otro', async () => {
    await assertFails(deleteDoc(doc(db(LUIS), 'leads/pedro-1/activities/a1')));
    await assertFails(deleteDoc(doc(db(LUIS), 'followups/f-pedro')));
  });

  it('nadie crea un contacto a nombre de otro creador', async () => {
    await assertFails(setDoc(doc(db(LUIS), 'contacts/c3'), contact(LUIS, PEDRO)));
  });
});

describe('Leads: cada vendedor ve solo los suyos', () => {
  it('un vendedor lee su lead pero no el de otro', async () => {
    await assertSucceeds(getDoc(doc(db(LUIS), 'leads/luis-1')));
    await assertFails(getDoc(doc(db(LUIS), 'leads/pedro-1')));
  });

  it('un vendedor necesita filtrar por assigneeId; el admin no', async () => {
    const mine = query(collection(db(LUIS), 'leads'), where('assigneeId', '==', LUIS));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDocs(collection(db(LUIS), 'leads')));
    await assertSucceeds(getDocs(collection(db(ANA), 'leads')));
  });

  it('un negocio nuevo con un contacto archivado lo reactiva en el mismo batch', async () => {
    await seed({ 'contacts/c1': { ...contact(LUIS), archived: true, archivedAt: Timestamp.fromDate(new Date()) } });
    const fs = db(LUIS);
    const batch = writeBatch(fs);
    batch.set(doc(fs, 'leads/luis-2'), lead(LUIS));
    batch.update(doc(fs, 'contacts/c1'), { archived: false, archivedAt: null });
    await assertSucceeds(batch.commit());
  });

  it('un vendedor crea leads solo a su nombre', async () => {
    await assertSucceeds(setDoc(doc(db(LUIS), 'leads/luis-2'), lead(LUIS)));
    await assertFails(setDoc(doc(db(LUIS), 'leads/luis-3'), lead(PEDRO, { createdBy: LUIS })));
  });

  it('un vendedor no edita ni borra el lead de otro', async () => {
    await assertFails(updateDoc(doc(db(LUIS), 'leads/pedro-1'), { notes: 'mío' }));
    await assertFails(deleteDoc(doc(db(LUIS), 'leads/pedro-1')));
  });

  it('solo un admin reasigna un lead', async () => {
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-1'), { assigneeId: PEDRO }));
    await assertSucceeds(updateDoc(doc(db(ANA), 'leads/luis-1'), { assigneeId: PEDRO }));
  });

  it('al reasignar, el admin arrastra los follow-ups pendientes', async () => {
    const fs = db(ANA);
    const batch = writeBatch(fs);
    batch.update(doc(fs, 'leads/luis-1'), { assigneeId: PEDRO });
    batch.update(doc(fs, 'followups/f-luis'), { assigneeId: PEDRO });
    await assertSucceeds(batch.commit());
  });

  it('borrar: el creador si sigue de responsable, o un admin', async () => {
    await seed({ 'leads/luis-2': lead(LUIS, { createdBy: ANA }) });
    await assertFails(deleteDoc(doc(db(LUIS), 'leads/luis-2')));
    await assertSucceeds(deleteDoc(doc(db(LUIS), 'leads/luis-1')));
    await assertSucceeds(deleteDoc(doc(db(ANA), 'leads/luis-2')));
  });

  it('el historial sigue la visibilidad del lead', async () => {
    await assertSucceeds(getDocs(collection(db(LUIS), 'leads/luis-1/activities')));
    await assertFails(getDocs(collection(db(LUIS), 'leads/pedro-1/activities')));
    await assertSucceeds(getDocs(collection(db(ANA), 'leads/pedro-1/activities')));
    const note = { type: 'note', body: 'x', createdBy: LUIS };
    await assertSucceeds(setDoc(doc(db(LUIS), 'leads/luis-1/activities/a2'), note));
    await assertFails(setDoc(doc(db(LUIS), 'leads/pedro-1/activities/a2'), note));
  });

  it('los follow-ups siguen la visibilidad del lead', async () => {
    const mine = query(collection(db(LUIS), 'followups'), where('assigneeId', '==', LUIS));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDoc(doc(db(LUIS), 'followups/f-pedro')));
    await assertFails(getDocs(collection(db(LUIS), 'followups')));
    await assertSucceeds(setDoc(doc(db(LUIS), 'followups/f2'), followUp('luis-1', LUIS)));
    await assertFails(setDoc(doc(db(LUIS), 'followups/f3'), followUp('pedro-1', PEDRO, LUIS)));
    // El follow-up es del responsable del lead, aunque lo programe el admin.
    await assertFails(setDoc(doc(db(ANA), 'followups/f4'), followUp('luis-1', ANA)));
    await assertSucceeds(setDoc(doc(db(ANA), 'followups/f4'), followUp('luis-1', LUIS, ANA)));
  });
});

describe('Catálogo y categorías de venta (solo admin)', () => {
  const service = { name: 'SEO', description: '', price: 500, unit: 'mes', active: true };

  it('un vendedor lee el catálogo pero no lo edita', async () => {
    await assertSucceeds(getDoc(doc(db(LUIS), 'services/web')));
    await assertFails(setDoc(doc(db(LUIS), 'services/seo'), service));
    await assertFails(updateDoc(doc(db(LUIS), 'services/web'), { price: 1 }));
  });

  it('un admin crea y cambia precios, pero no borra servicios', async () => {
    await assertSucceeds(setDoc(doc(db(ANA), 'services/seo'), service));
    await assertSucceeds(updateDoc(doc(db(ANA), 'services/web'), { price: 1200 }));
    await assertFails(updateDoc(doc(db(ANA), 'services/web'), { price: -1 }));
    await assertFails(deleteDoc(doc(db(ANA), 'services/web')));
  });

  it('solo un admin cambia los % de categoría, entre 0 y 100', async () => {
    const pricing = { bronze: 4, silver: 6, gold: 8 };
    await assertFails(setDoc(doc(db(LUIS), 'meta/pricing'), pricing));
    await assertFails(setDoc(doc(db(ANA), 'meta/pricing'), { ...pricing, gold: 150 }));
    await assertSucceeds(setDoc(doc(db(ANA), 'meta/pricing'), pricing));
  });
});

describe('Precio de un lead', () => {
  it('se crea con el precio oficial y el % vigente de la categoría', async () => {
    await assertSucceeds(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS)));
    await assertSucceeds(
      setDoc(doc(db(LUIS), 'leads/n2'), lead(LUIS, { tier: 'gold', tierPct: 7, value: 2140 })),
    );
  });

  it('no se puede vender por debajo del precio oficial', async () => {
    await assertFails(
      setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { unitPrice: 900, value: 1854 })),
    );
  });

  it('el % debe ser el de la categoría y el valor debe cuadrar', async () => {
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { tierPct: 0, value: 2000 })));
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { tierPct: 5, value: 2100 })));
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { value: 5000 })));
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { tier: 'platino' })));
  });

  it('usa los % que fije el admin en meta/pricing', async () => {
    await seed({ 'meta/pricing': { bronze: 4, silver: 6, gold: 8 } });
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS)));
    await assertSucceeds(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { tierPct: 4, value: 2080 })));
  });

  it('sin servicio, el valor es 0 y no se escribe a mano', async () => {
    const bare = {
      serviceId: null,
      serviceName: null,
      quantity: null,
      unitPrice: null,
      tier: null,
      tierPct: null,
    };
    await assertSucceeds(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { ...bare, value: 0 })));
    await assertFails(setDoc(doc(db(LUIS), 'leads/n2'), lead(LUIS, { ...bare, value: 500 })));
    await assertFails(updateDoc(doc(db(LUIS), 'leads/n'), { value: 500 }));
  });

  it('si sube el precio oficial, un lead abierto conserva el pactado o toma el nuevo', async () => {
    await seed({
      'services/web': { name: 'Sitio web', description: '', price: 1200, unit: 'u', active: true },
    });
    // Mantener el pactado (1000) y cambiar la cantidad.
    await assertSucceeds(
      updateDoc(doc(db(LUIS), 'leads/luis-1'), { quantity: 3, value: 3090, priceAck: 1200 }),
    );
    // Tomar el nuevo precio oficial.
    await assertSucceeds(
      updateDoc(doc(db(LUIS), 'leads/luis-1'), { unitPrice: 1200, quantity: 1, value: 1236 }),
    );
    // Un precio inventado, no.
    await assertFails(
      updateDoc(doc(db(LUIS), 'leads/luis-1'), { unitPrice: 800, quantity: 1, value: 824 }),
    );
  });

  it('un lead ganado no cambia de precio', async () => {
    await seed({ 'leads/luis-won': lead(LUIS, { stage: 'won' }) });
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-won'), { quantity: 3, value: 3090 }));
    await assertFails(
      updateDoc(doc(db(ANA), 'leads/luis-won'), { tier: 'gold', tierPct: 7, value: 2140 }),
    );
    // Otros campos sí.
    await assertSucceeds(updateDoc(doc(db(LUIS), 'leads/luis-won'), { notes: 'pagado' }));
  });
});

describe('Resumen de compras del contacto', () => {
  // c1 con una venta ganada y un negocio abierto de Luis y otro de Pedro.
  const stats = { statsV: 1, wonCount: 1, wonTotal: 2060, firstWonAt: null, openBy: { [LUIS]: 1, [PEDRO]: 1 } };
  beforeEach(async () => {
    await seed({ 'contacts/c1': { ...contact(LUIS), ...stats } });
  });

  it('un vendedor lo mueve como lo mueve un lead suyo', async () => {
    const ref = doc(db(LUIS), 'contacts/c1');
    // Gana su negocio: abierto −1, ventas +1.
    await assertSucceeds(updateDoc(ref, { [`openBy.${LUIS}`]: 0, wonCount: 2, wonTotal: 4120 }));
    // Borra una venta suya: ventas −1.
    await assertSucceeds(updateDoc(ref, { wonCount: 1, wonTotal: 2060 }));
    // Primera venta: fija la fecha con la hora del servidor.
    await assertSucceeds(updateDoc(ref, { wonCount: 2, wonTotal: 4120, firstWonAt: serverTimestamp() }));
  });

  it('un vendedor no reescribe el resumen a mano', async () => {
    const ref = doc(db(LUIS), 'contacts/c1');
    await assertFails(updateDoc(ref, { wonCount: 0, wonTotal: 0, openBy: {} }));
    await assertFails(updateDoc(ref, { wonCount: 5 }));
    await assertFails(updateDoc(ref, { wonTotal: 999999 }));
    await assertFails(updateDoc(ref, { [`openBy.${PEDRO}`]: 0 }));
    await assertFails(updateDoc(ref, { [`openBy.${LUIS}`]: 9 }));
    await assertFails(updateDoc(ref, { statsV: 2 }));
    await assertFails(updateDoc(ref, { wonCount: 'muchas' }));
    await assertFails(updateDoc(ref, { firstWonAt: Timestamp.fromDate(new Date('2020-01-01')) }));
  });

  it('un admin lo recalcula entero', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ANA), 'contacts/c1'), { statsV: 1, wonCount: 3, wonTotal: 6180, openBy: {} }),
    );
  });

  it('un contacto nuevo nace con el resumen de su primer lead', async () => {
    const fresh = { ...contact(LUIS), statsV: 1, wonCount: 0, wonTotal: 0, firstWonAt: null };
    await assertSucceeds(setDoc(doc(db(LUIS), 'contacts/c3'), { ...fresh, openBy: { [LUIS]: 1 } }));
    await assertFails(setDoc(doc(db(LUIS), 'contacts/c4'), { ...fresh, openBy: { [PEDRO]: 1 } }));
    await assertFails(setDoc(doc(db(LUIS), 'contacts/c5'), { ...fresh, wonCount: 7, wonTotal: 9000, openBy: {} }));
  });
});

describe('Validación al editar', () => {
  it('un vendedor no mueve su lead a otro contacto; el admin sí', async () => {
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-1'), { contactId: 'c2' }));
    await assertSucceeds(updateDoc(doc(db(ANA), 'leads/luis-1'), { contactId: 'c2' }));
  });

  it('no se vende un servicio archivado', async () => {
    await seed({ 'services/viejo': { name: 'Viejo', description: '', price: 1000, unit: 'u', active: false } });
    await assertFails(setDoc(doc(db(LUIS), 'leads/n'), lead(LUIS, { serviceId: 'viejo' })));
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-1'), { serviceId: 'viejo' }));
    // Un lead que ya lo tenía lo conserva aunque se archive.
    await seed({ 'leads/luis-v': lead(LUIS, { serviceId: 'viejo' }) });
    await assertSucceeds(updateDoc(doc(db(LUIS), 'leads/luis-v'), { quantity: 3, value: 3090 }));
  });

  it('un follow-up editado sigue teniendo fecha, canal y tamaños válidos', async () => {
    const ref = doc(db(LUIS), 'followups/f-luis');
    await assertSucceeds(updateDoc(ref, { dueAt: Timestamp.fromDate(new Date('2026-12-01T10:00:00Z')) }));
    await assertSucceeds(updateDoc(ref, { status: 'done', outcome: 'Hablamos' }));
    await assertFails(updateDoc(ref, { dueAt: 'mañana' }));
    await assertFails(updateDoc(ref, { channel: 'paloma' }));
    await assertFails(updateDoc(ref, { note: 'x'.repeat(1001) }));
    await assertFails(updateDoc(ref, { outcome: 'x'.repeat(5001) }));
  });

  it('cerrar un negocio: el vendedor lo pierde con un motivo de la lista y cancela sus follow-ups', async () => {
    const fs = db(LUIS);
    const batch = writeBatch(fs);
    batch.update(doc(fs, 'leads/luis-1'), { stage: 'lost', lostCode: 'price', lostReason: 'Muy caro', nextFollowUpAt: null });
    batch.update(doc(fs, 'followups/f-luis'), { status: 'cancelled' });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-1'), { lostCode: 'aburrido' }));
  });

  it('el historial solo admite tipos conocidos y textos acotados', async () => {
    await assertFails(setDoc(doc(db(LUIS), 'leads/luis-1/activities/a2'), { type: 'hack', body: 'x', createdBy: LUIS }));
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-1/activities/a1'), { body: 'x'.repeat(5001) }));
    await assertSucceeds(updateDoc(doc(db(LUIS), 'leads/luis-1/activities/a1'), { body: 'corregido' }));
  });

  it('el nombre y la foto propios tienen tipo y tamaño', async () => {
    const ref = doc(db(LUIS), `members/${LUIS}`);
    await assertSucceeds(updateDoc(ref, { displayName: 'Luis G.' }));
    await assertFails(updateDoc(ref, { displayName: 'x'.repeat(201) }));
    await assertFails(updateDoc(ref, { photoURL: 42 }));
  });
});

describe('Venta ganada: solo un admin la reabre o la borra', () => {
  beforeEach(async () => {
    await seed({ 'leads/luis-won': lead(LUIS, { stage: 'won' }) });
  });

  it('un vendedor no la devuelve a otra etapa ni la borra', async () => {
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-won'), { stage: 'negotiation', wonAt: null }));
    await assertFails(updateDoc(doc(db(LUIS), 'leads/luis-won'), { stage: 'lost' }));
    await assertFails(deleteDoc(doc(db(LUIS), 'leads/luis-won')));
    // Sí puede ganar un lead suyo y seguir editando la venta.
    await assertSucceeds(updateDoc(doc(db(LUIS), 'leads/luis-1'), { stage: 'won' }));
    await assertSucceeds(updateDoc(doc(db(LUIS), 'leads/luis-won'), { notes: 'pagado' }));
  });

  it('un admin la reabre y la borra', async () => {
    await assertSucceeds(updateDoc(doc(db(ANA), 'leads/luis-won'), { stage: 'negotiation', wonAt: null }));
    await assertSucceeds(deleteDoc(doc(db(ANA), 'leads/luis-won')));
  });
});

describe('Última entrada y salida (sessions)', () => {
  const now = serverTimestamp;

  it('cada miembro anota su entrada y su salida con la hora del servidor', async () => {
    const ref = doc(db(LUIS), `sessions/${LUIS}`);
    await assertSucceeds(setDoc(ref, { signInAt: now() }, { merge: true }));
    await assertSucceeds(setDoc(ref, { signOutAt: now(), signOutReason: 'manual' }, { merge: true }));
    await assertSucceeds(setDoc(ref, { signOutAt: now(), signOutReason: 'idle' }, { merge: true }));
    await assertSucceeds(setDoc(ref, { signInAt: now() }, { merge: true }));
  });

  it('nadie anota ni cambia la de otro, ni siquiera un admin', async () => {
    await assertFails(setDoc(doc(db(LUIS), `sessions/${PEDRO}`), { signInAt: now() }, { merge: true }));
    await assertFails(setDoc(doc(db(ANA), `sessions/${LUIS}`), { signOutAt: now(), signOutReason: 'manual' }, { merge: true }));
    await seed({ [`sessions/${PEDRO}`]: { signInAt: Timestamp.now() } });
    await assertFails(deleteDoc(doc(db(ANA), `sessions/${PEDRO}`)));
    await assertFails(deleteDoc(doc(db(PEDRO), `sessions/${PEDRO}`)));
  });

  it('no se puede inventar la fecha, el motivo ni otros campos', async () => {
    const ref = doc(db(LUIS), `sessions/${LUIS}`);
    const ayer = Timestamp.fromMillis(Date.now() - 86_400_000);
    await assertFails(setDoc(ref, { signInAt: ayer }, { merge: true }));
    await assertFails(setDoc(ref, { signOutAt: ayer, signOutReason: 'manual' }, { merge: true }));
    await assertFails(setDoc(ref, { signOutAt: now(), signOutReason: 'otro' }, { merge: true }));
    await assertFails(setDoc(ref, { signOutAt: now() }, { merge: true }));
    await assertFails(setDoc(ref, { signInAt: now(), ip: '1.2.3.4' }, { merge: true }));
  });

  it('quien no es miembro activo no anota nada', async () => {
    await assertFails(setDoc(doc(db(INES), `sessions/${INES}`), { signInAt: now() }, { merge: true }));
    await assertFails(setDoc(doc(db(STRANGER), `sessions/${STRANGER}`), { signInAt: now() }, { merge: true }));
  });

  it('solo un admin lo lee', async () => {
    await seed({ [`sessions/${LUIS}`]: { signInAt: Timestamp.now() } });
    await assertSucceeds(getDoc(doc(db(ANA), `sessions/${LUIS}`)));
    await assertSucceeds(getDocs(collection(db(ANA), 'sessions')));
    await assertFails(getDoc(doc(db(LUIS), `sessions/${LUIS}`)));
    await assertFails(getDoc(doc(db(PEDRO), `sessions/${LUIS}`)));
    await assertFails(getDocs(collection(db(PEDRO), 'sessions')));
  });
});
