import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { statsPatch } from './core/contact-stats';
import { LEGACY_ROUTES, legacyParamsGuard } from './core/legacy-urls';
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

describe('resumen de compras del contacto', () => {
  const inc = (v: unknown) => (v as { _operand?: number })?._operand ?? JSON.stringify(v);

  it('al crear un lead abierto suma un negocio abierto a su responsable', () => {
    const p = statsPatch(null, { stage: 'new', value: 100, assigneeId: 'ana' }, false);
    expect(Object.keys(p)).toEqual(['openBy.ana']);
    expect(inc(p['openBy.ana'])).toBe(1);
  });

  it('al ganar pasa de abierto a comprado y fija la primera compra', () => {
    const p = statsPatch({ stage: 'proposal', value: 100, assigneeId: 'ana' }, { stage: 'won', value: 100, assigneeId: 'ana' }, true);
    expect(inc(p['openBy.ana'])).toBe(-1);
    expect(inc(p['wonCount'])).toBe(1);
    expect(inc(p['wonTotal'])).toBe(100);
    expect(p['firstWonAt']).toBeDefined();
  });

  it('al reasignar mueve el negocio abierto de un vendedor a otro', () => {
    const p = statsPatch({ stage: 'new', value: 0, assigneeId: 'ana' }, { stage: 'new', value: 0, assigneeId: 'luis' }, false);
    expect(inc(p['openBy.ana'])).toBe(-1);
    expect(inc(p['openBy.luis'])).toBe(1);
    expect(p['wonCount']).toBeUndefined();
  });

  it('un cambio sin efecto no toca el contacto', () => {
    expect(statsPatch({ stage: 'new', value: 0, assigneeId: 'ana' }, { stage: 'contacted', value: 0, assigneeId: 'ana' }, false)).toEqual({});
  });
});

describe('URLs antiguas en español', () => {
  @Component({ template: '' })
  class Blank {}

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          ...LEGACY_ROUTES,
          { path: 'today', component: Blank },
          { path: 'contacts', component: Blank, canActivate: [legacyParamsGuard] },
          { path: 'contacts/:id', component: Blank },
          { path: 'leads', component: Blank, canActivate: [legacyParamsGuard] },
        ]),
      ],
    });
  });

  const navigate = async (url: string) => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  it('redirige las rutas viejas a las nuevas', async () => {
    expect(await navigate('/hoy')).toBe('/today');
    expect(await navigate('/clientes/abc')).toBe('/contacts/abc');
  });

  it('traduce los filtros guardados en la URL', async () => {
    expect(await navigate('/leads?filtro=sin-accion&responsable=yo&buscar=ana')).toBe('/leads?filter=no-action&assignee=me&search=ana');
    expect(await navigate('/clientes?tipo=prospectos')).toBe('/contacts?type=prospects');
  });
});
