import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { email, form, minLength, required, schema, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { InvitationsService } from '../../../core/invitations/invitations.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { Button } from '../../../shared/components/button/button';
import { IconCheck, IconLock, IconMail } from '../../../shared/icons/icons';

type AuthMode = 'signIn' | 'signUp';

interface EmailFormModel {
  email: string;
  password: string;
}

/** Mensajes se derivan del `kind` del error en el template (bilingüe), no del `message` del schema. */
const emailFormSchema = schema<EmailFormModel>((p) => {
  required(p.email);
  email(p.email);
  required(p.password);
  minLength(p.password, 6);
});

/**
 * El login con Google es un redirect (ver AuthService.signInWithGoogle):
 * la página se recarga entera al volver, así que un código tipeado a mano
 * en `manualCode` (a diferencia del de la URL /invite/:code, que sí
 * sobrevive por estar en el path) se perdería si no se guarda acá antes
 * de salir.
 */
const PENDING_INVITE_CODE_KEY = 'icep-pending-invite-code';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [Button, IconMail, IconLock, IconCheck],
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

  private readonly modeOverride = signal<AuthMode | null>(null);
  protected readonly mode = computed<AuthMode>(
    () => this.modeOverride() ?? (this.code() ? 'signUp' : 'signIn'),
  );

  protected readonly manualCode = signal('');

  private readonly emailModel = signal<EmailFormModel>({ email: '', password: '' });
  protected readonly emailForm = form(this.emailModel, emailFormSchema);

  protected readonly signingInGoogle = signal(false);
  protected readonly submittingEmail = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly emailFieldError = computed(() => {
    const field = this.emailForm.email();
    if (!field.touched() || !field.invalid()) {
      return null;
    }
    return field.errors().some((e) => e.kind === 'email')
      ? this.i18n.t('login', 'emailInvalid')
      : this.i18n.t('login', 'emailRequired');
  });

  protected readonly passwordFieldError = computed(() => {
    const field = this.emailForm.password();
    if (!field.touched() || !field.invalid()) {
      return null;
    }
    return field.errors().some((e) => e.kind === 'minLength')
      ? this.i18n.t('login', 'passwordTooShort')
      : this.i18n.t('login', 'passwordRequired');
  });

  constructor() {
    void this.checkGoogleRedirectResult();
  }

  protected setMode(mode: AuthMode): void {
    this.modeOverride.set(mode);
    this.errorMessage.set(null);
  }

  /** Se llama una vez al cargar: recoge el resultado si esta carga es la vuelta de un redirect de Google. */
  private async checkGoogleRedirectResult(): Promise<void> {
    try {
      const credential = await this.auth.consumeGoogleRedirectResult();
      if (!credential) {
        return;
      }
      this.signingInGoogle.set(true);
      try {
        const storedCode = sessionStorage.getItem(PENDING_INVITE_CODE_KEY);
        sessionStorage.removeItem(PENDING_INVITE_CODE_KEY);
        if (storedCode) {
          this.manualCode.set(storedCode);
        }
      } catch {
        // Ignorar si sessionStorage no está disponible.
      }
      await this.afterAuth(credential.user);
    } catch {
      this.errorMessage.set(this.i18n.t('login', 'errorGeneric'));
    } finally {
      this.signingInGoogle.set(false);
    }
  }

  protected async onGoogleSignIn(): Promise<void> {
    this.signingInGoogle.set(true);
    this.errorMessage.set(null);
    try {
      sessionStorage.setItem(PENDING_INVITE_CODE_KEY, this.manualCode().trim());
    } catch {
      // Ignorar si sessionStorage no está disponible.
    }
    try {
      await this.auth.signInWithGoogle();
    } catch {
      this.errorMessage.set(this.i18n.t('login', 'errorGeneric'));
      this.signingInGoogle.set(false);
    }
  }

  protected async onEmailSubmit(): Promise<void> {
    this.errorMessage.set(null);
    await submit(this.emailForm, async () => {
      this.submittingEmail.set(true);
      const { email: emailValue, password } = this.emailModel();
      try {
        const credential =
          this.mode() === 'signUp'
            ? await this.auth.signUpWithEmail(emailValue, password)
            : await this.auth.signInWithEmail(emailValue, password);
        await this.afterAuth(credential.user);
      } catch (error) {
        this.errorMessage.set(this.mapAuthError((error as { code?: string }).code));
      } finally {
        this.submittingEmail.set(false);
      }
      return undefined;
    });
  }

  /** Común a Google y email/password: si ya existe perfil, entra directo; si no, intenta canjear la invitación. */
  private async afterAuth(user: User): Promise<void> {
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
  }

  private mapAuthError(code: string | undefined): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return this.i18n.t('login', 'errorEmailInUse');
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return this.i18n.t('login', 'errorInvalidCredential');
      case 'auth/weak-password':
        return this.i18n.t('login', 'errorWeakPassword');
      default:
        return this.i18n.t('login', 'errorGeneric');
    }
  }
}
