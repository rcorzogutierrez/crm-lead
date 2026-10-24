import { agoLabel, dayDiff, dueLabel, dueState, presetDate } from './core/dates';
import { setLang, t } from './core/i18n/i18n';

describe('fechas de agenda', () => {
  const now = new Date(2026, 9, 23, 10, 30); // viernes 23 oct 2026

  it('clasifica la urgencia de un follow-up', () => {
    expect(dueState(new Date(2026, 9, 21, 9), now)).toBe('overdue');
    expect(dueState(new Date(2026, 9, 23, 18), now)).toBe('today');
    expect(dueState(new Date(2026, 9, 26, 9), now)).toBe('soon');
    expect(dueState(null, now)).toBe('none');
  });

  it('etiqueta fechas relativas en español', () => {
    setLang('es');
    expect(dueLabel(new Date(2026, 9, 20, 9), now)).toBe('Vencido 3 d');
    expect(dueLabel(new Date(2026, 9, 22, 9), now)).toBe('Venció ayer');
    expect(dueLabel(new Date(2026, 9, 23, 9), now)).toBe('Hoy');
    expect(dueLabel(new Date(2026, 9, 24, 9), now)).toBe('Mañana');
  });

  it('el atajo "próxima semana" cae en lunes a las 9:00', () => {
    const d = presetDate('nextWeek', now);
    expect(d.getDay()).toBe(1);
    expect(d.getHours()).toBe(9);
    expect(dayDiff(now, d)).toBe(3);
  });

  it('cambia las etiquetas al pasar a inglés', () => {
    setLang('en');
    expect(dueLabel(new Date(2026, 9, 20, 9), now)).toBe('3d overdue');
    expect(dueLabel(new Date(2026, 9, 24, 9), now)).toBe('Tomorrow');
    expect(agoLabel(new Date(2026, 9, 21, 10, 30), now)).toBe('2d ago');
    expect(t('today.sum.today', { n: 4 })).toBe('4 for today');
    setLang('es');
    expect(t('today.sum.today', { n: 4 })).toBe('4 para hoy');
  });
});
