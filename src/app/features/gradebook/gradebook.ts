import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../core/courses/course-subjects.service';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import { GradesService } from '../../core/grades/grades.service';
import type { GradeCategory } from '../../core/grades/grades.model';
import { computeFinalGrade } from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { Select, type SelectOption } from '../../shared/components/select/select';
import { IconPlus } from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

/** Rúbrica + tareas + grilla de notas de una materia. Ver auth.guards.ts::subjectAccessGuard para quién puede entrar. */
@Component({
  selector: 'app-gradebook',
  standalone: true,
  imports: [Button, Select, IconPlus, DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gradebook.html',
})
export class Gradebook {
  readonly subjectId = input.required<string>();

  protected readonly subjectsService = inject(SubjectsService);
  protected readonly categoriesService = inject(GradeCategoriesService);
  protected readonly assignmentsService = inject(AssignmentsService);
  protected readonly gradesService = inject(GradesService);
  protected readonly usersService = inject(UsersService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected readonly subject = computed(() =>
    this.subjectsService.subjects().find((s) => s.id === this.subjectId()),
  );

  protected readonly categories = computed(() =>
    this.categoriesService.forSubject(this.subjectId()),
  );

  protected readonly totalWeight = computed(() =>
    this.categories().reduce((sum, category) => sum + category.weight, 0),
  );

  protected readonly assignments = computed(() =>
    this.assignmentsService.forSubject(this.subjectId()),
  );

  /** Categorías "con varias tareas" — las únicas que gestionan tareas propias (ver grades.model.ts). */
  protected readonly multiTaskCategories = computed(() =>
    this.categories().filter((category) => category.hasMultipleTasks !== false),
  );

  protected readonly categoryOptions = computed<SelectOption<string>[]>(() =>
    this.multiTaskCategories().map((category) => ({ value: category.id, label: category.name })),
  );

  /** El roster sale de los cursos que incluyen esta materia (ver courses.model.ts), no de una lista suelta por estudiante. */
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

  protected readonly showAddCategoryForm = signal(false);
  protected readonly categoryName = signal('');
  protected readonly categoryWeight = signal<number | null>(null);
  protected readonly categoryHasMultipleTasks = signal(true);
  protected readonly creatingCategory = signal(false);

  protected readonly editingCategoryId = signal<string | null>(null);
  protected readonly editCategoryName = signal('');
  protected readonly editCategoryWeight = signal<number | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly removingCategoryId = signal<string | null>(null);

  protected readonly showAddAssignmentForm = signal(false);
  protected readonly assignmentName = signal('');
  protected readonly assignmentCategoryId = signal<string | undefined>(undefined);
  protected readonly assignmentPoints = signal<number | null>(null);
  protected readonly assignmentDueDate = signal('');
  protected readonly creatingAssignment = signal(false);

  protected readonly editingAssignmentId = signal<string | null>(null);
  protected readonly editAssignmentName = signal('');
  protected readonly editAssignmentPoints = signal<number | null>(null);
  protected readonly editAssignmentDueDate = signal('');
  protected readonly savingAssignment = signal(false);
  protected readonly removingAssignmentId = signal<string | null>(null);

  /** Tareas de una categoría, para agruparlas en la lista y en la grilla. */
  protected assignmentsFor(categoryId: string): Assignment[] {
    return this.assignments().filter((a) => a.categoryId === categoryId);
  }

  /**
   * Suma de puntos posibles ya repartidos en las tareas de una categoría.
   * No puede superar el peso de la categoría (ver onCreateAssignment /
   * saveEditAssignment) — así "Tareas" al 40% no puede tener tareas que
   * sumen, por ejemplo, 500 puntos.
   */
  protected categoryPointsUsed(categoryId: string): number {
    return this.assignmentsFor(categoryId).reduce((sum, a) => sum + a.pointsPossible, 0);
  }

  protected finalGradeFor(studentUid: string): number | null {
    const grade = this.gradesService
      .forSubject(this.subjectId())
      .find((g) => g.studentUid === studentUid);
    return computeFinalGrade(this.categories(), this.assignments(), grade?.scores);
  }

  protected scoreFor(studentUid: string, assignmentId: string): number | null {
    return this.gradesService.scoreFor(this.subjectId(), studentUid, assignmentId);
  }

  protected async onSetScore(
    studentUid: string,
    assignment: Assignment,
    rawValue: string,
  ): Promise<void> {
    const trimmed = rawValue.trim();
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > assignment.pointsPossible)) {
      this.toast.error(this.i18n.t('gradebook', 'invalidScore'));
      return;
    }
    try {
      await this.gradesService.setScore(this.subjectId(), studentUid, assignment.id, score);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    }
  }

  protected async onCreateCategory(): Promise<void> {
    const weight = this.categoryWeight();
    if (!this.categoryName().trim() || weight == null || weight <= 0) {
      return;
    }
    if (this.totalWeight() + weight > 100) {
      this.toast.error(this.i18n.t('gradebook', 'weightExceeds'));
      return;
    }

    this.creatingCategory.set(true);
    try {
      await this.categoriesService.create(
        this.subjectId(),
        this.categoryName(),
        weight,
        this.categoryHasMultipleTasks(),
      );
      this.closeAddCategoryForm();
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.creatingCategory.set(false);
    }
  }

  protected openAddCategoryForm(): void {
    this.showAddCategoryForm.set(true);
  }

  protected closeAddCategoryForm(): void {
    this.showAddCategoryForm.set(false);
    this.categoryName.set('');
    this.categoryWeight.set(null);
    this.categoryHasMultipleTasks.set(true);
  }

  protected startEditCategory(category: GradeCategory): void {
    this.editingCategoryId.set(category.id);
    this.editCategoryName.set(category.name);
    this.editCategoryWeight.set(category.weight);
  }

  protected cancelEditCategory(): void {
    this.editingCategoryId.set(null);
  }

  protected async saveEditCategory(category: GradeCategory): Promise<void> {
    const weight = this.editCategoryWeight();
    if (!this.editCategoryName().trim() || weight == null || weight <= 0) {
      return;
    }
    const othersWeight = this.totalWeight() - category.weight;
    if (othersWeight + weight > 100) {
      this.toast.error(this.i18n.t('gradebook', 'weightExceeds'));
      return;
    }

    this.savingCategory.set(true);
    try {
      await this.categoriesService.update(category.id, {
        name: this.editCategoryName().trim(),
        weight,
      });
      this.editingCategoryId.set(null);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.savingCategory.set(false);
    }
  }

  protected async onRemoveCategory(category: GradeCategory): Promise<void> {
    this.removingCategoryId.set(category.id);
    try {
      await this.categoriesService.remove(category.id);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.removingCategoryId.set(null);
    }
  }

  protected async onCreateAssignment(): Promise<void> {
    const categoryId = this.assignmentCategoryId();
    const points = this.assignmentPoints();
    if (!this.assignmentName().trim() || !categoryId || points == null || points <= 0) {
      return;
    }
    const category = this.categories().find((c) => c.id === categoryId);
    if (category && this.categoryPointsUsed(categoryId) + points > category.weight) {
      this.toast.error(this.i18n.t('gradebook', 'taskPointsExceed'));
      return;
    }

    this.creatingAssignment.set(true);
    try {
      await this.assignmentsService.create(
        this.subjectId(),
        categoryId,
        this.assignmentName(),
        points,
        this.assignmentDueDate() ? new Date(this.assignmentDueDate()) : null,
      );
      this.closeAddAssignmentForm();
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.creatingAssignment.set(false);
    }
  }

  protected openAddAssignmentForm(): void {
    this.showAddAssignmentForm.set(true);
  }

  /** No resetea assignmentCategoryId a propósito: al agregar varias tareas seguidas a la misma categoría, conviene que quede seleccionada. */
  protected closeAddAssignmentForm(): void {
    this.showAddAssignmentForm.set(false);
    this.assignmentName.set('');
    this.assignmentPoints.set(null);
    this.assignmentDueDate.set('');
  }

  protected startEditAssignment(assignment: Assignment): void {
    this.editingAssignmentId.set(assignment.id);
    this.editAssignmentName.set(assignment.name);
    this.editAssignmentPoints.set(assignment.pointsPossible);
    this.editAssignmentDueDate.set(
      assignment.dueDate ? assignment.dueDate.toDate().toISOString().slice(0, 10) : '',
    );
  }

  protected cancelEditAssignment(): void {
    this.editingAssignmentId.set(null);
  }

  protected async saveEditAssignment(assignment: Assignment): Promise<void> {
    const points = this.editAssignmentPoints();
    if (!this.editAssignmentName().trim() || points == null || points <= 0) {
      return;
    }
    const category = this.categories().find((c) => c.id === assignment.categoryId);
    const otherPoints = this.categoryPointsUsed(assignment.categoryId) - assignment.pointsPossible;
    if (category && otherPoints + points > category.weight) {
      this.toast.error(this.i18n.t('gradebook', 'taskPointsExceed'));
      return;
    }

    this.savingAssignment.set(true);
    try {
      await this.assignmentsService.update(assignment.id, {
        name: this.editAssignmentName().trim(),
        pointsPossible: points,
        dueDate: this.editAssignmentDueDate() ? new Date(this.editAssignmentDueDate()) : null,
      });
      this.editingAssignmentId.set(null);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.savingAssignment.set(false);
    }
  }

  protected async onRemoveAssignment(assignment: Assignment): Promise<void> {
    this.removingAssignmentId.set(assignment.id);
    try {
      await this.assignmentsService.remove(assignment.id);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.removingAssignmentId.set(null);
    }
  }

  protected goBack(): void {
    this.location.back();
  }

  protected goToReview(assignmentId: string): void {
    this.router.navigate(['/subjects', this.subjectId(), 'assignments', assignmentId, 'review']);
  }
}
