import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Button } from '../../../shared/components/button/button';

/**
 * Pantalla para usuarios cuyo status es "rejected". Es lo que ven cada vez
 * que vuelven a loguearse con Google (no hay un "registro" separado que
 * puedan reintentar): tienen que hablar con el admin del sistema.
 */
@Component({
  selector: 'app-rejected',
  standalone: true,
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div
        class="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center shadow-sm"
      >
        <h1 class="text-xl font-semibold text-status-expired">Solicitud rechazada</h1>
        <p class="mt-2 text-sm text-text-muted">
          Tu solicitud de acceso fue rechazada. Comunicate con el administrador del sistema si creés
          que es un error.
        </p>
        <app-button class="mt-6 inline-block" variant="secondary" (pressed)="onSignOut()">
          Cerrar sesión
        </app-button>
      </div>
    </main>
  `,
})
export class Rejected {
  private readonly auth = inject(AuthService);

  protected onSignOut(): void {
    void this.auth.signOut();
  }
}
