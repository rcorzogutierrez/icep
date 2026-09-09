import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { InvitationsService } from '../../../core/invitations/invitations.service';
import { Button } from '../../../shared/components/button/button';

/**
 * Pantalla para usuarios autenticados sin perfil (nunca canjearon una
 * invitación). Permite intentar validar un código a mano, por si llegaron
 * acá en vez de por el link /invite/:code.
 */
@Component({
  selector: 'app-no-invitation',
  standalone: true,
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div
        class="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm"
      >
        <h1 class="text-xl font-semibold text-text">{{ i18n.t('noInvitation', 'title') }}</h1>
        <p class="mt-2 text-sm text-text-muted">{{ i18n.t('noInvitation', 'body') }}</p>

        <div class="mt-6 text-left">
          <label for="invitation-code" class="text-sm font-medium text-text">{{
            i18n.t('noInvitation', 'haveCode')
          }}</label>
          <input
            id="invitation-code"
            type="text"
            class="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm uppercase text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            [placeholder]="i18n.t('noInvitation', 'codePlaceholder')"
            [value]="code()"
            (input)="code.set($any($event.target).value)"
          />
          @if (error()) {
            <p class="mt-2 text-sm text-status-expired">{{ i18n.t('noInvitation', 'error') }}</p>
          }
          <app-button
            class="mt-3 block"
            [fullWidth]="true"
            [loading]="submitting()"
            (pressed)="onSubmit()"
          >
            {{ i18n.t('noInvitation', 'submit') }}
          </app-button>
        </div>

        <app-button class="mt-4 inline-block" variant="ghost" (pressed)="onSignOut()">
          {{ i18n.t('common', 'signOut') }}
        </app-button>
      </div>
    </main>
  `,
})
export class NoInvitation {
  private readonly auth = inject(AuthService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected readonly code = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal(false);

  protected async onSubmit(): Promise<void> {
    const user = this.auth.user();
    const trimmed = this.code().trim().toUpperCase();
    if (!user || !trimmed) {
      return;
    }

    this.submitting.set(true);
    this.error.set(false);
    try {
      const redeemed = await this.invitationsService.redeemAndCreateProfile(
        trimmed,
        user,
        this.i18n.locale(),
      );
      if (redeemed) {
        await this.router.navigateByUrl('/dashboard');
      } else {
        this.error.set(true);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }
}
