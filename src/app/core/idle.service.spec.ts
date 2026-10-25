import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { IdleService } from './idle.service';

describe('cierre de sesión por inactividad', () => {
  const MIN = 60_000;
  let signOut: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let idle: IdleService;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    signOut = vi.fn(() => Promise.resolve());
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { signOut, status: signal('member') } },
        { provide: Router, useValue: { navigateByUrl: navigate } },
      ],
    });
    idle = TestBed.inject(IdleService);
    stop = idle.watch();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('avisa en el último minuto y cierra a los 10 minutos sin actividad', async () => {
    await vi.advanceTimersByTimeAsync(8 * MIN);
    expect(idle.remaining()).toBeNull();
    await vi.advanceTimersByTimeAsync(1.5 * MIN);
    expect(idle.remaining()).toBe(30);
    await vi.advanceTimersByTimeAsync(0.5 * MIN);
    expect(signOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(idle.endedByIdle()).toBe(true);
    expect(localStorage.getItem('crm-lead.lastActivity')).toBeNull();
  });

  it('la actividad reinicia el contador y quita el aviso', async () => {
    await vi.advanceTimersByTimeAsync(9.5 * MIN);
    expect(idle.remaining()).not.toBeNull();
    window.dispatchEvent(new Event('keydown'));
    expect(idle.remaining()).toBeNull();
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('cuenta la actividad de otra pestaña', async () => {
    await vi.advanceTimersByTimeAsync(9 * MIN);
    window.dispatchEvent(new StorageEvent('storage', { key: 'crm-lead.lastActivity', newValue: String(Date.now()) }));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('una actividad tras dormir el equipo no rescata la sesión caducada', () => {
    // Temporizadores congelados: el reloj avanza sin que corra el intervalo.
    vi.setSystemTime(Date.now() + 30 * MIN);
    window.dispatchEvent(new Event('pointerdown'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('cierra al abrir una sesión restaurada con la última actividad caducada', () => {
    stop();
    localStorage.setItem('crm-lead.lastActivity', String(Date.now() - 20 * MIN));
    stop = idle.watch();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
