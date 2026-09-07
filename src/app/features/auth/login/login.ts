import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Button } from '../../../shared/components/button/button';
import { IconCheck } from '../../../shared/icons/icons';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [Button, IconCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly highlights = [
    'Autenticación con tu cuenta de Google, sin contraseñas nuevas',
    'Acceso aprobado por un administrador antes de entrar',
    'Panel de control en tiempo real, sin recargar la página',
  ];

  protected readonly signingIn = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async onSignIn(): Promise<void> {
    this.signingIn.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.signInWithGoogle();
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      // El usuario puede cerrar el popup sin elegir cuenta; no es un error real.
      if ((error as { code?: string }).code !== 'auth/popup-closed-by-user') {
        this.errorMessage.set('No pudimos iniciar sesión. Probá de nuevo.');
      }
    } finally {
      this.signingIn.set(false);
    }
  }
}
