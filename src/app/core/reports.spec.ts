import { FollowUp, Lead } from './models';
import { customRange, dayParam, followUpScore, myNumbers, parseDay, periodRange, precedingRange, previousRange, weekRange, weekReport } from './reports';

function lead(p: Partial<Lead>): Lead {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    name: 'X',
    company: '',
    email: '',
    phone: '',
    source: 'web',
    stage: 'new',
    value: 0,
    assigneeId: 'u1',
    notes: '',
    lostReason: '',
    lostCode: null,
    extras: [],
    nextFollowUpAt: null,
    lastContactAt: null,
    createdBy: 'u1',
    createdAt: null,
    updatedAt: null,
    contactId: null,
    serviceId: 's1',
    serviceName: 'Servicio',
    detail: '',
    quantity: 1,
    unitPrice: 0,
    tier: 'bronze',
    tierPct: 3,
    priceAck: null,
    wonAt: null,
    lostAt: null,
    ...p,
  };
}

function fu(dueAt: Date, p: Partial<FollowUp> = {}): FollowUp {
  return { id: 'f', leadId: 'l', leadName: '', company: '', assigneeId: 'u1', dueAt, channel: 'call', note: '', status: 'pending', createdBy: 'u1', completedAt: null, ...p };
}

// Domingo 25 de octubre de 2026, 18:00.
const now = new Date(2026, 9, 25, 18, 0);

describe('rangos de los reportes', () => {
  it('la semana empieza el lunes, también si hoy es domingo', () => {
    const r = weekRange(now);
    expect(r.start).toEqual(new Date(2026, 9, 19));
    expect(r.end).toEqual(new Date(2026, 9, 26));
  });

  it('mes y trimestre de calendario, y su periodo anterior', () => {
    const month = periodRange('month', now);
    expect(month).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) });
    expect(previousRange('month', month)).toEqual({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) });
    const quarter = periodRange('quarter', now);
    expect(quarter).toEqual({ start: new Date(2026, 9, 1), end: new Date(2027, 0, 1) });
    expect(previousRange('quarter', quarter).start).toEqual(new Date(2026, 6, 1));
  });
});

describe('rango personalizado', () => {
  it('incluye los dos días aunque lleguen al revés y compara con los mismos días de antes', () => {
    const r = customRange(new Date(2026, 9, 15, 18), new Date(2026, 9, 1, 9));
    expect(r).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 16) });
    expect(precedingRange(r)).toEqual({ start: new Date(2026, 8, 16), end: new Date(2026, 9, 1) });
  });

  it('lee y escribe fechas de la URL y rechaza las imposibles', () => {
    expect(parseDay('2026-10-05')).toEqual(new Date(2026, 9, 5));
    expect(parseDay('2026-02-31')).toBeNull();
    expect(parseDay('5/10/2026')).toBeNull();
    expect(dayParam(new Date(2026, 0, 7))).toBe('2026-01-07');
  });
});

describe('informe de la semana', () => {
  const week = weekRange(now);

  it('cuenta lo que entró por origen y lo ganado y perdido en la semana', () => {
    const leads = [
      lead({ createdAt: new Date(2026, 9, 20), source: 'whatsapp' }),
      lead({ createdAt: new Date(2026, 9, 21), source: 'whatsapp' }),
      lead({ createdAt: new Date(2026, 9, 22), source: 'referral' }),
      lead({ createdAt: new Date(2026, 9, 12), source: 'web' }),
      lead({ stage: 'won', value: 1000, wonAt: new Date(2026, 9, 23), createdAt: new Date(2026, 8, 1) }),
      lead({ stage: 'won', value: 500, wonAt: new Date(2026, 9, 18), createdAt: new Date(2026, 8, 1) }),
      lead({ stage: 'lost', lostAt: new Date(2026, 9, 24), createdAt: new Date(2026, 8, 1) }),
      // Perdido antes de existir `lostAt`: cuenta por su última edición.
      lead({ stage: 'lost', updatedAt: new Date(2026, 9, 20), createdAt: new Date(2026, 8, 1) }),
    ];
    const r = weekReport(leads, [], week, now);
    expect(r.created.length).toBe(3);
    expect(r.bySource).toEqual([
      { source: 'whatsapp', count: 2 },
      { source: 'referral', count: 1 },
    ]);
    expect(r.won.length).toBe(1);
    expect(r.wonTotal).toBe(1000);
    expect(r.lost.length).toBe(2);
  });

  it('marca vencidos, sin próxima acción, quietos y los próximos 7 días', () => {
    const leads = [
      lead({ id: 'a', stage: 'proposal', createdAt: new Date(2026, 8, 1), lastContactAt: new Date(2026, 9, 1), nextFollowUpAt: new Date(2026, 9, 27) }),
      lead({ id: 'b', stage: 'qualified', createdAt: new Date(2026, 9, 20) }),
      lead({ id: 'c', stage: 'won', createdAt: new Date(2026, 8, 1) }),
    ];
    const pending = [fu(new Date(2026, 9, 23, 10)), fu(new Date(2026, 9, 26, 9)), fu(new Date(2026, 9, 26, 16)), fu(new Date(2026, 10, 1, 9))];
    const r = weekReport(leads, pending, week, now);
    expect(r.overdue.length).toBe(1);
    expect(r.orphans.map((l) => l.id)).toEqual(['b']);
    expect(r.stalled.map((s) => [s.lead.id, s.days])).toEqual([['a', 24]]);
    expect(r.upcoming.map((d) => d.count)).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});

describe('mis números', () => {
  it('compara con el periodo anterior y reparte lo abierto por etapa', () => {
    const range = periodRange('month', now);
    const leads = [
      lead({ stage: 'won', value: 3000, wonAt: new Date(2026, 9, 5), tier: 'silver' }),
      lead({ stage: 'won', value: 1000, wonAt: new Date(2026, 9, 9), tier: 'bronze' }),
      lead({ stage: 'won', value: 2000, wonAt: new Date(2026, 8, 9) }),
      lead({ stage: 'proposal', value: 800, nextFollowUpAt: new Date(2026, 9, 27) }),
      lead({ stage: 'proposal', value: 200 }),
    ];
    const n = myNumbers(leads, range, previousRange('month', range));
    expect(n.wonCount).toBe(2);
    expect(n.wonTotal).toBe(4000);
    expect(n.change).toBe(100);
    expect(n.open.find((s) => s.stage === 'proposal')).toEqual({ stage: 'proposal', count: 2, value: 1000 });
    expect(n.openValue).toBe(1000);
    expect(n.tiers).toEqual([
      { tier: 'bronze', count: 1 },
      { tier: 'silver', count: 1 },
      { tier: 'gold', count: 0 },
    ]);
    expect(n.orphans).toBe(1);
  });

  it('sin ventas en el periodo anterior no inventa un porcentaje', () => {
    const range = periodRange('week', now);
    const n = myNumbers([lead({ stage: 'won', value: 10, wonAt: new Date(2026, 9, 20) })], range, previousRange('week', range));
    expect(n.change).toBeNull();
  });

  it('un follow-up hecho el mismo día cuenta a tiempo; al día siguiente, tarde', () => {
    const due = new Date(2026, 9, 20, 9);
    expect(
      followUpScore([
        { dueAt: due, completedAt: new Date(2026, 9, 20, 19) },
        { dueAt: due, completedAt: new Date(2026, 9, 19, 12) },
        { dueAt: due, completedAt: new Date(2026, 9, 21, 8) },
      ]),
    ).toEqual({ onTime: 2, late: 1 });
  });
});
