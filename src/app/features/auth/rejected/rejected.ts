import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { Button } from '../../../shared/components/button/button';

/** Pantalla para usuarios a los que un admin les revocó el acceso. */
@Component({
  selector: 'app-rejected',
  standalone: true,
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div
        class="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm"
      >
        <h1 class="text-xl font-semibold text-status-expired">{{ i18n.t('rejected', 'title') }}</h1>
        <p class="mt-2 text-sm text-text-muted">{{ i18n.t('rejected', 'body') }}</p>
        <app-button class="mt-6 inline-block" variant="secondary" (pressed)="onSignOut()">
          {{ i18n.t('common', 'signOut') }}
        </app-button>
      </div>
    </main>
  `,
})
export class Rejected {
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected onSignOut(): void {
    void this.auth.signOut();
  }
}
