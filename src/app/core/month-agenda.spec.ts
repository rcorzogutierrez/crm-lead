import { FollowUp } from './models';
import { monthAgenda, monthRange } from './month-agenda';

function fu(dueAt: Date, p: Partial<FollowUp> = {}): FollowUp {
  return {
    id: 'f',
    leadId: 'l',
    leadName: '',
    company: '',
    assigneeId: 'u1',
    dueAt,
    channel: 'call',
    note: '',
    status: 'pending',
    createdBy: 'u1',
    completedAt: null,
    ...p,
  };
}

// Miércoles 28 de octubre de 2026, 10:00.
const now = new Date(2026, 9, 28, 10, 0);
const october = new Date(2026, 9, 1);

describe('agenda del mes', () => {
  it('cubre semanas completas de lunes a domingo', () => {
    // El 1 de octubre de 2026 es jueves y el 31, sábado.
    expect(monthRange(october)).toEqual({
      start: new Date(2026, 8, 28),
      end: new Date(2026, 10, 2),
    });
    expect(monthAgenda(october, [], [], now).days.length).toBe(35);
  });

  it('cuenta por canal pendientes y hechos, y marca las vencidas solo en días pasados', () => {
    const pending = [
      fu(new Date(2026, 9, 26, 9), { channel: 'email' }),
      fu(new Date(2026, 9, 26, 11)),
      fu(new Date(2026, 9, 28, 15), { channel: 'whatsapp' }),
      fu(new Date(2026, 9, 30, 9)),
    ];
    const done = [fu(new Date(2026, 9, 26, 8), { status: 'done' })];
    const m = monthAgenda(october, pending, done, now);
    const day = (n: number) => m.days.find((d) => d.inMonth && d.date.getDate() === n)!;

    expect(day(26).counts).toEqual([
      { channel: 'call', n: 2 },
      { channel: 'email', n: 1 },
    ]);
    expect(day(26)).toMatchObject({ total: 3, done: 1, late: 2, isPast: true });
    expect(day(28)).toMatchObject({ total: 1, late: 0, isToday: true });
    expect(day(30).late).toBe(0);
    expect(m).toMatchObject({ total: 5, done: 1, late: 2 });
    expect(m.peak?.key).toBe('2026-10-26');
    expect(day(26).load).toBe(100);
  });

  it('marca como cargado el día que dobla la media del mes (y tiene al menos 5)', () => {
    const pending = [
      ...Array.from({ length: 8 }, (_, i) => fu(new Date(2026, 9, 29, 8 + i))),
      fu(new Date(2026, 9, 30, 9)),
      fu(new Date(2026, 9, 31, 9)),
    ];
    const m = monthAgenda(october, pending, [], now);
    expect(m.days.filter((d) => d.heavy).map((d) => d.key)).toEqual(['2026-10-29']);
  });

  it('un mes vacío no tiene día pico', () => {
    expect(monthAgenda(october, [], [], now).peak).toBeNull();
  });
});
