import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { presetDate } from '../core/dates';
import { WhenPicker } from './when-picker';

@Component({
  imports: [WhenPicker],
  template: `<app-when-picker [(value)]="when" />`,
})
class Host {
  readonly when = signal(presetDate('in3', new Date()));
}

describe('selector de fecha de la próxima acción', () => {
  const checked = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent?.trim());

  it('marca el atajo que corresponde a la fecha recibida', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(checked(fixture.nativeElement)).toEqual(['En 3 días']);
  });

  it('sigue a la fecha cuando el padre la cambia (al reabrir la captura)', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.when.set(presetDate('tomorrow', new Date()));
    await fixture.whenStable();
    expect(checked(fixture.nativeElement)).toEqual(['Mañana']);
  });

  it('una fecha que no es de ningún atajo queda en "Otra fecha"', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const d = presetDate('tomorrow', new Date());
    d.setHours(15, 30);
    fixture.componentInstance.when.set(d);
    await fixture.whenStable();
    expect(checked(fixture.nativeElement)).toEqual(['Otra fecha']);
    expect(fixture.nativeElement.querySelector('input[type="datetime-local"]')).not.toBeNull();
  });
});
