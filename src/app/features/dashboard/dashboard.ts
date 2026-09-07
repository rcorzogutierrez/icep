import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, required, schema, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserProfileService } from '../../core/users/user-profile.service';
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
 * Área logueada de la app (solo alcanzable con status "approved", ver
 * approvedGuard). El showcase de Button/Select/Signal Forms se mantiene acá
 * como prueba viva de que el stack funciona junto.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Button, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  private readonly router = inject(Router);

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

  protected async onSubmit(): Promise<void> {
    this.loadingDemo.set(true);
    const ok = await submit(this.demoForm, async () => undefined);
    this.loadingDemo.set(false);
    this.submittedOk.set(ok);
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }

  protected goToAdmin(): void {
    void this.router.navigateByUrl('/admin/users');
  }
}
