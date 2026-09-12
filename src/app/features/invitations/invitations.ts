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
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { Select, type SelectOption } from '../../shared/components/select/select';
import { Page } from '../../shared/layout/page/page';
import { PageHeader } from '../../shared/layout/page-header/page-header';
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
  imports: [Button, ConfirmDialog, Select, DatePipe, RouterLink, Page, PageHeader, IconInfo],
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
  protected readonly confirmingRemoveInvitation = signal<Invitation | null>(null);

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

  /** Quién generó esta invitación — solo se muestra al admin (ve las de todos); un profesor ya sabe que son todas suyas. */
  protected createdByLabel(invitation: Invitation): string {
    const creator = this.usersService.users().find((u) => u.uid === invitation.createdBy);
    return creator?.displayName ?? creator?.email ?? invitation.createdBy;
  }

  /** Ya existe una cuenta con ese email (comparación case-insensitive). */
  private isEmailRegistered(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    return this.usersService.users().some((user) => user.email?.toLowerCase() === normalized);
  }

  /**
   * Ya hay una invitación pendiente y vigente para ese email (comparación
   * case-insensitive) — sin este chequeo, nada impedía crear dos
   * invitaciones activas para la misma persona con solo tipear el email de
   * nuevo en el form. Para reinvitar ya existe "Reenviar" en la fila
   * existente (reusa el link si sigue vigente, genera uno nuevo solo si
   * venció/fue revocado), así que un duplicado acá nunca es necesario.
   */
  private isEmailAlreadyInvited(email: string, excludeCode?: string): boolean {
    const normalized = email.trim().toLowerCase();
    return this.invitationsService
      .invitations()
      .some(
        (invitation) =>
          invitation.code !== excludeCode &&
          invitation.status === 'pending' &&
          !this.isExpired(invitation) &&
          invitation.email.toLowerCase() === normalized,
      );
  }

  protected async onCreate(): Promise<void> {
    if (!this.email().trim()) {
      return;
    }
    if (this.isEmailRegistered(this.email())) {
      this.toast.error(this.i18n.t('invitationsPage', 'emailAlreadyRegistered'));
      return;
    }
    if (this.isEmailAlreadyInvited(this.email())) {
      this.toast.error(this.i18n.t('invitationsPage', 'emailAlreadyInvited'));
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
      this.clearCreatedCardIfMatches(invitation.code);
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.revokingCode.set(null);
    }
  }

  /**
   * La tarjeta de "Invitación creada, compartí este link" de arriba no se
   * actualiza sola con lo que pasa en la tabla: si esa misma invitación se
   * borra o se revoca, hay que ocultarla a mano — si no, queda mostrando un
   * link que ya no sirve, como si nada hubiera pasado.
   */
  private clearCreatedCardIfMatches(code: string): void {
    if (this.createdCode() === code) {
      this.createdCode.set(null);
      this.copied.set(false);
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
    if (this.isEmailAlreadyInvited(this.editEmail(), invitation.code)) {
      this.toast.error(this.i18n.t('invitationsPage', 'emailAlreadyInvited'));
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
      this.clearCreatedCardIfMatches(invitation.code);
    } catch {
      this.toast.error(this.i18n.t('invitationsPage', 'errorGeneric'));
    } finally {
      this.removingCode.set(null);
    }
  }
}
