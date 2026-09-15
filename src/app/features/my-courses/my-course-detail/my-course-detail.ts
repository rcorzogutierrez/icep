import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import type { Assignment } from '../../../core/grades/assignments.model';
import { AssignmentsService } from '../../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../../core/grades/grade-categories.service';
import type { GradeComment } from '../../../core/grades/grade-comments.model';
import { GradeCommentsService } from '../../../core/grades/grade-comments.service';
import { GradeHistoryService } from '../../../core/grades/grade-history.service';
import { GradesService } from '../../../core/grades/grades.service';
import type { GradeCategory } from '../../../core/grades/grades.model';
import {
  computeCategoryPercent,
  computeFinalGrade,
  daysUntil,
  gradeCreditStatus,
  gradeLetter,
  isCourseEndingSoon,
  isFullyGraded,
  type GradeCreditStatus,
  type GradeLetter,
} from '../../../core/grades/grades.util';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../../core/courses/course-subject-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Drawer } from '../../../shared/components/drawer/drawer';
import { GradeStatusBadge } from '../../../shared/components/grade-status-badge/grade-status-badge';
import { Loading } from '../../../shared/components/loading/loading';
import { Modal } from '../../../shared/components/modal/modal';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconCircleAlert,
  IconHistory,
  IconSearch,
  IconUserPlus,
} from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

type GradeBand = 'active' | 'paused' | 'expired' | 'muted';

interface SubjectProgress {
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
  subjects: SubjectProgress[];
}

/** Categoría de la rúbrica ya resuelta para UN estudiante puntual (ver drawer de detalle). */
interface CategoryRow {
  category: GradeCategory;
  percent: number | null;
  singleAssignment: Assignment | null;
  /** Tareas de la categoría cuando es "con varias tareas" — vacío en una "de una sola nota" (ver singleAssignment). Se califican inline acá mismo, sin salir del drawer. */
  assignments: Assignment[];
}

function gradeBand(grade: number | null): GradeBand {
  if (grade === null) {
    return 'muted';
  }
  if (grade >= 90) {
    return 'active';
  }
  if (grade >= 70) {
    return 'paused';
  }
  return 'expired';
}

/**
 * Roster de UN curso puntual: sus estudiantes, con su progreso SOLO en las
 * materias que el profesor logueado dicta en ESTE curso (no todas las del
 * curso — mismo criterio que courseAccessGuard). Contraparte "por curso" de
 * Mis estudiantes (que es "todas mis materias, sin importar el curso"); ver
 * my-students.ts para el mismo patrón de cómputo de progreso.
 */
@Component({
  selector: 'app-my-course-detail',
  standalone: true,
  imports: [
    Button,
    Drawer,
    GradeStatusBadge,
    Loading,
    Modal,
    Select,
    Page,
    PageHeader,
    DecimalPipe,
    DatePipe,
    IconArrowRight,
    IconArrowUpRight,
    IconCheck,
    IconChevronRight,
    IconCircleAlert,
    IconHistory,
    IconSearch,
    IconUserPlus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-course-detail.html',
})
export class MyCourseDetail {
  readonly courseId = input.required<string>();

  private readonly authService = inject(AuthService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  protected readonly subjectsService = inject(SubjectsService);
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
  protected readonly onlyPending = signal(false);

  protected readonly openStudentUid = signal<string | null>(null);
  protected readonly editingScores = signal<Record<string, string>>({});
  protected readonly savingAssignmentId = signal<string | null>(null);
  /** Borrador del comentario NUEVO por materia, para el estudiante del drawer abierto (ver closeDrawer, que los limpia al cambiar de estudiante). */
  protected readonly newCommentDrafts = signal<Record<string, string>>({});
  protected readonly newCommentCategoryDrafts = signal<Record<string, string | undefined>>({});
  protected readonly addingCommentSubjectId = signal<string | null>(null);

  protected readonly loading = computed(
    () =>
      this.coursesService.loading() ||
      this.courseStudentsService.loading() ||
      this.courseSubjectTeachersService.loading() ||
      this.usersService.loading() ||
      this.gradeCategoriesService.loading() ||
      this.assignmentsService.loading() ||
      this.gradesService.loading(),
  );

  protected readonly course = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.courseId()),
  );

  /** null si el curso todavía no tiene fecha fin cargada (cursos viejos, ver Course.endDate). */
  protected readonly daysUntilCourseEnd = computed(() => {
    const endDate = this.course()?.endDate;
    return endDate ? daysUntil(endDate.toDate()) : null;
  });

  protected readonly courseEndingSoon = computed(() =>
    isCourseEndingSoon(this.course()?.endDate?.toDate() ?? null),
  );

  /** Cuántas materias (de todos los estudiantes de este curso) siguen sin nota final estando el curso por vencer. */
  protected readonly unfinishedCount = computed(() =>
    this.studentRows().reduce(
      (sum, row) =>
        sum + row.subjects.filter((s) => this.creditStatusFor(s) === 'unfinished').length,
      0,
    ),
  );

  protected creditStatusFor(subject: SubjectProgress): GradeCreditStatus | null {
    return gradeCreditStatus(subject.fullyGraded, subject.finalGrade, this.courseEndingSoon());
  }

  protected creditLetterFor(subject: SubjectProgress): GradeLetter | null {
    return subject.fullyGraded && subject.finalGrade !== null
      ? gradeLetter(subject.finalGrade)
      : null;
  }

  /** Materias de este curso que el profesor logueado dicta acá (no todas las del curso). */
  private readonly mySubjectIds = computed(() => {
    const uid = this.authService.user()?.uid;
    if (!uid) {
      return [];
    }
    return [
      ...new Set(
        this.courseSubjectTeachersService
          .forCourse(this.courseId())
          .filter((r) => r.teacherId === uid)
          .map((r) => r.subjectId),
      ),
    ];
  });

  /** Estudiantes del curso, con su progreso en cada materia que comparten con el profesor. */
  protected readonly studentRows = computed<StudentRow[]>(() => {
    const roster = this.courseStudentsService.forCourse(this.courseId());
    const rowsByUid = new Map<string, StudentRow>();

    for (const subjectId of this.mySubjectIds()) {
      const subject = this.subjectsService.subjects().find((s) => s.id === subjectId);
      if (!subject) {
        continue;
      }

      const categories = this.gradeCategoriesService.forSubject(subjectId);
      const assignments = this.assignmentsService.forSubject(subjectId);
      const grades = this.gradesService.forSubject(subjectId);

      for (const cs of roster) {
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
          subjects: [],
        };
        row.subjects.push({
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

    return [...rowsByUid.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  protected readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const onlyPending = this.onlyPending();

    return this.studentRows()
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
    return gradeBand(grade);
  }

  protected openDrawer(uid: string): void {
    this.openStudentUid.set(uid);
  }

  protected closeDrawer(): void {
    this.openStudentUid.set(null);
    this.editingScores.set({});
    this.newCommentDrafts.set({});
    this.newCommentCategoryDrafts.set({});
    this.historySubject.set(null);
  }

  /** Materia cuyo historial de cambios se está mostrando (modal aparte, sobre el drawer). */
  protected readonly historySubject = signal<{ subjectId: string; subjectName: string } | null>(
    null,
  );

  protected readonly historyEntries = computed(() => {
    const subject = this.historySubject();
    const student = this.openStudent();
    return subject && student
      ? this.gradeHistoryService.forStudent(subject.subjectId, student.uid)
      : [];
  });

  protected openHistory(subjectId: string, subjectName: string): void {
    this.historySubject.set({ subjectId, subjectName });
  }

  protected closeHistory(): void {
    this.historySubject.set(null);
  }

  /** Rúbrica de una materia ya resuelta para el estudiante del drawer abierto. */
  protected categoryRowsFor(subjectId: string, studentUid: string): CategoryRow[] {
    const assignments = this.assignmentsService.forSubject(subjectId);
    const grade = this.gradesService.forSubject(subjectId).find((g) => g.studentUid === studentUid);

    return this.gradeCategoriesService.forSubject(subjectId).map((category) => {
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

  protected inputValueFor(subjectId: string, studentUid: string, assignmentId: string): string {
    const draft = this.editingScores()[assignmentId];
    if (draft !== undefined) {
      return draft;
    }
    const score = this.gradesService.scoreFor(subjectId, studentUid, assignmentId);
    return score === null ? '' : String(score);
  }

  protected onScoreInput(assignmentId: string, rawValue: string): void {
    this.editingScores.update((map) => ({ ...map, [assignmentId]: rawValue }));
  }

  protected isDirty(subjectId: string, studentUid: string, assignmentId: string): boolean {
    const draft = this.editingScores()[assignmentId];
    if (draft === undefined) {
      return false;
    }
    const saved = this.gradesService.scoreFor(subjectId, studentUid, assignmentId);
    return draft.trim() !== (saved === null ? '' : String(saved));
  }

  protected async onSaveScore(
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
    } catch (error) {
      console.error('[MyCourseDetail]', error);
      this.toast.error(this.i18n.t('myStudents', 'errorGeneric'));
    } finally {
      this.savingAssignmentId.set(null);
    }
  }

  protected goToGradebook(subjectId: string): void {
    this.router.navigate(['/subjects', subjectId, 'gradebook'], {
      queryParams: { courseId: this.courseId() },
    });
  }

  protected commentsFor(subjectId: string, studentUid: string): GradeComment[] {
    return this.gradeCommentsService.forStudent(subjectId, studentUid);
  }

  protected newCommentTextFor(subjectId: string): string {
    return this.newCommentDrafts()[subjectId] ?? '';
  }

  protected onNewCommentInput(subjectId: string, value: string): void {
    this.newCommentDrafts.update((map) => ({ ...map, [subjectId]: value }));
  }

  protected newCommentCategoryFor(subjectId: string): string | undefined {
    return this.newCommentCategoryDrafts()[subjectId];
  }

  protected onNewCommentCategoryChange(subjectId: string, categoryId: string | undefined): void {
    this.newCommentCategoryDrafts.update((map) => ({ ...map, [subjectId]: categoryId }));
  }

  /** Todas las categorías de la materia (no solo "con varias tareas") — un comentario puede referirse a cualquiera. */
  protected commentCategoryOptionsFor(subjectId: string): SelectOption<string>[] {
    return this.gradeCategoriesService
      .forSubject(subjectId)
      .map((category) => ({ value: category.id, label: category.name }));
  }

  protected async onAddComment(subjectId: string, studentUid: string): Promise<void> {
    const text = (this.newCommentDrafts()[subjectId] ?? '').trim();
    if (!text) {
      return;
    }
    const categoryId = this.newCommentCategoryDrafts()[subjectId] ?? null;
    const categoryName = categoryId
      ? (this.gradeCategoriesService.forSubject(subjectId).find((c) => c.id === categoryId)?.name ??
        null)
      : null;
    this.addingCommentSubjectId.set(subjectId);
    try {
      await this.gradeCommentsService.add(subjectId, studentUid, text, categoryId, categoryName);
      this.newCommentDrafts.update((map) => {
        const rest = { ...map };
        delete rest[subjectId];
        return rest;
      });
      this.newCommentCategoryDrafts.update((map) => {
        const rest = { ...map };
        delete rest[subjectId];
        return rest;
      });
      this.toast.success(this.i18n.t('myStudents', 'commentAdded'));
    } catch (error) {
      console.error('[MyCourseDetail]', error);
      this.toast.error(this.i18n.t('myStudents', 'errorGeneric'));
    } finally {
      this.addingCommentSubjectId.set(null);
    }
  }

  protected goBack(): void {
    this.router.navigate(['/my-courses']);
  }

  /** Lleva directo a la pestaña "Estudiantes" de Gestionar — sin esto había que saber que existía /admin/courses y buscarlo ahí. */
  protected goToAddStudent(): void {
    this.router.navigate(['/admin/courses', this.courseId()], { queryParams: { tab: 'students' } });
  }
}
