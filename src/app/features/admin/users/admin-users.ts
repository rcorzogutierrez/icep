import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import type { UserProfile, UserStatus } from '../../../core/users/users.model';

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'text-status-paused',
  approved: 'text-status-active',
  rejected: 'text-status-expired',
};

/** Panel de admin: lista todos los usuarios y permite aprobar/rechazar los pendientes. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [Button, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users.html',
})
export class AdminUsers {
  protected readonly usersService = inject(UsersService);
  private readonly router = inject(Router);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusClass = STATUS_CLASS;

  protected readonly pendingActionUid = signal<string | null>(null);

  protected async onApprove(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.approve(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  protected async onReject(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.reject(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  protected goToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }
}
