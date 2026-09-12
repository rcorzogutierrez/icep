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
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { InviteCodeCard } from '../../../shared/components/invite-code-card/invite-code-card';
import { Modal } from '../../../shared/components/modal/modal';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { TransferList } from '../../../shared/components/transfer-list/transfer-list';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import { IconPlus, IconX } from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

type Tab = 'subjects' | 'students' | 'teachers' | 'assignments';

interface PendingSummary {
  subjectsAdded: string[];
  subjectsRemoved: string[];
  studentsAdded: string[];
  studentsRemoved: string[];
  teachersAdded: string[];
  teachersRemoved: string[];
}

/**
 * Detalle de un curso: materias, estudiantes, profesores y asignaciones
 * materia-profesor, todo en una sola página con pestañas — reemplaza los 4
 * modales que antes vivían en la lista de Cursos.
 *
 * Materias/Estudiantes/Profesores son un "formulario" con borrador: mover
 * gente en el transfer list NO escribe nada todavía, solo actualiza
 * `draft*Ids` (ver más abajo) — recién al confirmar en el resumen de
 * "Guardar cambios" se aplican los assign/unassign reales, seguidos de la
 * reconciliación de "profesor único" (una sola vez, sobre el estado final,
 * no una vez por cada click como antes). La pestaña Asignaciones queda
 * fuera de este borrador a propósito: opera sobre materias/profesores YA
 * confirmados en el curso, no tendría sentido asignar profesor a una
 * materia que todavía ni se guardó.
 */
@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [
    TransferList,
    Select,
    Button,
    ConfirmDialog,
    InviteCodeCard,
    Modal,
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
  /** Pestaña inicial vía `?tab=students` (ver MyCourseDetail: "Agregar estudiante" linkea directo acá). */
  readonly tab = input<Tab | undefined>(undefined);

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

  /**
   * `?tab=students` decide la pestaña inicial (ver `tab` arriba), pero una
   * vez que el usuario clickea otra pestaña eso manda — mismo patrón
   * `override` que `Login.mode`, para no pelearle al click con el query
   * param en cada re-render.
   */
  private readonly tabOverride = signal<Tab | null>(null);
  protected readonly activeTab = computed<Tab>(
    () => this.tabOverride() ?? this.tab() ?? 'subjects',
  );

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

  /** Lo ya guardado en Firestore — la base contra la que se calcula el borrador y el diff al guardar. */
  protected readonly courseSubjects = computed(() =>
    this.courseSubjectsService.forCourse(this.courseId()),
  );
  protected readonly courseStudents = computed(() =>
    this.courseStudentsService.forCourse(this.courseId()),
  );
  protected readonly courseTeachers = computed(() =>
    this.courseTeachersService.forCourse(this.courseId()),
  );

  /**
   * Borrador de cada pestaña: `null` = "sin cambios sin guardar, reflejá lo
   * que ya está guardado". Se pone en un Set concreto recién cuando el
   * usuario mueve algo — así "hay cambios pendientes" se puede calcular
   * comparando contra lo guardado (ver `pendingSummary`) en vez de
   * necesitar una bandera aparte.
   */
  private readonly draftSubjectIds = signal<Set<string> | null>(null);
  private readonly draftStudentIds = signal<Set<string> | null>(null);
  private readonly draftTeacherIds = signal<Set<string> | null>(null);

  private readonly effectiveSubjectIds = computed(
    () => this.draftSubjectIds() ?? new Set(this.courseSubjects().map((cs) => cs.subjectId)),
  );
  private readonly effectiveStudentIds = computed(
    () => this.draftStudentIds() ?? new Set(this.courseStudents().map((cs) => cs.studentUid)),
  );
  private readonly effectiveTeacherIds = computed(
    () => this.draftTeacherIds() ?? new Set(this.courseTeachers().map((ct) => ct.teacherId)),
  );

  /** El profesor del curso que dicta esta materia puntual, si hay uno — vive fuera del borrador (ver comentario de arriba de la clase). */
  protected subjectTeacherFor(subjectId: string): CourseSubjectTeacher | undefined {
    return this.courseSubjectTeachersService.forCourseSubject(this.courseId(), subjectId);
  }

  protected readonly selectedSubjectOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveSubjectIds();
    return this.subjectsService
      .subjects()
      .filter((subject) => ids.has(subject.id))
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }));
  });

  protected readonly availableSubjectOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveSubjectIds();
    return this.subjectsService
      .subjects()
      .filter((subject) => !ids.has(subject.id))
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }));
  });

  protected readonly selectedStudentOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveStudentIds();
    return this.students()
      .filter((student) => ids.has(student.uid))
      .map((student) => ({
        value: student.uid,
        label: student.displayName ?? student.email ?? student.uid,
      }));
  });

  protected readonly availableStudentOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveStudentIds();
    return this.students()
      .filter((student) => !ids.has(student.uid))
      .map((student) => ({
        value: student.uid,
        label: student.displayName ?? student.email ?? student.uid,
      }));
  });

  protected readonly selectedTeacherOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveTeacherIds();
    return this.teachers()
      .filter((teacher) => ids.has(teacher.uid))
      .map((teacher) => ({
        value: teacher.uid,
        label: teacher.displayName ?? teacher.email ?? teacher.uid,
      }));
  });

  protected readonly availableTeacherOptions = computed<SelectOption<string>[]>(() => {
    const ids = this.effectiveTeacherIds();
    return this.teachers()
      .filter((teacher) => !ids.has(teacher.uid))
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

  /** Contadores de las pestañas: reflejan el borrador (si hay uno), no solo lo ya guardado — feedback inmediato de lo que se está armando. */
  protected readonly subjectsCount = computed(() => this.effectiveSubjectIds().size);
  protected readonly studentsCount = computed(() => this.effectiveStudentIds().size);
  protected readonly teachersCount = computed(() => this.effectiveTeacherIds().size);

  /** Mover en el transfer list: nunca toca Firestore directo, solo el borrador local. */
  protected onAddSubjects(subjectIds: string[]): void {
    const next = new Set(this.effectiveSubjectIds());
    subjectIds.forEach((id) => next.add(id));
    this.draftSubjectIds.set(next);
  }

  protected onRemoveSubjects(subjectIds: string[]): void {
    const next = new Set(this.effectiveSubjectIds());
    subjectIds.forEach((id) => next.delete(id));
    this.draftSubjectIds.set(next);
  }

  protected onAddStudents(studentUids: string[]): void {
    const next = new Set(this.effectiveStudentIds());
    studentUids.forEach((id) => next.add(id));
    this.draftStudentIds.set(next);
  }

  protected onRemoveStudents(studentUids: string[]): void {
    const next = new Set(this.effectiveStudentIds());
    studentUids.forEach((id) => next.delete(id));
    this.draftStudentIds.set(next);
  }

  protected onAddTeachers(teacherIds: string[]): void {
    const next = new Set(this.effectiveTeacherIds());
    teacherIds.forEach((id) => next.add(id));
    this.draftTeacherIds.set(next);
  }

  protected onRemoveTeachers(teacherIds: string[]): void {
    const next = new Set(this.effectiveTeacherIds());
    teacherIds.forEach((id) => next.delete(id));
    this.draftTeacherIds.set(next);
  }

  /** Etiquetas legibles de qué cambió, para el resumen antes de guardar. */
  protected readonly pendingSummary = computed<PendingSummary>(() => {
    const liveSubjectIds = new Set(this.courseSubjects().map((cs) => cs.subjectId));
    const liveStudentIds = new Set(this.courseStudents().map((cs) => cs.studentUid));
    const liveTeacherIds = new Set(this.courseTeachers().map((ct) => ct.teacherId));
    const finalSubjectIds = this.effectiveSubjectIds();
    const finalStudentIds = this.effectiveStudentIds();
    const finalTeacherIds = this.effectiveTeacherIds();

    const subjectLabel = (id: string) => {
      const subject = this.subjectsService.subjects().find((s) => s.id === id);
      return subject ? `${subject.code} · ${subject.name}` : id;
    };
    const studentLabel = (id: string) => {
      const student = this.students().find((s) => s.uid === id);
      return student?.displayName ?? student?.email ?? id;
    };
    const teacherLabel = (id: string) => {
      const teacher = this.teachers().find((t) => t.uid === id);
      return teacher?.displayName ?? teacher?.email ?? id;
    };

    return {
      subjectsAdded: [...finalSubjectIds].filter((id) => !liveSubjectIds.has(id)).map(subjectLabel),
      subjectsRemoved: [...liveSubjectIds]
        .filter((id) => !finalSubjectIds.has(id))
        .map(subjectLabel),
      studentsAdded: [...finalStudentIds].filter((id) => !liveStudentIds.has(id)).map(studentLabel),
      studentsRemoved: [...liveStudentIds]
        .filter((id) => !finalStudentIds.has(id))
        .map(studentLabel),
      teachersAdded: [...finalTeacherIds].filter((id) => !liveTeacherIds.has(id)).map(teacherLabel),
      teachersRemoved: [...liveTeacherIds]
        .filter((id) => !finalTeacherIds.has(id))
        .map(teacherLabel),
    };
  });

  /** Público: lo lee `unsavedCourseChangesGuard` (canDeactivate) desde fuera del componente. */
  readonly hasPendingChanges = computed(() => {
    const s = this.pendingSummary();
    return (
      s.subjectsAdded.length > 0 ||
      s.subjectsRemoved.length > 0 ||
      s.studentsAdded.length > 0 ||
      s.studentsRemoved.length > 0 ||
      s.teachersAdded.length > 0 ||
      s.teachersRemoved.length > 0
    );
  });

  protected readonly showSaveSummary = signal(false);
  protected readonly savingChanges = signal(false);

  protected discardChanges(): void {
    this.draftSubjectIds.set(null);
    this.draftStudentIds.set(null);
    this.draftTeacherIds.set(null);
  }

  /**
   * Aplica el borrador completo: primero limpia `courseSubjectTeachers` de
   * lo que se va (materia removida o profesor removido, cualquiera de las
   * dos gatilla la limpieza — mismo criterio que antes, ahora unificado),
   * después el resto de las quitas y altas, y al final reconcilia
   * "profesor único" UNA sola vez sobre el estado ya guardado (antes corría
   * una vez por cada agregar-materia y otra vez por cada agregar-profesor).
   */
  protected async applyChanges(): Promise<void> {
    const courseId = this.courseId();
    const liveSubjectIds = new Set(this.courseSubjects().map((cs) => cs.subjectId));
    const liveStudentIds = new Set(this.courseStudents().map((cs) => cs.studentUid));
    const liveTeacherIds = new Set(this.courseTeachers().map((ct) => ct.teacherId));
    const finalSubjectIds = this.effectiveSubjectIds();
    const finalStudentIds = this.effectiveStudentIds();
    const finalTeacherIds = this.effectiveTeacherIds();

    const subjectsToAdd = [...finalSubjectIds].filter((id) => !liveSubjectIds.has(id));
    const subjectsToRemove = this.courseSubjects().filter(
      (cs) => !finalSubjectIds.has(cs.subjectId),
    );
    const studentsToAdd = [...finalStudentIds].filter((id) => !liveStudentIds.has(id));
    const studentsToRemove = this.courseStudents().filter(
      (cs) => !finalStudentIds.has(cs.studentUid),
    );
    const teachersToAdd = [...finalTeacherIds].filter((id) => !liveTeacherIds.has(id));
    const teachersToRemove = this.courseTeachers().filter(
      (ct) => !finalTeacherIds.has(ct.teacherId),
    );

    this.savingChanges.set(true);
    try {
      const removedSubjectIds = new Set(subjectsToRemove.map((cs) => cs.subjectId));
      const removedTeacherIds = new Set(teachersToRemove.map((ct) => ct.teacherId));
      const staleAssignments = this.courseSubjectTeachersService
        .forCourse(courseId)
        .filter(
          (row) => removedSubjectIds.has(row.subjectId) || removedTeacherIds.has(row.teacherId),
        );
      await Promise.all(
        staleAssignments.map((row) => this.courseSubjectTeachersService.unassign(row)),
      );

      await Promise.all([
        ...subjectsToRemove.map((cs) => this.courseSubjectsService.unassign(cs.id)),
        ...studentsToRemove.map((cs) => this.courseStudentsService.unassign(cs.id)),
        ...teachersToRemove.map((ct) => this.courseTeachersService.unassign(ct.id)),
      ]);

      await Promise.all([
        ...subjectsToAdd.map((subjectId) => {
          const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
          return subject
            ? this.courseSubjectsService.assign(courseId, subjectId, subject.name, subject.code)
            : Promise.resolve();
        }),
        ...studentsToAdd.map((studentUid) => {
          const student = this.students().find((s) => s.uid === studentUid);
          return student
            ? this.courseStudentsService.assign(
                courseId,
                studentUid,
                student.displayName ?? student.email ?? studentUid,
              )
            : Promise.resolve();
        }),
        ...teachersToAdd.map((teacherId) => {
          const teacher = this.teachers().find((t) => t.uid === teacherId);
          return teacher
            ? this.courseTeachersService.assign(
                courseId,
                teacherId,
                teacher.displayName ?? teacher.email ?? teacherId,
              )
            : Promise.resolve();
        }),
      ]);

      if (finalTeacherIds.size === 1) {
        const soleTeacherId = [...finalTeacherIds][0];
        const teacher = this.teachers().find((t) => t.uid === soleTeacherId);
        if (teacher) {
          const currentAssignments = await this.courseSubjectTeachersService.fetchForCourseIds([
            courseId,
          ]);
          const assignedSubjectIds = new Set(currentAssignments.map((a) => a.subjectId));
          const unassignedSubjectIds = [...finalSubjectIds].filter(
            (id) => !assignedSubjectIds.has(id),
          );
          await Promise.all(
            unassignedSubjectIds.map((subjectId) =>
              this.courseSubjectTeachersService.assign(
                courseId,
                subjectId,
                soleTeacherId,
                teacher.displayName ?? teacher.email ?? soleTeacherId,
              ),
            ),
          );
        }
      }

      this.draftSubjectIds.set(null);
      this.draftStudentIds.set(null);
      this.draftTeacherIds.set(null);
      this.showSaveSummary.set(false);
      this.toast.success(this.i18n.t('adminCourses', 'changesSaved'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.savingChanges.set(false);
    }
  }

  private leaveResolver: ((canLeave: boolean) => void) | null = null;
  protected readonly confirmingLeave = signal(false);

  /** Público: lo llama `unsavedCourseChangesGuard` (canDeactivate en app.routes.ts) desde fuera del componente. */
  confirmLeaveWithUnsavedChanges(): Promise<boolean> {
    this.confirmingLeave.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveResolver = resolve;
    });
  }

  protected resolveLeave(leave: boolean): void {
    this.confirmingLeave.set(false);
    if (leave) {
      this.discardChanges();
    }
    this.leaveResolver?.(leave);
    this.leaveResolver = null;
  }

  protected setTab(tab: Tab): void {
    this.tabOverride.set(tab);
  }

  protected goBack(): void {
    this.router.navigate(['/admin/courses']);
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
