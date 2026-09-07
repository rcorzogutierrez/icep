import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { Button } from '../../../shared/components/button/button';

/** Pantalla para usuarios logueados cuyo status todavía es "pending". */
@Component({
  selector: 'app-pending',
  standalone: true,
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div
        class="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center shadow-sm"
      >
        <h1 class="text-xl font-semibold text-text">Cuenta pendiente de aprobación</h1>
        <p class="mt-2 text-sm text-text-muted">
          Ya te registraste. Un administrador tiene que aprobar tu acceso antes de que puedas
          entrar. Esta página se actualiza sola apenas te aprueben.
        </p>
        <app-button class="mt-6 inline-block" variant="secondary" (pressed)="onSignOut()">
          Cerrar sesión
        </app-button>
      </div>
    </main>
  `,
})
export class Pending {
  private readonly auth = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.userProfileService.status() === 'approved') {
        void this.router.navigateByUrl('/dashboard');
      }
    });
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }
}
