import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CourseInvitationsService } from '../../../core/invitations/course-invitations.service';
import type { CourseInvitation } from '../../../core/invitations/course-invitations.model';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../../core/courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CourseTeachersService } from '../../../core/courses/course-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import type { CourseSubjectTeacher } from '../../../core/courses/courses.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { InviteCodeCard } from '../../../shared/components/invite-code-card/invite-code-card';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { TransferList } from '../../../shared/components/transfer-list/transfer-list';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import { IconPlus, IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

type Tab = 'subjects' | 'students' | 'teachers' | 'assignments';

/**
 * Detalle de un curso: materias, estudiantes, profesores y asignaciones
 * materia-profesor, todo en una sola página con pestañas — reemplaza los 4
 * modales que antes vivían en la lista de Cursos.
 */
@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [
    TransferList,
    Select,
    Button,
    InviteCodeCard,
    Page,
    PageHeader,
    DatePipe,
    IconPlus,
    IconX,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-detail.html',
})
export class CourseDetail {
  readonly courseId = input.required<string>();

  protected readonly coursesService = inject(CoursesService);
  protected readonly courseSubjectsService = inject(CourseSubjectsService);
  protected readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly courseTeachersService = inject(CourseTeachersService);
  protected readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  protected readonly courseInvitationsService = inject(CourseInvitationsService);
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly activeTab = signal<Tab>('subjects');

  protected readonly course = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.courseId()),
  );

  protected readonly generatingInvitation = signal(false);
  protected readonly revokingInvitationCode = signal<string | null>(null);

  /** El código de curso vigente (activo y no vencido), si hay uno. Puede haber revocados/vencidos en el historial, no se muestran acá. */
  protected readonly activeCourseInvitation = computed<CourseInvitation | undefined>(() =>
    this.courseInvitationsService
      .forCourse(this.courseId())
      .find((inv) => inv.status === 'active' && inv.expiresAt.toMillis() > Date.now()),
  );

  /** true si el curso ya tuvo algún código (aunque esté vencido/revocado) — decide "Regenerar" vs "Generar". */
  protected readonly hasInvitationHistory = computed(
    () => this.courseInvitationsService.forCourse(this.courseId()).length > 0,
  );

  protected async onGenerateInvitation(): Promise<void> {
    const course = this.course();
    if (!course) {
      return;
    }
    this.generatingInvitation.set(true);
    try {
      await this.courseInvitationsService.create(course.id, course.name);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.generatingInvitation.set(false);
    }
  }

  protected async onRevokeInvitation(invitation: CourseInvitation): Promise<void> {
    this.revokingInvitationCode.set(invitation.code);
    try {
      await this.courseInvitationsService.revoke(invitation.code);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.revokingInvitationCode.set(null);
    }
  }

  private readonly students = computed(() =>
    this.usersService.users().filter((user) => user.role === 'student'),
  );

  private readonly teachers = computed(() =>
    this.usersService.users().filter((user) => user.role === 'teacher' || user.role === 'admin'),
  );

  protected readonly courseSubjects = computed(() =>
    this.courseSubjectsService.forCourse(this.courseId()),
  );
  protected readonly courseStudents = computed(() =>
    this.courseStudentsService.forCourse(this.courseId()),
  );
  protected readonly courseTeachers = computed(() =>
    this.courseTeachersService.forCourse(this.courseId()),
  );

  /** El profesor del curso que dicta esta materia puntual, si hay uno. */
  protected subjectTeacherFor(subjectId: string): CourseSubjectTeacher | undefined {
    return this.courseSubjectTeachersService.forCourseSubject(this.courseId(), subjectId);
  }

  protected readonly selectedSubjectOptions = computed<SelectOption<string>[]>(() =>
    this.courseSubjects().map((cs) => ({
      value: cs.subjectId,
      label: `${cs.subjectCode} · ${cs.subjectName}`,
    })),
  );

  protected readonly availableSubjectOptions = computed<SelectOption<string>[]>(() => {
    const assignedIds = new Set(this.courseSubjects().map((cs) => cs.subjectId));
    return this.subjectsService
      .subjects()
      .filter((subject) => !assignedIds.has(subject.id))
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }));
  });

  protected readonly selectedStudentOptions = computed<SelectOption<string>[]>(() =>
    this.courseStudents().map((cs) => ({ value: cs.studentUid, label: cs.studentName })),
  );

  protected readonly availableStudentOptions = computed<SelectOption<string>[]>(() => {
    const assignedIds = new Set(this.courseStudents().map((cs) => cs.studentUid));
    return this.students()
      .filter((student) => !assignedIds.has(student.uid))
      .map((student) => ({
        value: student.uid,
        label: student.displayName ?? student.email ?? student.uid,
      }));
  });

  protected readonly selectedTeacherOptions = computed<SelectOption<string>[]>(() =>
    this.courseTeachers().map((ct) => ({ value: ct.teacherId, label: ct.teacherName })),
  );

  protected readonly availableTeacherOptions = computed<SelectOption<string>[]>(() => {
    const assignedIds = new Set(this.courseTeachers().map((ct) => ct.teacherId));
    return this.teachers()
      .filter((teacher) => !assignedIds.has(teacher.uid))
      .map((teacher) => ({
        value: teacher.uid,
        label: teacher.displayName ?? teacher.email ?? teacher.uid,
      }));
  });

  /** De los profesores YA asignados al curso, cuáles se le pueden asignar a esta materia (todos menos quien ya la dicta). */
  protected availableTeacherOptionsForSubject(subjectId: string): SelectOption<string>[] {
    const currentTeacherId = this.subjectTeacherFor(subjectId)?.teacherId;
    return this.courseTeachers()
      .filter((ct) => ct.teacherId !== currentTeacherId)
      .map((ct) => ({ value: ct.teacherId, label: ct.teacherName }));
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  protected goBack(): void {
    this.router.navigate(['/admin/courses']);
  }

  protected async onAddSubjects(subjectIds: string[]): Promise<void> {
    const courseId = this.courseId();
    try {
      await Promise.all(
        subjectIds.map((subjectId) => {
          const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
          return subject
            ? this.courseSubjectsService.assign(courseId, subjectId, subject.name, subject.code)
            : Promise.resolve();
        }),
      );
      await this.autoAssignIfSoleTeacher(subjectIds);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  /** Si el curso tiene un solo profesor, le asigna directamente estas materias. */
  private async autoAssignIfSoleTeacher(subjectIds: string[]): Promise<void> {
    const courseId = this.courseId();
    const teachers = this.courseTeachers();
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

  protected async onRemoveSubjects(subjectIds: string[]): Promise<void> {
    const ids = new Set(subjectIds);
    const rows = this.courseSubjects().filter((cs) => ids.has(cs.subjectId));
    const courseId = this.courseId();
    try {
      const teacherRows = this.courseSubjectTeachersService
        .forCourse(courseId)
        .filter((r) => ids.has(r.subjectId));
      await Promise.all(teacherRows.map((row) => this.courseSubjectTeachersService.unassign(row)));
      await Promise.all(rows.map((row) => this.courseSubjectsService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onAddStudents(studentUids: string[]): Promise<void> {
    const courseId = this.courseId();
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

  protected async onRemoveStudents(studentUids: string[]): Promise<void> {
    const ids = new Set(studentUids);
    const rows = this.courseStudents().filter((cs) => ids.has(cs.studentUid));
    try {
      await Promise.all(rows.map((row) => this.courseStudentsService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onAddTeachers(teacherIds: string[]): Promise<void> {
    const courseId = this.courseId();
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
      await this.autoAssignSoleTeacherToUnassignedSubjects(teacherIds);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  /**
   * Si este agregado deja al curso con un solo profesor en total, le asigna
   * directamente todas las materias del curso que todavía no tengan uno.
   */
  private async autoAssignSoleTeacherToUnassignedSubjects(
    addedTeacherIds: string[],
  ): Promise<void> {
    const courseId = this.courseId();
    const otherExistingTeachers = this.courseTeachers().filter(
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
    const unassignedSubjects = this.courseSubjects().filter(
      (cs) => !this.subjectTeacherFor(cs.subjectId),
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

  protected async onRemoveTeachers(teacherIds: string[]): Promise<void> {
    const ids = new Set(teacherIds);
    const rows = this.courseTeachers().filter((ct) => ids.has(ct.teacherId));
    const courseId = this.courseId();
    try {
      const subjectTeacherRows = this.courseSubjectTeachersService
        .forCourse(courseId)
        .filter((r) => ids.has(r.teacherId));
      await Promise.all(
        subjectTeacherRows.map((row) => this.courseSubjectTeachersService.unassign(row)),
      );
      await Promise.all(rows.map((row) => this.courseTeachersService.unassign(row.id)));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    }
  }

  protected async onAssignSubjectTeacher(
    subjectId: string,
    teacherId: string | undefined,
  ): Promise<void> {
    if (!teacherId) {
      return;
    }
    const teacher = this.courseTeachers().find((ct) => ct.teacherId === teacherId);
    if (!teacher) {
      return;
    }
    try {
      await this.courseSubjectTeachersService.assign(
        this.courseId(),
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
