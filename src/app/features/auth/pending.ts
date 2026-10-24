import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-pending',
  template: `
    <div class="flex min-h-dvh items-center justify-center px-6 py-16">
      <div class="w-full max-w-md">
        <h1 class="date-face text-[2rem] font-bold">Falta tu invitación</h1>
        <p class="mt-3 text-ink-2">
          Entraste como <span class="font-semibold text-ink">{{ auth.user()?.email }}</span>, pero esa cuenta todavía no está en el equipo.
          Pídele a un admin que te invite con este email desde <span class="font-semibold text-ink">Equipo</span>.
        </p>
        <div class="mt-8 flex gap-2">
          <button type="button" class="btn-primary" [disabled]="checking()" (click)="recheck()">{{ checking() ? 'Comprobando…' : 'Ya me invitaron' }}</button>
          <button type="button" class="btn-ghost" (click)="signOut()">Usar otra cuenta</button>
        </div>
      </div>
    </div>
  `,
})
export class Pending {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly checking = signal(false);

  constructor() {
    effect(() => {
      const s = this.auth.status();
      if (s === 'member') void this.router.navigateByUrl('/hoy');
      if (s === 'signedOut') void this.router.navigateByUrl('/entrar');
    });
  }

  protected async recheck(): Promise<void> {
    this.checking.set(true);
    await this.auth.recheck();
    this.checking.set(false);
  }

  protected signOut(): void {
    void this.auth.signOut();
  }
}
