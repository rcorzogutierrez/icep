import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import type { Assignment } from '../../../core/grades/assignments.model';
import { AssignmentsService } from '../../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../../core/grades/grade-categories.service';
import { GradesService } from '../../../core/grades/grades.service';
import type { GradeCategory } from '../../../core/grades/grades.model';
import { computeCategoryPercent, computeFinalGrade } from '../../../core/grades/grades.util';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../../core/courses/course-subject-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { Drawer } from '../../../shared/components/drawer/drawer';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
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
    Page,
    PageHeader,
    DecimalPipe,
    IconArrowUpRight,
    IconCheck,
    IconChevronRight,
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
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  protected readonly onlyPending = signal(false);

  protected readonly openStudentUid = signal<string | null>(null);
  protected readonly editingScores = signal<Record<string, string>>({});
  protected readonly savingAssignmentId = signal<string | null>(null);

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
      return { category, percent, singleAssignment };
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
      await this.gradesService.setScore(subjectId, studentUid, assignment.id, score);
      this.editingScores.update((map) => {
        const rest = { ...map };
        delete rest[assignment.id];
        return rest;
      });
    } catch {
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

  protected goBack(): void {
    this.router.navigate(['/my-courses']);
  }

  /** Lleva directo a la pestaña "Estudiantes" de Gestionar — sin esto había que saber que existía /admin/courses y buscarlo ahí. */
  protected goToAddStudent(): void {
    this.router.navigate(['/admin/courses', this.courseId()], { queryParams: { tab: 'students' } });
  }
}
