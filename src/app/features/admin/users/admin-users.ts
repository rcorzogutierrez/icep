import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import type { UserProfile, UserRole, UserStatus } from '../../../core/users/users.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';

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
  imports: [Button, DatePipe],
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

  protected async onRemove(user: UserProfile): Promise<void> {
    this.removingUid.set(user.uid);
    try {
      await this.usersService.remove(user.uid);
    } finally {
      this.removingUid.set(null);
    }
  }
}
