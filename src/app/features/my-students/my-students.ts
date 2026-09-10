import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import { GradesService } from '../../core/grades/grades.service';
import type { GradeCategory } from '../../core/grades/grades.model';
import { computeCategoryPercent, computeFinalGrade } from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { CoursesService } from '../../core/courses/courses.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../core/courses/course-subjects.service';
import { SubjectAssignmentsService } from '../../core/subjects/subject-assignments.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { Drawer } from '../../shared/components/drawer/drawer';
import { Select, type SelectOption } from '../../shared/components/select/select';
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconSearch,
} from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

/** Rango de color para una nota final, mismo criterio visual que la rúbrica (ver gradebook.html). */
type GradeBand = 'active' | 'paused' | 'expired' | 'muted';

interface SubjectProgress {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  finalGrade: number | null;
}

interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  /** Cursos en los que está el estudiante (puede ser más de uno: ver CourseStudent). */
  courseNames: string[];
  subjects: SubjectProgress[];
}

/** Categoría de la rúbrica ya resuelta para UN estudiante puntual (ver drawer de detalle). */
interface CategoryRow {
  category: GradeCategory;
  percent: number | null;
  /** Solo presente si la categoría es "de una sola nota" (ver GradeCategory.hasMultipleTasks). */
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
    Select,
    DecimalPipe,
    IconArrowUpRight,
    IconCheck,
    IconChevronRight,
    IconSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-students.html',
})
export class MyStudents {
  private readonly authService = inject(AuthService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  protected readonly subjectsService = inject(SubjectsService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly usersService = inject(UsersService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly gradesService = inject(GradesService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  protected readonly subjectFilter = signal<string | undefined>(undefined);
  protected readonly onlyPending = signal(false);

  protected readonly openStudentUid = signal<string | null>(null);
  protected readonly editingScores = signal<Record<string, string>>({});
  protected readonly savingAssignmentId = signal<string | null>(null);

  protected readonly loading = computed(
    () =>
      this.subjectAssignmentsService.loading() ||
      this.subjectsService.loading() ||
      this.coursesService.loading() ||
      this.courseSubjectsService.loading() ||
      this.courseStudentsService.loading() ||
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

      const courseIds = this.courseSubjectsService.forSubject(subjectId).map((cs) => cs.courseId);
      const courseStudents = this.courseStudentsService.forCourseIds(courseIds);
      const studentUids = new Set(courseStudents.map((cs) => cs.studentUid));

      for (const cs of courseStudents) {
        const ids = courseIdsByUid.get(cs.studentUid) ?? new Set<string>();
        ids.add(cs.courseId);
        courseIdsByUid.set(cs.studentUid, ids);
      }

      const categories = this.gradeCategoriesService.forSubject(subjectId);
      const assignments = this.assignmentsService.forSubject(subjectId);
      const grades = this.gradesService.forSubject(subjectId);

      for (const studentUid of studentUids) {
        const user = this.usersService
          .users()
          .find((u) => u.uid === studentUid && u.role === 'student');
        if (!user) {
          continue;
        }

        const grade = grades.find((g) => g.studentUid === studentUid);
        const finalGrade = computeFinalGrade(categories, assignments, grade?.scores);

        const row = rowsByUid.get(studentUid) ?? {
          uid: studentUid,
          displayName: user.displayName ?? user.email ?? studentUid,
          email: user.email ?? '',
          courseNames: [],
          subjects: [],
        };
        row.subjects.push({
          subjectId,
          subjectCode: subject.code,
          subjectName: subject.name,
          finalGrade,
        });
        rowsByUid.set(studentUid, row);
      }
    }

    const courseNameById = new Map(this.coursesService.courses().map((c) => [c.id, c.name]));
    for (const row of rowsByUid.values()) {
      row.courseNames = [...(courseIdsByUid.get(row.uid) ?? [])]
        .map((id) => courseNameById.get(id) ?? id)
        .sort((a, b) => a.localeCompare(b));
    }

    return [...rowsByUid.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  protected readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const subjectId = this.subjectFilter();
    const onlyPending = this.onlyPending();

    return this.studentRows()
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
    this.router.navigate(['/subjects', subjectId, 'gradebook']);
  }
}
