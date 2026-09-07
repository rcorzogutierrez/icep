import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { InvitationsService } from '../../../core/invitations/invitations.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
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
  private readonly userProfileService = inject(UserProfileService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  /** Código de invitación de la URL (/invite/:code), vía withComponentInputBinding. */
  readonly code = input<string | undefined>(undefined);

  protected readonly showManualCode = signal(false);
  protected readonly manualCode = signal('');

  protected readonly highlights = computed(() => [
    this.i18n.t('login', 'highlight1'),
    this.i18n.t('login', 'highlight2'),
    this.i18n.t('login', 'highlight3'),
  ]);

  protected readonly signingIn = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async onSignIn(): Promise<void> {
    this.signingIn.set(true);
    this.errorMessage.set(null);
    try {
      const credential = await this.auth.signInWithGoogle();
      const user = credential.user;

      const existingProfile = await this.userProfileService.fetchOnce(user.uid);
      if (existingProfile) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }

      const inviteCode = (this.code() ?? this.manualCode()).trim().toUpperCase();
      if (!inviteCode) {
        await this.router.navigateByUrl('/no-invitation');
        return;
      }

      const redeemed = await this.invitationsService.redeemAndCreateProfile(
        inviteCode,
        user,
        this.i18n.locale(),
      );
      await this.router.navigateByUrl(redeemed ? '/dashboard' : '/no-invitation');
    } catch (error) {
      // El usuario puede cerrar el popup sin elegir cuenta; no es un error real.
      if ((error as { code?: string }).code !== 'auth/popup-closed-by-user') {
        this.errorMessage.set(this.i18n.t('login', 'errorGeneric'));
      }
    } finally {
      this.signingIn.set(false);
    }
  }
}
