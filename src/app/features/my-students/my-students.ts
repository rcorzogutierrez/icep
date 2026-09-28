import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import type { GradeComment } from '../../core/grades/grade-comments.model';
import { GradeCommentsService } from '../../core/grades/grade-comments.service';
import { GradeHistoryService } from '../../core/grades/grade-history.service';
import { GradesService } from '../../core/grades/grades.service';
import type { GradeCategory } from '../../core/grades/grades.model';
import {
  computeCategoryPercent,
  computeFinalGrade,
  creditLetterFor as computeCreditLetter,
  gradeBand as computeGradeBand,
  gradeCreditStatus,
  isFullyGraded,
  type GradeBand,
  type GradeCreditStatus,
  type GradeLetter,
} from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { CoursesService } from '../../core/courses/courses.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../core/courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../../core/courses/course-subjects.service';
import { SubjectAssignmentsService } from '../../core/subjects/subject-assignments.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { Drawer } from '../../shared/components/drawer/drawer';
import { GradeStatusBadge } from '../../shared/components/grade-status-badge/grade-status-badge';
import { Loading } from '../../shared/components/loading/loading';
import { Modal } from '../../shared/components/modal/modal';
import { Select, type SelectOption } from '../../shared/components/select/select';
import { SubjectGradeChip } from '../../shared/components/subject-grade-chip/subject-grade-chip';
import { Page } from '../../shared/layout/page/page';
import { PageHeader } from '../../shared/layout/page-header/page-header';
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconHistory,
  IconSearch,
} from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

interface SubjectProgress {
  /** Curso puntual de esta oferta — un estudiante en dos cursos que ofrecen la misma materia tiene DOS SubjectProgress, uno por curso. */
  courseId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  finalGrade: number | null;
  /** false si la materia todavía no tiene ninguna categoría de rúbrica creada — distinto de "tiene rúbrica pero sin notas cargadas". */
  hasRubric: boolean;
  /** true solo si TODA la rúbrica está calificada — ver isFullyGraded en grades.util.ts. */
  fullyGraded: boolean;
}

interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  /** Cursos en los que está el estudiante (puede ser más de uno: ver CourseStudent). */
  courseNames: string[];
  subjects: SubjectProgress[];
  /** true si ALGUNO de sus cursos con este profesor todavía no terminó (ver isCourseActive) — decide en qué pestaña aparece. */
  isActive: boolean;
}

/** Categoría de la rúbrica ya resuelta para UN estudiante puntual (ver drawer de detalle). */
interface CategoryRow {
  category: GradeCategory;
  percent: number | null;
  /** Solo presente si la categoría es "de una sola nota" (ver GradeCategory.hasMultipleTasks). */
  singleAssignment: Assignment | null;
  /** Tareas de la categoría cuando es "con varias tareas" — vacío en una "de una sola nota". Se califican inline acá mismo, sin salir del drawer. */
  assignments: Assignment[];
}

/**
 * "Mis estudiantes": todos los estudiantes del profesor logueado, a través
 * de todas sus materias (no materia por materia como en Gradebook), con su
 * progreso y una vía rápida para calificar categorías "de una sola nota"
 * sin entrar a la grilla completa. Ver auth.guards.ts::staffGuard.
 */
@Component({
  selector: 'app-my-students',
  standalone: true,
  imports: [
    Button,
    Drawer,
    GradeStatusBadge,
    Loading,
    Modal,
    Select,
    SubjectGradeChip,
    Page,
    PageHeader,
    DecimalPipe,
    DatePipe,
    IconArrowRight,
    IconArrowUpRight,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconHistory,
    IconSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-students.html',
})
export class MyStudents {
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  protected readonly subjectsService = inject(SubjectsService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  protected readonly usersService = inject(UsersService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly gradesService = inject(GradesService);
  protected readonly gradeHistoryService = inject(GradeHistoryService);
  protected readonly gradeCommentsService = inject(GradeCommentsService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  protected readonly subjectFilter = signal<string | undefined>(undefined);
  protected readonly onlyPending = signal(false);
  /** "Cursando" primero por defecto — es lo que un profesor quiere ver al entrar, no el historial. */
  protected readonly courseTab = signal<'active' | 'finished'>('active');

  protected readonly openStudentUid = signal<string | null>(null);
  protected readonly editingScores = signal<Record<string, string>>({});
  protected readonly savingAssignmentId = signal<string | null>(null);
  /** Borrador del comentario NUEVO por materia, para el estudiante del drawer abierto (ver closeDrawer, que los limpia al cambiar de estudiante). */
  protected readonly newCommentDrafts = signal<Record<string, string>>({});
  protected readonly newCommentCategoryDrafts = signal<Record<string, string | undefined>>({});
  protected readonly addingCommentSubjectId = signal<string | null>(null);
  /** Acordeón: una sola materia expandida a la vez dentro del drawer — arranca cerrado, ver openDrawer/closeDrawer. */
  protected readonly expandedSubjectId = signal<string | null>(null);

  protected readonly loading = computed(
    () =>
      this.subjectAssignmentsService.loading() ||
      this.subjectsService.loading() ||
      this.coursesService.loading() ||
      this.courseSubjectsService.loading() ||
      this.courseStudentsService.loading() ||
      this.courseSubjectTeachersService.loading() ||
      this.usersService.loading() ||
      this.gradeCategoriesService.loading() ||
      this.assignmentsService.loading() ||
      this.gradesService.loading(),
  );

  /** Materias que el profesor logueado dicta (subjectAssignments, sin duplicados). */
  private readonly mySubjectIds = computed(() => {
    const uid = this.authService.user()?.uid;
    if (!uid) {
      return [];
    }
    return [
      ...new Set(
        this.subjectAssignmentsService
          .assignments()
          .filter((a) => a.teacherId === uid)
          .map((a) => a.subjectId),
      ),
    ];
  });

  protected readonly mySubjectOptions = computed<SelectOption<string>[]>(() =>
    this.mySubjectIds()
      .map((id) => this.subjectsService.subjects().find((s) => s.id === id))
      .filter((subject) => subject !== undefined)
      .map((subject) => ({ value: subject.id, label: `${subject.code} · ${subject.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  /**
   * Cursos de una materia que puede ver el profesor logueado: el admin ve
   * todos; un profesor SOLO los cursos donde él mismo la dicta —
   * `subjectAssignments` (de donde sale `mySubjectIds`) es global a la
   * materia, no por curso, así que sin este filtro un profesor vería (y
   * podría calificar) a estudiantes de otro curso donde la misma materia
   * la dicta un profesor distinto. Mismo criterio que
   * Gradebook.accessibleCourseIds.
   */
  private accessibleCourseIdsFor(subjectId: string): string[] {
    const allCourseIds = this.courseSubjectsService.forSubject(subjectId).map((cs) => cs.courseId);
    if (this.userProfileService.isAdmin()) {
      return allCourseIds;
    }
    const uid = this.authService.user()?.uid;
    const myCourseIds = new Set(
      this.courseSubjectTeachersService
        .rows()
        .filter((r) => r.subjectId === subjectId && r.teacherId === uid)
        .map((r) => r.courseId),
    );
    return allCourseIds.filter((id) => myCourseIds.has(id));
  }

  /** Sin `endDate` (cursos viejos) o curso no encontrado: se considera activo por defecto, no finalizado. */
  private isCourseActive(courseId: string): boolean {
    const endDate = this.coursesService.courses().find((c) => c.id === courseId)?.endDate;
    return !endDate || endDate.toDate().getTime() >= Date.now();
  }

  /** Todos los estudiantes del profesor, con su progreso en cada materia compartida. */
  protected readonly studentRows = computed<StudentRow[]>(() => {
    const rowsByUid = new Map<string, StudentRow>();
    // Un estudiante puede estar en más de un curso a la vez (ver CourseStudent);
    // se acumula acá para no perderlo al reducir a studentUids más abajo.
    const courseIdsByUid = new Map<string, Set<string>>();

    for (const subjectId of this.mySubjectIds()) {
      const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
      if (!subject) {
        continue;
      }

      // Por curso, no por materia sola: la rúbrica/notas son de la oferta de
      // curso (ver GradeCategory.courseId), así que un estudiante en DOS
      // cursos que ofrecen la misma materia tiene DOS SubjectProgress, no
      // una mezclada.
      for (const courseId of this.accessibleCourseIdsFor(subjectId)) {
        const courseStudents = this.courseStudentsService.forCourse(courseId);
        const categories = this.gradeCategoriesService.forCourseSubject(courseId, subjectId);
        const assignments = this.assignmentsService.forCourseSubject(courseId, subjectId);
        const grades = this.gradesService.forCourseSubject(courseId, subjectId);

        for (const cs of courseStudents) {
          const ids = courseIdsByUid.get(cs.studentUid) ?? new Set<string>();
          ids.add(cs.courseId);
          courseIdsByUid.set(cs.studentUid, ids);

          const user = this.usersService
            .users()
            .find((u) => u.uid === cs.studentUid && u.role === 'student');
          if (!user) {
            continue;
          }

          const grade = grades.find((g) => g.studentUid === cs.studentUid);
          const finalGrade = computeFinalGrade(categories, assignments, grade?.scores);

          const row = rowsByUid.get(cs.studentUid) ?? {
            uid: cs.studentUid,
            displayName: user.displayName ?? user.email ?? cs.studentUid,
            email: user.email ?? '',
            courseNames: [],
            subjects: [],
            isActive: true,
          };
          row.subjects.push({
            courseId,
            subjectId,
            subjectCode: subject.code,
            subjectName: subject.name,
            finalGrade,
            hasRubric: categories.length > 0,
            fullyGraded: isFullyGraded(categories, assignments, grade?.scores),
          });
          rowsByUid.set(cs.studentUid, row);
        }
      }
    }

    const courseNameById = new Map(this.coursesService.courses().map((c) => [c.id, c.name]));
    for (const row of rowsByUid.values()) {
      const courseIds = [...(courseIdsByUid.get(row.uid) ?? [])];
      row.courseNames = courseIds
        .map((id) => courseNameById.get(id) ?? id)
        .sort((a, b) => a.localeCompare(b));
      row.isActive = courseIds.length === 0 || courseIds.some((id) => this.isCourseActive(id));
    }

    return [...rowsByUid.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  protected readonly activeCount = computed(
    () => this.studentRows().filter((row) => row.isActive).length,
  );
  protected readonly finishedCount = computed(
    () => this.studentRows().filter((row) => !row.isActive).length,
  );

  protected readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const subjectId = this.subjectFilter();
    const onlyPending = this.onlyPending();
    const tab = this.courseTab();

    return this.studentRows()
      .filter((row) => (tab === 'active' ? row.isActive : !row.isActive))
      .map((row) => ({
        ...row,
        subjects: subjectId ? row.subjects.filter((s) => s.subjectId === subjectId) : row.subjects,
      }))
      .filter((row) => row.subjects.length > 0)
      .filter(
        (row) =>
          !term ||
          row.displayName.toLowerCase().includes(term) ||
          row.email.toLowerCase().includes(term),
      )
      .filter((row) => !onlyPending || row.subjects.some((s) => s.finalGrade === null));
  });

  protected readonly openStudent = computed(() =>
    this.studentRows().find((r) => r.uid === this.openStudentUid()),
  );

  protected gradeBand(grade: number | null): GradeBand {
    return computeGradeBand(grade);
  }

  /**
   * Sin alerta de "curso por vencer" acá a propósito: un mismo estudiante
   * puede estar en más de un curso a la vez (ver StudentRow.courseNames),
   * así que no hay una única fecha fin que aplique — solo se muestra
   * Aprobado/Desaprobado una vez que la rúbrica está completa.
   */
  protected creditStatusFor(subject: SubjectProgress): GradeCreditStatus | null {
    return gradeCreditStatus(subject.fullyGraded, subject.finalGrade, false);
  }

  protected creditLetterFor(subject: SubjectProgress): GradeLetter | null {
    return computeCreditLetter(subject.fullyGraded, subject.finalGrade);
  }

  protected openDrawer(uid: string): void {
    this.openStudentUid.set(uid);
    this.expandedSubjectId.set(null);
  }

  protected closeDrawer(): void {
    this.openStudentUid.set(null);
    this.editingScores.set({});
    this.newCommentDrafts.set({});
    this.newCommentCategoryDrafts.set({});
    this.expandedSubjectId.set(null);
    this.historySubject.set(null);
  }

  /** Oferta de curso cuyo historial de cambios se está mostrando (modal aparte, sobre el drawer). */
  protected readonly historySubject = signal<{
    courseId: string;
    subjectId: string;
    subjectName: string;
  } | null>(null);

  protected readonly historyEntries = computed(() => {
    const subject = this.historySubject();
    const student = this.openStudent();
    return subject && student
      ? this.gradeHistoryService.forStudent(subject.courseId, subject.subjectId, student.uid)
      : [];
  });

  protected openHistory(courseId: string, subjectId: string, subjectName: string): void {
    this.historySubject.set({ courseId, subjectId, subjectName });
  }

  protected closeHistory(): void {
    this.historySubject.set(null);
  }

  /**
   * Clave de las materias del drawer (borradores de comentario, acordeón) —
   * `courseId+subjectId`, no solo `subjectId`: un estudiante puede tener la
   * misma materia dos veces en el roster (dos cursos), y cada una necesita
   * su propio borrador/estado de acordeón, no uno compartido.
   */
  protected subjectDraftKey(courseId: string, subjectId: string): string {
    return `${courseId}_${subjectId}`;
  }

  /** Acordeón: abrir una materia cierra la que estaba abierta antes. */
  protected toggleSubject(courseId: string, subjectId: string): void {
    const key = this.subjectDraftKey(courseId, subjectId);
    this.expandedSubjectId.update((current) => (current === key ? null : key));
  }

  /** Rúbrica de una oferta de curso ya resuelta para el estudiante del drawer abierto. */
  protected categoryRowsFor(
    courseId: string,
    subjectId: string,
    studentUid: string,
  ): CategoryRow[] {
    const assignments = this.assignmentsService.forCourseSubject(courseId, subjectId);
    const grade = this.gradesService
      .forCourseSubject(courseId, subjectId)
      .find((g) => g.studentUid === studentUid);

    return this.gradeCategoriesService.forCourseSubject(courseId, subjectId).map((category) => {
      const categoryAssignments = assignments.filter((a) => a.categoryId === category.id);
      const percent = computeCategoryPercent(categoryAssignments, grade?.scores);
      const singleAssignment =
        category.hasMultipleTasks === false ? (categoryAssignments[0] ?? null) : null;
      return {
        category,
        percent,
        singleAssignment,
        assignments: singleAssignment ? [] : categoryAssignments,
      };
    });
  }

  protected inputValueFor(
    courseId: string,
    subjectId: string,
    studentUid: string,
    assignmentId: string,
  ): string {
    const draft = this.editingScores()[assignmentId];
    if (draft !== undefined) {
      return draft;
    }
    const score = this.gradesService.scoreFor(courseId, subjectId, studentUid, assignmentId);
    return score === null ? '' : String(score);
  }

  protected onScoreInput(assignmentId: string, rawValue: string): void {
    this.editingScores.update((map) => ({ ...map, [assignmentId]: rawValue }));
  }

  protected isDirty(
    courseId: string,
    subjectId: string,
    studentUid: string,
    assignmentId: string,
  ): boolean {
    const draft = this.editingScores()[assignmentId];
    if (draft === undefined) {
      return false;
    }
    const saved = this.gradesService.scoreFor(courseId, subjectId, studentUid, assignmentId);
    return draft.trim() !== (saved === null ? '' : String(saved));
  }

  protected async onSaveScore(
    courseId: string,
    subjectId: string,
    studentUid: string,
    assignment: Assignment,
  ): Promise<void> {
    const raw = this.editingScores()[assignment.id];
    if (raw === undefined) {
      return;
    }
    const trimmed = raw.trim();
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > assignment.pointsPossible)) {
      this.toast.error(this.i18n.t('myStudents', 'invalidScore'));
      return;
    }

    this.savingAssignmentId.set(assignment.id);
    try {
      await this.gradesService.setScore(
        courseId,
        subjectId,
        studentUid,
        assignment.id,
        assignment.name,
        score,
      );
      this.editingScores.update((map) => {
        const rest = { ...map };
        delete rest[assignment.id];
        return rest;
      });
      this.toast.success(this.i18n.t('myStudents', 'scoreSaved'));
    } catch (error) {
      console.error('[MyStudents]', error);
      this.toast.error(this.i18n.t('myStudents', 'errorGeneric'));
    } finally {
      this.savingAssignmentId.set(null);
    }
  }

  protected goToGradebook(courseId: string, subjectId: string): void {
    this.router.navigate(['/subjects', subjectId, 'gradebook', courseId]);
  }

  protected commentsFor(courseId: string, subjectId: string, studentUid: string): GradeComment[] {
    return this.gradeCommentsService.forStudent(courseId, subjectId, studentUid);
  }

  protected newCommentTextFor(courseId: string, subjectId: string): string {
    return this.newCommentDrafts()[this.subjectDraftKey(courseId, subjectId)] ?? '';
  }

  protected onNewCommentInput(courseId: string, subjectId: string, value: string): void {
    const key = this.subjectDraftKey(courseId, subjectId);
    this.newCommentDrafts.update((map) => ({ ...map, [key]: value }));
  }

  protected newCommentCategoryFor(courseId: string, subjectId: string): string | undefined {
    return this.newCommentCategoryDrafts()[this.subjectDraftKey(courseId, subjectId)];
  }

  protected onNewCommentCategoryChange(
    courseId: string,
    subjectId: string,
    categoryId: string | undefined,
  ): void {
    const key = this.subjectDraftKey(courseId, subjectId);
    this.newCommentCategoryDrafts.update((map) => ({ ...map, [key]: categoryId }));
  }

  /** Todas las categorías de la oferta de curso (no solo "con varias tareas") — un comentario puede referirse a cualquiera. */
  protected commentCategoryOptionsFor(courseId: string, subjectId: string): SelectOption<string>[] {
    return this.gradeCategoriesService
      .forCourseSubject(courseId, subjectId)
      .map((category) => ({ value: category.id, label: category.name }));
  }

  protected async onAddComment(
    courseId: string,
    subjectId: string,
    studentUid: string,
  ): Promise<void> {
    const key = this.subjectDraftKey(courseId, subjectId);
    const text = (this.newCommentDrafts()[key] ?? '').trim();
    if (!text) {
      return;
    }
    const categoryId = this.newCommentCategoryDrafts()[key] ?? null;
    const categoryName = categoryId
      ? (this.gradeCategoriesService
          .forCourseSubject(courseId, subjectId)
          .find((c) => c.id === categoryId)?.name ?? null)
      : null;
    this.addingCommentSubjectId.set(key);
    try {
      await this.gradeCommentsService.add(
        courseId,
        subjectId,
        studentUid,
        text,
        categoryId,
        categoryName,
      );
      this.newCommentDrafts.update((map) => {
        const rest = { ...map };
        delete rest[key];
        return rest;
      });
      this.newCommentCategoryDrafts.update((map) => {
        const rest = { ...map };
        delete rest[key];
        return rest;
      });
      this.toast.success(this.i18n.t('myStudents', 'commentAdded'));
    } catch (error) {
      console.error('[MyStudents]', error);
      this.toast.error(this.i18n.t('myStudents', 'errorGeneric'));
    } finally {
      this.addingCommentSubjectId.set(null);
    }
  }
}
