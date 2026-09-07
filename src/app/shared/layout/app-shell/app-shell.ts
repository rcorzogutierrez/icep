import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { IconBookOpen, IconLayoutDashboard, IconUserPlus, IconUsers } from '../../icons/icons';

/**
 * Shell persistente de la app logueada: sidebar de navegación + barra
 * superior, con el contenido de cada ruta hijo en el <router-outlet>. Ver
 * app.routes.ts — dashboard/invitations/admin/* son hijas de esta ruta.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IconLayoutDashboard,
    IconUserPlus,
    IconBookOpen,
    IconUsers,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected async onSignOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
