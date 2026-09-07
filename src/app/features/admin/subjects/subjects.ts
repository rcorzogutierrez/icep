import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import type { Subject } from '../../../core/subjects/subjects.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { ToastService } from '../../../shared/toast/toast.service';

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
  private readonly toast = inject(ToastService);

  protected readonly teacherOptions = computed<SelectOption<string>[]>(() =>
    this.usersService
      .users()
      .filter((user) => user.role === 'teacher' || user.role === 'admin')
      .map((user) => ({ value: user.uid, label: user.displayName ?? user.email ?? user.uid })),
  );

  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly teacherId = signal<string | undefined>(undefined);
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);
  protected readonly assigningId = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editCode = signal('');
  protected readonly savingEdit = signal(false);

  /** El código ya existe en otra materia (comparación case-insensitive, excluyendo `excludeId`). */
  private isCodeTaken(code: string, excludeId?: string): boolean {
    const normalized = code.trim().toUpperCase();
    return this.subjectsService
      .subjects()
      .some((subject) => subject.id !== excludeId && subject.code === normalized);
  }

  protected async onCreate(): Promise<void> {
    if (!this.name().trim() || !this.code().trim()) {
      return;
    }
    if (this.isCodeTaken(this.code())) {
      this.toast.error(this.i18n.t('adminSubjects', 'duplicateCode'));
      return;
    }

    const teacherId = this.teacherId();
    const teacher = teacherId
      ? this.usersService.users().find((user) => user.uid === teacherId)
      : undefined;

    this.creating.set(true);
    try {
      await this.subjectsService.create(
        this.name(),
        this.code(),
        teacherId ?? null,
        teacher ? (teacher.displayName ?? teacher.email ?? teacherId!) : null,
      );
      this.name.set('');
      this.code.set('');
      this.teacherId.set(undefined);
      this.toast.success(this.i18n.t('adminSubjects', 'created'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async onAssignTeacher(subject: Subject, teacherId: string | undefined): Promise<void> {
    const teacher = teacherId
      ? this.usersService.users().find((user) => user.uid === teacherId)
      : undefined;

    this.assigningId.set(subject.id);
    try {
      await this.subjectsService.update(subject.id, {
        teacherId: teacherId ?? null,
        teacherName: teacher ? (teacher.displayName ?? teacher.email ?? teacherId!) : null,
      });
      this.toast.success(this.i18n.t('adminSubjects', 'teacherUpdated'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.assigningId.set(null);
    }
  }

  protected startEdit(subject: Subject): void {
    this.editingId.set(subject.id);
    this.editName.set(subject.name);
    this.editCode.set(subject.code);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(subject: Subject): Promise<void> {
    if (!this.editName().trim() || !this.editCode().trim()) {
      return;
    }
    if (this.isCodeTaken(this.editCode(), subject.id)) {
      this.toast.error(this.i18n.t('adminSubjects', 'duplicateCode'));
      return;
    }

    this.savingEdit.set(true);
    try {
      await this.subjectsService.update(subject.id, {
        name: this.editName().trim(),
        code: this.editCode().trim().toUpperCase(),
      });
      this.editingId.set(null);
      this.toast.success(this.i18n.t('adminSubjects', 'updated'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected async onRemove(subject: Subject): Promise<void> {
    this.removingId.set(subject.id);
    try {
      await this.subjectsService.remove(subject.id);
      this.toast.success(this.i18n.t('adminSubjects', 'deleted'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.removingId.set(null);
    }
  }
}
