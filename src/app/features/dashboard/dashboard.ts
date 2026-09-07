import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import type { Subject } from '../../core/subjects/subjects.model';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { Button } from '../../shared/components/button/button';

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
  private readonly router = inject(Router);

  protected readonly mySubjects = signal<Subject[]>([]);
  protected readonly loadingMySubjects = signal(false);

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

  protected onSignOut(): void {
    void this.auth.signOut();
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
