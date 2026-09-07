import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import type { Subject } from '../../../core/subjects/subjects.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Select, type SelectOption } from '../../../shared/components/select/select';

/** Panel de admin: crear materias y asignarles un profesor. */
@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [Button, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subjects.html',
})
export class AdminSubjects {
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);

  protected readonly teacherOptions = computed<SelectOption<string>[]>(() =>
    this.usersService
      .users()
      .filter((user) => user.role === 'teacher')
      .map((user) => ({ value: user.uid, label: user.displayName ?? user.email ?? user.uid })),
  );

  protected readonly name = signal('');
  protected readonly teacherId = signal<string | undefined>(undefined);
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);

  protected async onCreate(): Promise<void> {
    const teacherId = this.teacherId();
    if (!this.name().trim() || !teacherId) {
      return;
    }
    const teacher = this.usersService.users().find((user) => user.uid === teacherId);
    if (!teacher) {
      return;
    }

    this.creating.set(true);
    try {
      await this.subjectsService.create(
        this.name(),
        teacherId,
        teacher.displayName ?? teacher.email ?? teacherId,
      );
      this.name.set('');
      this.teacherId.set(undefined);
    } finally {
      this.creating.set(false);
    }
  }

  protected async onRemove(subject: Subject): Promise<void> {
    this.removingId.set(subject.id);
    try {
      await this.subjectsService.remove(subject.id);
    } finally {
      this.removingId.set(null);
    }
  }
}
