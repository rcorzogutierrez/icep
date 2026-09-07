import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import type { Subject } from '../../core/subjects/subjects.model';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';

interface StatCard {
  label: string;
  value: number;
}

/** Área logueada de la app (solo alcanzable con status "approved", ver approvedGuard). */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly subjectsService = inject(SubjectsService);
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);

  protected readonly mySubjects = signal<Subject[]>([]);
  protected readonly loadingMySubjects = signal(false);

  protected readonly roleLabel = computed(() => {
    switch (this.userProfileService.profile()?.role) {
      case 'admin':
        return this.i18n.t('adminUsers', 'roleAdmin');
      case 'teacher':
        return this.i18n.t('adminUsers', 'roleTeacher');
      case 'student':
        return this.i18n.t('adminUsers', 'roleStudent');
      default:
        return '';
    }
  });

  private readonly pendingInvitationsCount = computed(
    () =>
      this.invitationsService.invitations().filter((invitation) => invitation.status === 'pending')
        .length,
  );

  protected readonly statCards = computed<StatCard[]>(() => {
    if (this.userProfileService.isAdmin()) {
      return [
        { label: this.i18n.t('dashboard', 'adminPanel'), value: this.usersService.users().length },
        {
          label: this.i18n.t('dashboard', 'subjectsLink'),
          value: this.subjectsService.subjects().length,
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
        },
      ];
    }
    if (this.userProfileService.isTeacher()) {
      return [
        {
          label: this.i18n.t('dashboard', 'mySubjects'),
          value: this.subjectsService.mySubjects().length,
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
        },
      ];
    }
    return [{ label: this.i18n.t('dashboard', 'mySubjects'), value: this.mySubjects().length }];
  });

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      if (profile?.role !== 'student' || profile.enrolledSubjectIds.length === 0) {
        this.mySubjects.set([]);
        this.loadingMySubjects.set(false);
        return;
      }

      this.loadingMySubjects.set(true);
      this.subjectsService
        .fetchByIds(profile.enrolledSubjectIds)
        .then((subjects) => this.mySubjects.set(subjects))
        .catch(() => this.mySubjects.set([]))
        .finally(() => this.loadingMySubjects.set(false));
    });
  }

  protected goToAdmin(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected goToInvitations(): void {
    void this.router.navigateByUrl('/invitations');
  }

  protected goToSubjects(): void {
    void this.router.navigateByUrl('/admin/subjects');
  }
}
