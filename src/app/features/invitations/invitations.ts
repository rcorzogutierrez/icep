import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import type {
  InvitableRole,
  Invitation,
  InvitationStatus,
} from '../../core/invitations/invitations.model';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { Button } from '../../shared/components/button/button';
import { Select, type SelectOption } from '../../shared/components/select/select';

const STATUS_CLASS: Record<InvitationStatus, string> = {
  pending: 'text-status-paused',
  used: 'text-status-active',
  revoked: 'text-status-expired',
};

/** Pantalla de admin/profesor: generar invitaciones y gestionar las existentes. */
@Component({
  selector: 'app-invitations',
  standalone: true,
  imports: [Button, Select, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invitations.html',
})
export class Invitations {
  protected readonly invitationsService = inject(InvitationsService);
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly availableSubjects = computed(() =>
    this.userProfileService.isAdmin()
      ? this.subjectsService.subjects()
      : this.subjectsService.mySubjects(),
  );

  protected readonly statusClass = STATUS_CLASS;

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
  protected readonly selectedSubjectIds = signal<Set<string>>(new Set());
  protected readonly creating = signal(false);
  protected readonly createdCode = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly revokingCode = signal<string | null>(null);

  protected readonly statusLabel = (status: InvitationStatus): string => {
    switch (status) {
      case 'pending':
        return this.i18n.t('invitationsPage', 'statusPending');
      case 'used':
        return this.i18n.t('invitationsPage', 'statusUsed');
      case 'revoked':
        return this.i18n.t('invitationsPage', 'statusRevoked');
    }
  };

  protected inviteLink(code: string): string {
    return `${location.origin}/invite/${code}`;
  }

  protected toggleSubject(subjectId: string): void {
    const next = new Set(this.selectedSubjectIds());
    if (next.has(subjectId)) {
      next.delete(subjectId);
    } else {
      next.add(subjectId);
    }
    this.selectedSubjectIds.set(next);
  }

  protected async onCreate(): Promise<void> {
    if (!this.email().trim()) {
      return;
    }
    this.creating.set(true);
    this.copied.set(false);
    try {
      const code = await this.invitationsService.create(
        this.email(),
        this.role(),
        Array.from(this.selectedSubjectIds()),
      );
      this.createdCode.set(code);
      this.email.set('');
      this.selectedSubjectIds.set(new Set());
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
    } finally {
      this.revokingCode.set(null);
    }
  }

  protected goToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }
}
