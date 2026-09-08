import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CoursesService } from '../../../core/courses/courses.service';
import type { Course, CourseStudent, CourseSubject } from '../../../core/courses/courses.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

/** Panel de admin: crear cursos y asignarles materias y estudiantes. */
@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [Button, Select, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './courses.html',
})
export class AdminCourses {
  protected readonly coursesService = inject(CoursesService);
  protected readonly courseSubjectsService = inject(CourseSubjectsService);
  protected readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  private readonly students = computed(() =>
    this.usersService.users().filter((user) => user.role === 'student'),
  );

  protected readonly name = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly savingEdit = signal(false);

  protected readonly assigningSubjectId = signal<string | null>(null);
  protected readonly unassigningSubjectRowId = signal<string | null>(null);
  protected readonly assigningStudentId = signal<string | null>(null);
  protected readonly unassigningStudentRowId = signal<string | null>(null);

  /** Materias ya asignadas a un curso. */
  protected subjectsFor(courseId: string): CourseSubject[] {
    return this.courseSubjectsService.forCourse(courseId);
  }

  /** Estudiantes ya asignados a un curso. */
  protected studentsFor(courseId: string): CourseStudent[] {
    return this.courseStudentsService.forCourse(courseId);
  }

  /** Materias que todavía no están en ese curso (para el selector de "agregar"). */
  protected availableSubjectOptions(courseId: string): SelectOption<string>[] {
    const assignedIds = new Set(this.subjectsFor(courseId).map((cs) => cs.subjectId));
    return this.subjectsService
      .subjects()
      .filter((subject) => !assignedIds.has(subject.id))
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }));
  }

  /** Estudiantes que todavía no están en ese curso (para el selector de "agregar"). */
  protected availableStudentOptions(courseId: string): SelectOption<string>[] {
    const assignedIds = new Set(this.studentsFor(courseId).map((cs) => cs.studentUid));
    return this.students()
      .filter((student) => !assignedIds.has(student.uid))
      .map((student) => ({
        value: student.uid,
        label: student.displayName ?? student.email ?? student.uid,
      }));
  }

  protected async onCreate(): Promise<void> {
    if (!this.name().trim()) {
      return;
    }
    this.creating.set(true);
    try {
      await this.coursesService.create(this.name());
      this.name.set('');
      this.toast.success(this.i18n.t('adminCourses', 'created'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected startEdit(course: Course): void {
    this.editingId.set(course.id);
    this.editName.set(course.name);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(course: Course): Promise<void> {
    if (!this.editName().trim()) {
      return;
    }
    this.savingEdit.set(true);
    try {
      await this.coursesService.update(course.id, { name: this.editName().trim() });
      this.editingId.set(null);
      this.toast.success(this.i18n.t('adminCourses', 'updated'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected async onRemove(course: Course): Promise<void> {
    this.removingId.set(course.id);
    try {
      await this.coursesService.remove(course.id);
      this.toast.success(this.i18n.t('adminCourses', 'deleted'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.removingId.set(null);
    }
  }

  protected async onAssignSubject(course: Course, subjectId: string | undefined): Promise<void> {
    if (!subjectId) {
      return;
    }
    const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
    if (!subject) {
      return;
    }

    this.assigningSubjectId.set(course.id);
    try {
      await this.courseSubjectsService.assign(course.id, subjectId, subject.name, subject.code);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.assigningSubjectId.set(null);
    }
  }

  protected async onUnassignSubject(courseSubject: CourseSubject): Promise<void> {
    this.unassigningSubjectRowId.set(courseSubject.id);
    try {
      await this.courseSubjectsService.unassign(courseSubject.id);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.unassigningSubjectRowId.set(null);
    }
  }

  protected async onAssignStudent(course: Course, studentUid: string | undefined): Promise<void> {
    if (!studentUid) {
      return;
    }
    const student = this.students().find((s) => s.uid === studentUid);
    if (!student) {
      return;
    }

    this.assigningStudentId.set(course.id);
    try {
      await this.courseStudentsService.assign(
        course.id,
        studentUid,
        student.displayName ?? student.email ?? studentUid,
      );
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.assigningStudentId.set(null);
    }
  }

  protected async onUnassignStudent(courseStudent: CourseStudent): Promise<void> {
    this.unassigningStudentRowId.set(courseStudent.id);
    try {
      await this.courseStudentsService.unassign(courseStudent.id);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.unassigningStudentRowId.set(null);
    }
  }
}
