import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/i18n/i18n.service';
import type { SubjectAssignment } from '../../../core/subjects/subject-assignments.model';
import { SubjectAssignmentsService } from '../../../core/subjects/subject-assignments.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import type { Subject } from '../../../core/subjects/subjects.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

/** Panel de admin: crear materias y asignarles uno o varios profesores. */
@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [Button, Select, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subjects.html',
})
export class AdminSubjects {
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly teachers = computed(() =>
    this.usersService.users().filter((user) => user.role === 'teacher' || user.role === 'admin'),
  );

  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);
  protected readonly assigningId = signal<string | null>(null);
  protected readonly unassigningId = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editCode = signal('');
  protected readonly savingEdit = signal(false);

  /** Profesores ya asignados a una materia. */
  protected assignmentsFor(subjectId: string): SubjectAssignment[] {
    return this.subjectAssignmentsService
      .assignments()
      .filter((assignment) => assignment.subjectId === subjectId);
  }

  /** Profesores que todavía no están asignados a esa materia (para el selector de "agregar"). */
  protected availableTeacherOptions(subjectId: string): SelectOption<string>[] {
    const assignedIds = new Set(this.assignmentsFor(subjectId).map((a) => a.teacherId));
    return this.teachers()
      .filter((teacher) => !assignedIds.has(teacher.uid))
      .map((teacher) => ({
        value: teacher.uid,
        label: teacher.displayName ?? teacher.email ?? teacher.uid,
      }));
  }

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

    this.creating.set(true);
    try {
      await this.subjectsService.create(this.name(), this.code());
      this.name.set('');
      this.code.set('');
      this.toast.success(this.i18n.t('adminSubjects', 'created'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async onAssignTeacher(subject: Subject, teacherId: string | undefined): Promise<void> {
    if (!teacherId) {
      return;
    }
    const teacher = this.teachers().find((t) => t.uid === teacherId);
    if (!teacher) {
      return;
    }

    this.assigningId.set(subject.id);
    try {
      await this.subjectAssignmentsService.assign(
        subject.id,
        teacherId,
        teacher.displayName ?? teacher.email ?? teacherId,
      );
      this.toast.success(this.i18n.t('adminSubjects', 'teacherAssigned'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.assigningId.set(null);
    }
  }

  protected async onUnassignTeacher(assignment: SubjectAssignment): Promise<void> {
    this.unassigningId.set(assignment.id);
    try {
      await this.subjectAssignmentsService.unassign(assignment.id);
      this.toast.success(this.i18n.t('adminSubjects', 'teacherRemoved'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.unassigningId.set(null);
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

  protected goToGradebook(subject: Subject): void {
    void this.router.navigateByUrl(`/subjects/${subject.id}/gradebook`);
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
