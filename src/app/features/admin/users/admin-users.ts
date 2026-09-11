import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import type { UserProfile, UserRole, UserStatus } from '../../../core/users/users.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';

/** Chip de estado relleno (fondo + texto), mismo patrón que el resto de la app. */
const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'bg-slate-100 text-status-paused',
  approved: 'bg-green-50 text-status-active',
  rejected: 'bg-red-50 text-status-expired',
};

/** Panel de admin: lista todos los usuarios y permite revocar/restaurar su acceso. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [Button, ConfirmDialog, Select, DatePipe, Page, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users.html',
})
export class AdminUsers {
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);

  protected readonly statusClass = STATUS_CLASS;

  protected readonly pendingActionUid = signal<string | null>(null);
  protected readonly removingUid = signal<string | null>(null);
  protected readonly confirmingRemoveUser = signal<UserProfile | null>(null);
  protected readonly changingRoleUid = signal<string | null>(null);
  protected readonly confirmingRoleChangeToStudent = signal<UserProfile | null>(null);

  /**
   * El Select ya "eligió" student en cuanto el usuario lo clickeó — el
   * cambio real todavía no se aplicó (espera la confirmación). Si el
   * binding de `[value]` fuera `user.role` a secas, cancelar no lo haría
   * volver a mostrar el rol real: `user.role` nunca cambió, así que
   * Angular no tiene un valor distinto que re-empujar hacia el hijo. Este
   * método SÍ cambia de salida (student mientras el diálogo está abierto
   * para este usuario, el rol real en cualquier otro caso), así que
   * cancelar (que vacía `confirmingRoleChangeToStudent`) genuinamente
   * fuerza al Select a mostrar el rol real de nuevo.
   */
  protected displayedRole(user: UserProfile): UserRole {
    return this.confirmingRoleChangeToStudent()?.uid === user.uid ? 'student' : user.role;
  }

  protected readonly roleOptions = computed<SelectOption<UserRole>[]>(() => [
    { value: 'student', label: this.i18n.t('adminUsers', 'roleStudent') },
    { value: 'teacher', label: this.i18n.t('adminUsers', 'roleTeacher') },
    { value: 'admin', label: this.i18n.t('adminUsers', 'roleAdmin') },
  ]);

  protected roleLabel(role: UserRole): string {
    switch (role) {
      case 'student':
        return this.i18n.t('adminUsers', 'roleStudent');
      case 'teacher':
        return this.i18n.t('adminUsers', 'roleTeacher');
      case 'admin':
        return this.i18n.t('adminUsers', 'roleAdmin');
    }
  }

  protected statusLabel(status: UserStatus): string {
    return status === 'rejected'
      ? this.i18n.t('adminUsers', 'statusRejected')
      : this.i18n.t('adminUsers', 'statusApproved');
  }

  protected initial(user: UserProfile): string {
    return (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase();
  }

  /** No se puede borrar la propia cuenta (ver firestore.rules) — se oculta el botón en esa fila. */
  protected isSelf(user: UserProfile): boolean {
    return user.uid === this.authService.user()?.uid;
  }

  protected async onRevoke(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.reject(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  protected async onReinstate(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.approve(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  /**
   * Sin guard explícito contra auto-degradarse: el botón/select ya está
   * oculto para la propia fila (ver isSelf), mismo criterio que "Borrar".
   *
   * Pasar a "student" pide confirmación antes: le revoca de verdad el
   * acceso de profesor (ver UsersService.updateRole), no es un cambio
   * cosmético. Los demás cambios de rol se aplican directo.
   */
  protected onChangeRole(user: UserProfile, role: UserRole | undefined): void {
    if (!role || role === user.role) {
      return;
    }
    if (role === 'student') {
      this.confirmingRoleChangeToStudent.set(user);
      return;
    }
    void this.applyRoleChange(user, role);
  }

  protected async applyRoleChange(user: UserProfile, role: UserRole): Promise<void> {
    this.changingRoleUid.set(user.uid);
    try {
      await this.usersService.updateRole(user.uid, role);
    } finally {
      this.changingRoleUid.set(null);
    }
  }

  protected async onRemove(user: UserProfile): Promise<void> {
    this.removingUid.set(user.uid);
    try {
      await this.usersService.remove(user.uid);
    } finally {
      this.removingUid.set(null);
    }
  }
}
