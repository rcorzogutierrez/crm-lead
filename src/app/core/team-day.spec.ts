import { FollowUp, Lead, Member } from './models';
import { teamDay } from './team-day';

function fu(dueAt: Date, assigneeId: string, p: Partial<FollowUp> = {}): FollowUp {
  return { id: 'f', leadId: 'l', leadName: '', company: '', assigneeId, dueAt, channel: 'call', note: '', status: 'pending', createdBy: assigneeId, completedAt: null, ...p };
}

function member(uid: string, displayName: string, active = true): Member {
  return { uid, email: `${uid}@x.com`, displayName, photoURL: null, role: 'member', active };
}

function lead(p: Partial<Lead>): Lead {
  return { stage: 'new', value: 0, assigneeId: 'a', nextFollowUpAt: null, wonAt: null, updatedAt: null, createdAt: null, ...p } as Lead;
}

// Miércoles 28 de octubre de 2026, 10:00.
const now = new Date(2026, 9, 28, 10, 0);

describe('el día del equipo', () => {
  it('cuenta por vendedor lo hecho hoy, lo vencido, lo que no tiene próxima acción y las ventas de hoy', () => {
    const rows = teamDay(
      [member('a', 'Laura'), member('b', 'Diego'), member('c', 'Ex', false)],
      [fu(new Date(2026, 9, 28, 15), 'a'), fu(new Date(2026, 9, 26, 9), 'b'), fu(new Date(2026, 9, 27, 9), 'b'), fu(new Date(2026, 9, 29, 9), 'a')],
      [fu(new Date(2026, 9, 28, 8), 'a', { status: 'done' }), fu(new Date(2026, 9, 28, 9), 'a', { status: 'done' })],
      [
        lead({ assigneeId: 'b', stage: 'qualified' }),
        lead({ assigneeId: 'a', stage: 'proposal', nextFollowUpAt: new Date(2026, 9, 28, 15) }),
        lead({ assigneeId: 'a', stage: 'won', value: 1200, wonAt: new Date(2026, 9, 28, 9) }),
        lead({ assigneeId: 'a', stage: 'won', value: 900, wonAt: new Date(2026, 9, 20) }),
      ],
      now,
    );
    expect(rows.map((r) => r.name)).toEqual(['Diego', 'Laura']);
    expect(rows[1]).toMatchObject({ done: 2, planned: 3, overdue: 0, orphans: 0, wonCount: 1, wonTotal: 1200 });
    expect(rows[0]).toMatchObject({ done: 0, planned: 0, overdue: 2, orphans: 1, wonCount: 0 });
  });

  it('incluye a quien ya no está activo si todavía tiene algo pendiente', () => {
    const rows = teamDay([member('c', 'Ex', false)], [fu(new Date(2026, 9, 27, 9), 'c')], [], [], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].overdue).toBe(1);
  });
});
