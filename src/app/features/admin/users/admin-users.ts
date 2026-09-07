import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import type { UserProfile, UserRole, UserStatus } from '../../../core/users/users.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';

const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'text-status-paused',
  approved: 'text-status-active',
  rejected: 'text-status-expired',
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

  protected readonly statusClass = STATUS_CLASS;

  protected readonly pendingActionUid = signal<string | null>(null);

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
}
