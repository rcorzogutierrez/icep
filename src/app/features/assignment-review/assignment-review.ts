import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import { GradesService } from '../../core/grades/grades.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../core/courses/course-subjects.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UsersService } from '../../core/users/users.service';
import {
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
} from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

/** Estado de progreso de una tarea puntual, para el selector "Cambiar tarea". */
type TaskProgress = 'done' | 'partial' | 'empty';

interface TaskOption {
  assignment: Assignment;
  categoryName: string;
  categoryWeight: number;
  gradedCount: number;
  totalCount: number;
  progress: TaskProgress;
}

/**
 * "Revisar tarea": califica UNA tarea puntual (de una categoría "con
 * varias tareas") para TODOS los estudiantes de la materia, en una lista
 * simple — en vez de la grilla completa de Gradebook. Ver
 * auth.guards.ts::subjectAccessGuard para quién puede entrar (mismo
 * criterio que /subjects/:subjectId/gradebook).
 */
@Component({
  selector: 'app-assignment-review',
  standalone: true,
  imports: [
    IconCalendar,
    IconCheck,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assignment-review.html',
})
export class AssignmentReview {
  readonly subjectId = input.required<string>();
  readonly assignmentId = input.required<string>();

  private readonly subjectsService = inject(SubjectsService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly gradesService = inject(GradesService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly search = signal('');
  protected readonly onlyPending = signal(false);
  protected readonly taskPickerOpen = signal(false);

  protected readonly subject = computed(() =>
    this.subjectsService.subjects().find((s) => s.id === this.subjectId()),
  );

  protected readonly assignment = computed(() =>
    this.assignmentsService.assignments().find((a) => a.id === this.assignmentId()),
  );

  protected readonly category = computed(() => {
    const assignment = this.assignment();
    if (!assignment) {
      return undefined;
    }
    return this.gradeCategoriesService.categories().find((c) => c.id === assignment.categoryId);
  });

  /** Categorías "con varias tareas" de la materia — las únicas navegables acá. */
  private readonly multiTaskCategories = computed(() =>
    this.gradeCategoriesService
      .forSubject(this.subjectId())
      .filter((c) => c.hasMultipleTasks !== false),
  );

  protected readonly students = computed(() => {
    const courseIds = this.courseSubjectsService
      .forSubject(this.subjectId())
      .map((cs) => cs.courseId);
    const studentUids = new Set(
      this.courseStudentsService.forCourseIds(courseIds).map((cs) => cs.studentUid),
    );
    return this.usersService
      .users()
      .filter((user) => user.role === 'student' && studentUids.has(user.uid))
      .sort((a, b) =>
        (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''),
      );
  });

  private readonly grades = computed(() => this.gradesService.forSubject(this.subjectId()));

  /** Todas las tareas navegables de la materia, agrupadas por categoría y en orden — para ‹ anterior / siguiente › y el selector. */
  protected readonly taskOptions = computed<TaskOption[]>(() => {
    const totalCount = this.students().length;
    const options: TaskOption[] = [];
    for (const category of this.multiTaskCategories()) {
      for (const assignment of this.assignmentsService.forCategory(category.id)) {
        const gradedCount = this.gradedCountFor(assignment.id);
        options.push({
          assignment,
          categoryName: category.name,
          categoryWeight: category.weight,
          gradedCount,
          totalCount,
          progress: gradedCount === 0 ? 'empty' : gradedCount === totalCount ? 'done' : 'partial',
        });
      }
    }
    return options;
  });

  private readonly currentTaskIndex = computed(() =>
    this.taskOptions().findIndex((t) => t.assignment.id === this.assignmentId()),
  );

  protected readonly previousTask = computed(() => {
    const idx = this.currentTaskIndex();
    return idx > 0 ? this.taskOptions()[idx - 1].assignment : undefined;
  });

  protected readonly nextTask = computed(() => {
    const idx = this.currentTaskIndex();
    const options = this.taskOptions();
    return idx >= 0 && idx < options.length - 1 ? options[idx + 1].assignment : undefined;
  });

  /** taskOptions() agrupadas por categoría, en el mismo orden, para el selector "Cambiar tarea". */
  protected readonly groupedTaskOptions = computed(() => {
    const groups: { categoryName: string; categoryWeight: number; tasks: TaskOption[] }[] = [];
    for (const option of this.taskOptions()) {
      let group = groups.find((g) => g.categoryName === option.categoryName);
      if (!group) {
        group = {
          categoryName: option.categoryName,
          categoryWeight: option.categoryWeight,
          tasks: [],
        };
        groups.push(group);
      }
      group.tasks.push(option);
    }
    return groups;
  });

  protected readonly gradedCount = computed(() => this.gradedCountFor(this.assignmentId()));

  protected readonly progressPercent = computed(() => {
    const total = this.students().length;
    return total > 0 ? (this.gradedCount() / total) * 100 : 0;
  });

  protected readonly filteredStudents = computed(() => {
    const term = this.search().trim().toLowerCase();
    const onlyPending = this.onlyPending();
    return this.students()
      .filter(
        (s) =>
          !term ||
          (s.displayName ?? '').toLowerCase().includes(term) ||
          (s.email ?? '').toLowerCase().includes(term),
      )
      .filter((s) => !onlyPending || this.scoreFor(s.uid) === null);
  });

  private gradedCountFor(assignmentId: string): number {
    return this.students().filter((s) => {
      const grade = this.grades().find((g) => g.studentUid === s.uid);
      return grade?.scores[assignmentId] != null;
    }).length;
  }

  protected scoreFor(studentUid: string): number | null {
    return this.gradesService.scoreFor(this.subjectId(), studentUid, this.assignmentId());
  }

  protected async onSetScore(studentUid: string, rawValue: string): Promise<void> {
    const assignment = this.assignment();
    if (!assignment) {
      return;
    }
    const trimmed = rawValue.trim();
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > assignment.pointsPossible)) {
      this.toast.error(this.i18n.t('assignmentReview', 'invalidScore'));
      return;
    }
    try {
      await this.gradesService.setScore(this.subjectId(), studentUid, assignment.id, score);
    } catch {
      this.toast.error(this.i18n.t('assignmentReview', 'errorGeneric'));
    }
  }

  protected dueDateValue(): string {
    const assignment = this.assignment();
    return assignment?.dueDate ? assignment.dueDate.toDate().toISOString().slice(0, 10) : '';
  }

  protected async onSetDueDate(rawValue: string): Promise<void> {
    const assignment = this.assignment();
    if (!assignment) {
      return;
    }
    try {
      await this.assignmentsService.update(assignment.id, {
        dueDate: rawValue ? new Date(rawValue) : null,
      });
    } catch {
      this.toast.error(this.i18n.t('assignmentReview', 'errorGeneric'));
    }
  }

  @HostListener('document:keydown.escape')
  protected closeTaskPicker(): void {
    this.taskPickerOpen.set(false);
  }

  protected toggleTaskPicker(): void {
    this.taskPickerOpen.update((open) => !open);
  }

  protected goToTask(assignmentId: string): void {
    this.taskPickerOpen.set(false);
    this.router.navigate(['/subjects', this.subjectId(), 'assignments', assignmentId, 'review']);
  }

  protected goToGradebook(): void {
    this.router.navigate(['/subjects', this.subjectId(), 'gradebook']);
  }
}
