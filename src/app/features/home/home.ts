import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, required, schema, submit } from '@angular/forms/signals';
import { AuthService } from '../../core/auth/auth.service';
import { Button, type ButtonVariant } from '../../shared/components/button/button';
import { Select, type SelectOption } from '../../shared/components/select/select';

interface DemoFormModel {
  framework: string;
}

/** Signal Forms: reglas de validación declarativas, sin RxJS. */
const demoSchema = schema<DemoFormModel>((path) => {
  required(path.framework, { message: 'Elegí un framework antes de continuar.' });
});

/**
 * Página de inicio: sirve como prueba de que Tailwind 4 (tokens de marca),
 * Firebase (AuthService), lucide-angular, Angular Aria (Select) y Signal
 * Forms funcionan juntos en un mismo flujo.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [Button, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class Home {
  protected readonly auth = inject(AuthService);

  protected readonly buttonVariants: ButtonVariant[] = ['primary', 'secondary', 'danger', 'ghost'];

  protected readonly frameworkOptions: SelectOption<string>[] = [
    { value: 'angular', label: 'Angular' },
    { value: 'analog', label: 'Analog' },
    { value: 'qwik', label: 'Qwik (próximamente)', disabled: true },
  ];

  private readonly demoModel = signal<DemoFormModel>({ framework: '' });
  protected readonly demoForm = form(this.demoModel, demoSchema);

  protected readonly loadingDemo = signal(false);
  protected readonly submittedOk = signal(false);

  protected readonly signingIn = signal(false);

  protected async onSubmit(): Promise<void> {
    this.loadingDemo.set(true);
    const ok = await submit(this.demoForm, async () => undefined);
    this.loadingDemo.set(false);
    this.submittedOk.set(ok);
  }

  protected async onSignIn(): Promise<void> {
    this.signingIn.set(true);
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      // El usuario puede cerrar el popup de Google sin elegir cuenta
      // (auth/popup-closed-by-user); no es un error real de la app.
      if ((error as { code?: string }).code !== 'auth/popup-closed-by-user') {
        console.error('Error al iniciar sesión con Google', error);
      }
    } finally {
      this.signingIn.set(false);
    }
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }
}
