import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import type {
  InvitableRole,
  Invitation,
  InvitationStatus,
} from '../../core/invitations/invitations.model';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { Select, type SelectOption } from '../../shared/components/select/select';
import { IconInfo } from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

const STATUS_CLASS: Record<InvitationStatus, string> = {
  pending: 'text-status-paused',
  used: 'text-status-active',
  revoked: 'text-status-expired',
};
/** Una "pending" vencida se muestra igual que "revoked": ya no se puede canjear. */
const EXPIRED_CLASS = STATUS_CLASS.revoked;

/** Pantalla de admin/profesor: generar invitaciones y gestionar las existentes. */
@Component({
  selector: 'app-invitations',
  standalone: true,
  imports: [Button, Select, DatePipe, RouterLink, IconInfo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitations.html',
})
export class Invitations {
  protected readonly invitationsService = inject(InvitationsService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly usersService = inject(UsersService);
  private readonly toast = inject(ToastService);

  /** true si es "pending" y ya pasó su expiresAt — no se puede canjear aunque el status siga "pending" (ver firestore.rules). */
  protected isExpired(invitation: Invitation): boolean {
    return (
      invitation.status === 'pending' &&
      invitation.expiresAt != null &&
      invitation.expiresAt.toMillis() < Date.now()
    );
  }

  protected statusClassFor(invitation: Invitation): string {
    return this.isExpired(invitation) ? EXPIRED_CLASS : STATUS_CLASS[invitation.status];
  }

  protected readonly roleOptions = computed<SelectOption<InvitableRole>[]>(() => [
    { value: 'student', label: this.i18n.t('invitationsPage', 'roleStudent') },
    {
      value: 'teacher',
      label: this.i18n.t('invitationsPage', 'roleTeacher'),
      disabled: !this.userProfileService.isAdmin(),
    },
  ]);

  protected readonly email = signal('');
  protected readonly role = signal<InvitableRole>('student');
  protected readonly creating = signal(false);
  protected readonly createdCode = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly revokingCode = signal<string | null>(null);
  protected readonly resendingCode = signal<string | null>(null);
  protected readonly removingCode = signal<string | null>(null);

  protected readonly editingCode = signal<string | null>(null);
  protected readonly editEmail = signal('');
  protected readonly savingEdit = signal(false);

  protected statusLabel(invitation: Invitation): string {
    if (this.isExpired(invitation)) {
      return this.i18n.t('invitationsPage', 'statusExpired');
    }
    switch (invitation.status) {
      case 'pending':
        return this.i18n.t('invitationsPage', 'statusPending');
      case 'used':
        return this.i18n.t('invitationsPage', 'statusUsed');
      case 'revoked':
        return this.i18n.t('invitationsPage', 'statusRevoked');
    }
  }

  protected inviteLink(code: string): string {
    return `${location.origin}/invite/${code}`;
  }

  /** Ya existe una cuenta con ese email (comparación case-insensitive). */
  private isEmailRegistered(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    return this.usersService.users().some((user) => user.email?.toLowerCase() === normalized);
  }

  protected async onCreate(): Promise<void> {
    if (!this.email().trim()) {
      return;
    }
    if (this.isEmailRegistered(this.email())) {
      this.toast.error(this.i18n.t('invitationsPage', 'emailAlreadyRegistered'));
      return;
    }
    this.creating.set(true);
    this.copied.set(false);
    try {
      const code = await this.invitationsService.create(this.email(), this.role(), []);
      this.createdCode.set(code);
      this.email.set('');
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async onCopy(code: string): Promise<void> {
    await navigator.clipboard.writeText(this.inviteLink(code));
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async onRevoke(invitation: Invitation): Promise<void> {
    this.revokingCode.set(invitation.code);
    try {
      await this.invitationsService.revoke(invitation.code);
      this.toast.success(this.i18n.t('invitationsPage', 'revoked'));
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.revokingCode.set(null);
    }
  }

  /** Pendiente y vigente: solo vuelve a mostrar el mismo link para copiar. Revocada o vencida: genera una invitación nueva (código y expiresAt nuevos) con los mismos datos. */
  protected async onResend(invitation: Invitation): Promise<void> {
    if (invitation.status === 'pending' && !this.isExpired(invitation)) {
      this.createdCode.set(invitation.code);
      this.copied.set(false);
      return;
    }

    this.resendingCode.set(invitation.code);
    try {
      const code = await this.invitationsService.create(
        invitation.email,
        invitation.role,
        invitation.subjectIds,
      );
      this.createdCode.set(code);
      this.copied.set(false);
      this.toast.success(this.i18n.t('invitationsPage', 'resent'));
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.resendingCode.set(null);
    }
  }

  protected startEdit(invitation: Invitation): void {
    this.editingCode.set(invitation.code);
    this.editEmail.set(invitation.email);
  }

  protected cancelEdit(): void {
    this.editingCode.set(null);
  }

  protected async saveEdit(invitation: Invitation): Promise<void> {
    if (!this.editEmail().trim()) {
      return;
    }
    if (this.isEmailRegistered(this.editEmail())) {
      this.toast.error(this.i18n.t('invitationsPage', 'emailAlreadyRegistered'));
      return;
    }
    this.savingEdit.set(true);
    try {
      await this.invitationsService.updateEmail(invitation.code, this.editEmail());
      this.editingCode.set(null);
      this.toast.success(this.i18n.t('invitationsPage', 'updated'));
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected async onRemove(invitation: Invitation): Promise<void> {
    this.removingCode.set(invitation.code);
    try {
      await this.invitationsService.remove(invitation.code);
      this.toast.success(this.i18n.t('invitationsPage', 'deleted'));
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.removingCode.set(null);
    }
  }
}
