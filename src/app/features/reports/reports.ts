import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { t } from '../../core/i18n/i18n';
import { MyNumbersView } from './my-numbers';
import { WeekReportView } from './week-report';

type View = 'week' | 'mine';

/**
 * Reportes. El admin abre en el informe de la semana del equipo y puede cambiar a sus
 * propios números; un vendedor solo ve los suyos (las reglas no le dejan leer los de otros).
 */
@Component({
  selector: 'app-reports',
  imports: [NgTemplateOutlet, WeekReportView, MyNumbersView],
  template: `
    <div class="page">
      @if (view() === 'week') {
        <app-week-report>
          <ng-container toggle>
            <ng-container *ngTemplateOutlet="toggle" />
          </ng-container>
        </app-week-report>
      } @else {
        <app-my-numbers>
          <ng-container toggle>
            <ng-container *ngTemplateOutlet="toggle" />
          </ng-container>
        </app-my-numbers>
      }
    </div>

    <ng-template #toggle>
      @if (auth.isAdmin()) {
        <div class="segmented" role="radiogroup" [attr.aria-label]="t('report.view')">
          <button type="button" role="radio" [attr.aria-checked]="view() === 'week'" (click)="setView('week')" class="segment">{{ t('report.view.week') }}</button>
          <button type="button" role="radio" [attr.aria-checked]="view() === 'mine'" (click)="setView('mine')" class="segment">{{ t('report.mine') }}</button>
        </div>
      }
    </ng-template>
  `,
})
export class Reports {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly t = t;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly view = computed<View>(() => (this.auth.isAdmin() && this.params().get('view') !== 'mine' ? 'week' : 'mine'));

  protected setView(view: View): void {
    // Cada vista tiene sus propios parámetros: al cambiar se descartan los de la otra.
    void this.router.navigate([], { relativeTo: this.route, queryParams: view === 'mine' ? { view } : {}, replaceUrl: true });
  }
}
