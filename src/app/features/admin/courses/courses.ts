import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../../core/courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CourseTeachersService } from '../../../core/courses/course-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import type {
  Course,
  CourseStudent,
  CourseSubject,
  CourseSubjectTeacher,
  CourseTeacher,
} from '../../../core/courses/courses.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Modal } from '../../../shared/components/modal/modal';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { TransferList } from '../../../shared/components/transfer-list/transfer-list';
import { IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

/** Panel de admin: crear cursos y asignarles materias, estudiantes y profesores. */
@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [Button, Modal, TransferList, Select, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './courses.html',
})
export class AdminCourses {
  protected readonly coursesService = inject(CoursesService);
  protected readonly courseSubjectsService = inject(CourseSubjectsService);
  protected readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly courseTeachersService = inject(CourseTeachersService);
  protected readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  private readonly students = computed(() =>
    this.usersService.users().filter((user) => user.role === 'student'),
  );

  private readonly teachers = computed(() =>
    this.usersService.users().filter((user) => user.role === 'teacher' || user.role === 'admin'),
  );

  protected readonly name = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly savingEdit = signal(false);

  protected readonly managingSubjectsCourseId = signal<string | null>(null);
  protected readonly managingStudentsCourseId = signal<string | null>(null);
  protected readonly managingTeachersCourseId = signal<string | null>(null);
  protected readonly managingAssignmentsCourseId = signal<string | null>(null);

  protected readonly managingSubjectsCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingSubjectsCourseId()),
  );
  protected readonly managingStudentsCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingStudentsCourseId()),
  );
  protected readonly managingTeachersCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingTeachersCourseId()),
  );
  protected readonly managingAssignmentsCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.managingAssignmentsCourseId()),
  );

  /** Materias ya asignadas a un curso. */
  protected subjectsFor(courseId: string): CourseSubject[] {
    return this.courseSubjectsService.forCourse(courseId);
  }

  /** Estudiantes ya asignados a un curso. */
  protected studentsFor(courseId: string): CourseStudent[] {
    return this.courseStudentsService.forCourse(courseId);
  }

  /** Profesores ya asignados a un curso (paso 1). */
  protected teachersFor(courseId: string): CourseTeacher[] {
    return this.courseTeachersService.forCourse(courseId);
  }

  /** El profesor del curso que dicta esta materia puntual, si hay uno (paso 2). */
  protected subjectTeacherFor(
    courseId: string,
    subjectId: string,
  ): CourseSubjectTeacher | undefined {
    return this.courseSubjectTeachersService.forCourseSubject(courseId, subjectId);
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

  /** Profesores del curso, como opciones para la columna "Seleccionadas" del transfer list. */
  protected selectedTeacherOptions(courseId: string): SelectOption<string>[] {
    return this.teachersFor(courseId).map((ct) => ({ value: ct.teacherId, label: ct.teacherName }));
  }

  /** Profesores que todavía no participan del curso, como opciones para "Disponibles". */
  protected availableTeacherOptions(courseId: string): SelectOption<string>[] {
    const assignedIds = new Set(this.teachersFor(courseId).map((ct) => ct.teacherId));
    return this.teachers()
      .filter((teacher) => !assignedIds.has(teacher.uid))
      .map((teacher) => ({
        value: teacher.uid,
        label: teacher.displayName ?? teacher.email ?? teacher.uid,
      }));
  }

  /** De los profesores YA asignados al curso, cuáles se le pueden asignar a esta materia (todos menos quien ya la dicta). */
  protected availableTeacherOptionsForSubject(
    courseId: string,
    subjectId: string,
  ): SelectOption<string>[] {
    const currentTeacherId = this.subjectTeacherFor(courseId, subjectId)?.teacherId;
    return this.teachersFor(courseId)
      .filter((ct) => ct.teacherId !== currentTeacherId)
      .map((ct) => ({ value: ct.teacherId, label: ct.teacherName }));
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
      await this.autoAssignIfSoleTeacher(courseId, subjectIds);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  /** Si el curso tiene un solo profesor, le asigna directamente estas materias. */
  private async autoAssignIfSoleTeacher(courseId: string, subjectIds: string[]): Promise<void> {
    const teachers = this.teachersFor(courseId);
    if (teachers.length !== 1) {
      return;
    }
    const soleTeacher = teachers[0];
    await Promise.all(
      subjectIds.map((subjectId) =>
        this.courseSubjectTeachersService.assign(
          courseId,
          subjectId,
          soleTeacher.teacherId,
          soleTeacher.teacherName,
        ),
      ),
    );
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

  protected openTeachersModal(course: Course): void {
    this.managingTeachersCourseId.set(course.id);
  }

  protected closeTeachersModal(): void {
    this.managingTeachersCourseId.set(null);
  }

  protected async onAddTeachers(courseId: string, teacherIds: string[]): Promise<void> {
    try {
      await Promise.all(
        teacherIds.map((teacherId) => {
          const teacher = this.teachers().find((t) => t.uid === teacherId);
          return teacher
            ? this.courseTeachersService.assign(
                courseId,
                teacherId,
                teacher.displayName ?? teacher.email ?? teacherId,
              )
            : Promise.resolve();
        }),
      );
      await this.autoAssignSoleTeacherToUnassignedSubjects(courseId, teacherIds);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  /**
   * Si este agregado deja al curso con un solo profesor en total, le asigna
   * directamente todas las materias del curso que todavía no tengan uno.
   */
  private async autoAssignSoleTeacherToUnassignedSubjects(
    courseId: string,
    addedTeacherIds: string[],
  ): Promise<void> {
    const otherExistingTeachers = this.teachersFor(courseId).filter(
      (ct) => !addedTeacherIds.includes(ct.teacherId),
    );
    if (otherExistingTeachers.length !== 0 || addedTeacherIds.length !== 1) {
      return;
    }
    const soleTeacherId = addedTeacherIds[0];
    const teacher = this.teachers().find((t) => t.uid === soleTeacherId);
    if (!teacher) {
      return;
    }
    const soleTeacherName = teacher.displayName ?? teacher.email ?? soleTeacherId;
    const unassignedSubjects = this.subjectsFor(courseId).filter(
      (cs) => !this.subjectTeacherFor(courseId, cs.subjectId),
    );
    await Promise.all(
      unassignedSubjects.map((cs) =>
        this.courseSubjectTeachersService.assign(
          courseId,
          cs.subjectId,
          soleTeacherId,
          soleTeacherName,
        ),
      ),
    );
  }

  protected async onRemoveTeachers(courseId: string, teacherIds: string[]): Promise<void> {
    const ids = new Set(teacherIds);
    const rows = this.teachersFor(courseId).filter((ct) => ids.has(ct.teacherId));
    try {
      await Promise.all(rows.map((row) => this.courseTeachersService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected openAssignmentsModal(course: Course): void {
    this.managingAssignmentsCourseId.set(course.id);
  }

  protected closeAssignmentsModal(): void {
    this.managingAssignmentsCourseId.set(null);
  }

  protected async onAssignSubjectTeacher(
    courseId: string,
    subjectId: string,
    teacherId: string | undefined,
  ): Promise<void> {
    if (!teacherId) {
      return;
    }
    const teacher = this.teachersFor(courseId).find((ct) => ct.teacherId === teacherId);
    if (!teacher) {
      return;
    }
    try {
      await this.courseSubjectTeachersService.assign(
        courseId,
        subjectId,
        teacherId,
        teacher.teacherName,
      );
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onUnassignSubjectTeacher(row: CourseSubjectTeacher): Promise<void> {
    try {
      await this.courseSubjectTeachersService.unassign(row);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }
}
