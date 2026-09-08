import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CoursesService } from '../../../core/courses/courses.service';
import type { Course, CourseStudent, CourseSubject } from '../../../core/courses/courses.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Modal } from '../../../shared/components/modal/modal';
import { type SelectOption } from '../../../shared/components/select/select';
import { TransferList } from '../../../shared/components/transfer-list/transfer-list';
import { IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

/** Panel de admin: crear cursos y asignarles materias y estudiantes. */
@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [Button, Modal, TransferList, IconX],
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

  protected readonly unassigningSubjectRowId = signal<string | null>(null);
  protected readonly unassigningStudentRowId = signal<string | null>(null);

  protected readonly managingSubjectsCourseId = signal<string | null>(null);
  protected readonly managingStudentsCourseId = signal<string | null>(null);

  protected readonly managingSubjectsCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingSubjectsCourseId()),
  );
  protected readonly managingStudentsCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingStudentsCourseId()),
  );

  /** Materias ya asignadas a un curso. */
  protected subjectsFor(courseId: string): CourseSubject[] {
    return this.courseSubjectsService.forCourse(courseId);
  }

  /** Estudiantes ya asignados a un curso. */
  protected studentsFor(courseId: string): CourseStudent[] {
    return this.courseStudentsService.forCourse(courseId);
  }

  /** Materias ya asignadas, como opciones para la columna "Seleccionadas" del transfer list. */
  protected selectedSubjectOptions(courseId: string): SelectOption<string>[] {
    return this.subjectsFor(courseId).map((cs) => ({
      value: cs.subjectId,
      label: `${cs.subjectCode} · ${cs.subjectName}`,
    }));
  }

  /** Materias que todavía no están en ese curso, como opciones para "Disponibles". */
  protected availableSubjectOptions(courseId: string): SelectOption<string>[] {
    const assignedIds = new Set(this.subjectsFor(courseId).map((cs) => cs.subjectId));
    return this.subjectsService
      .subjects()
      .filter((subject) => !assignedIds.has(subject.id))
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }));
  }

  /** Estudiantes ya asignados, como opciones para la columna "Seleccionadas" del transfer list. */
  protected selectedStudentOptions(courseId: string): SelectOption<string>[] {
    return this.studentsFor(courseId).map((cs) => ({
      value: cs.studentUid,
      label: cs.studentName,
    }));
  }

  /** Estudiantes que todavía no están en ese curso, como opciones para "Disponibles". */
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

  protected openSubjectsModal(course: Course): void {
    this.managingSubjectsCourseId.set(course.id);
  }

  protected closeSubjectsModal(): void {
    this.managingSubjectsCourseId.set(null);
  }

  protected async onAddSubjects(courseId: string, subjectIds: string[]): Promise<void> {
    try {
      await Promise.all(
        subjectIds.map((subjectId) => {
          const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
          return subject
            ? this.courseSubjectsService.assign(courseId, subjectId, subject.name, subject.code)
            : Promise.resolve();
        }),
      );
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onRemoveSubjects(courseId: string, subjectIds: string[]): Promise<void> {
    const ids = new Set(subjectIds);
    const rows = this.subjectsFor(courseId).filter((cs) => ids.has(cs.subjectId));
    try {
      await Promise.all(rows.map((row) => this.courseSubjectsService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
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

  protected openStudentsModal(course: Course): void {
    this.managingStudentsCourseId.set(course.id);
  }

  protected closeStudentsModal(): void {
    this.managingStudentsCourseId.set(null);
  }

  protected async onAddStudents(courseId: string, studentUids: string[]): Promise<void> {
    try {
      await Promise.all(
        studentUids.map((studentUid) => {
          const student = this.students().find((s) => s.uid === studentUid);
          return student
            ? this.courseStudentsService.assign(
                courseId,
                studentUid,
                student.displayName ?? student.email ?? studentUid,
              )
            : Promise.resolve();
        }),
      );
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onRemoveStudents(courseId: string, studentUids: string[]): Promise<void> {
    const ids = new Set(studentUids);
    const rows = this.studentsFor(courseId).filter((cs) => ids.has(cs.studentUid));
    try {
      await Promise.all(rows.map((row) => this.courseStudentsService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
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
