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
import { SubjectAssignmentsService } from '../../core/subjects/subject-assignments.service';
import type { Subject } from '../../core/subjects/subjects.model';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { IconBookOpen, IconGraduationCap, IconUserPlus, IconUsers } from '../../shared/icons/icons';

type StatIcon = 'users' | 'book' | 'mail' | 'graduation';

interface StatCard {
  label: string;
  value: number;
  icon: StatIcon;
}

/** Área logueada de la app (solo alcanzable con status "approved", ver approvedGuard). */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Button, IconUsers, IconBookOpen, IconUserPlus, IconGraduationCap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly subjectsService = inject(SubjectsService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);

  protected readonly mySubjects = signal<Subject[]>([]);
  protected readonly mySubjectTeachers = signal<Map<string, string[]>>(new Map());
  protected readonly loadingMySubjects = signal(false);

  /** Nombres de los profesores de una materia, unidos con coma (o el fallback si no tiene ninguno). */
  protected teacherNamesFor(subjectId: string): string {
    const names = this.mySubjectTeachers().get(subjectId);
    return names && names.length > 0
      ? names.join(', ')
      : this.i18n.t('dashboard', 'noTeacherAssigned');
  }

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
        {
          label: this.i18n.t('dashboard', 'adminPanel'),
          value: this.usersService.users().length,
          icon: 'users',
        },
        {
          label: this.i18n.t('dashboard', 'subjectsLink'),
          value: this.subjectsService.subjects().length,
          icon: 'book',
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
          icon: 'mail',
        },
      ];
    }
    if (this.userProfileService.isTeacher()) {
      return [
        {
          label: this.i18n.t('dashboard', 'mySubjects'),
          value: this.subjectsService.mySubjects().length,
          icon: 'book',
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
          icon: 'mail',
        },
      ];
    }
    return [
      {
        label: this.i18n.t('dashboard', 'mySubjects'),
        value: this.mySubjects().length,
        icon: 'graduation',
      },
    ];
  });

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      if (profile?.role !== 'student' || profile.enrolledSubjectIds.length === 0) {
        this.mySubjects.set([]);
        this.mySubjectTeachers.set(new Map());
        this.loadingMySubjects.set(false);
        return;
      }

      this.loadingMySubjects.set(true);
      Promise.all([
        this.subjectsService.fetchByIds(profile.enrolledSubjectIds),
        this.subjectAssignmentsService.fetchBySubjectIds(profile.enrolledSubjectIds),
      ])
        .then(([subjects, assignments]) => {
          this.mySubjects.set(subjects);
          const byTeacher = new Map<string, string[]>();
          for (const assignment of assignments) {
            byTeacher.set(assignment.subjectId, [
              ...(byTeacher.get(assignment.subjectId) ?? []),
              assignment.teacherName,
            ]);
          }
          this.mySubjectTeachers.set(byTeacher);
        })
        .catch(() => {
          this.mySubjects.set([]);
          this.mySubjectTeachers.set(new Map());
        })
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
