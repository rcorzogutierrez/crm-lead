import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideBookOpen } from '@lucide/angular';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [LucideBookOpen],
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section class="leather relative hidden flex-col justify-between p-12 text-leather-ink lg:flex">
        <div class="flex items-center gap-2.5">
          <svg lucideBookOpen [size]="22" [strokeWidth]="1.75"></svg>
          <span class="date-face text-xl font-bold">Agenda</span>
        </div>
        <div>
          <p class="date-face max-w-[16ch] text-[2.75rem] leading-[1.05] font-bold">Ningún lead se queda sin próxima acción.</p>
          <p class="mt-4 max-w-[42ch] text-leather-muted">Captura en segundos, revisa tu día como una página de agenda y deja cada contacto con su siguiente paso.</p>
        </div>
        <p class="text-sm text-leather-muted">CRM de leads y follow-up para el equipo</p>
      </section>

      <section class="flex items-center justify-center px-6 py-16">
        <div class="w-full max-w-sm">
          <div class="flex items-center gap-2.5 text-ink lg:hidden">
            <svg lucideBookOpen [size]="22" [strokeWidth]="1.75"></svg>
            <span class="date-face text-xl font-bold">Agenda</span>
          </div>
          <h1 class="date-face mt-8 text-[2rem] font-bold lg:mt-0">Entrar</h1>
          <p class="mt-2 text-ink-2">Usa la cuenta de Google con la que te invitaron al equipo.</p>
          <button type="button" class="btn-secondary mt-8 h-11 w-full text-[0.9375rem]" [disabled]="busy()" (click)="signIn()">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            {{ busy() ? 'Abriendo Google…' : 'Continuar con Google' }}
          </button>
          @if (auth.error(); as err) {
            <p class="mt-4 rounded-lg bg-ribbon-soft px-3 py-2 text-sm font-medium text-ribbon" role="alert">{{ err }}</p>
          }
          <p class="mt-8 text-xs text-ink-3">La primera persona en entrar crea el equipo y queda como admin.</p>
        </div>
      </section>
    </div>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/hoy');
      if (s === 'pending') void this.router.navigateByUrl('/acceso-pendiente');
    });
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    await this.auth.signInWithGoogle();
    this.busy.set(false);
  }
}
