import { DecimalPipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import { GradesService } from '../../core/grades/grades.service';
import type { GradeCategory } from '../../core/grades/grades.model';
import { computeFinalGrade } from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { ToastService } from '../../shared/toast/toast.service';

/** Rúbrica + grilla de notas de una materia. Ver auth.guards.ts::subjectAccessGuard para quién puede entrar. */
@Component({
  selector: 'app-gradebook',
  standalone: true,
  imports: [Button, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gradebook.html',
})
export class Gradebook {
  readonly subjectId = input.required<string>();

  protected readonly subjectsService = inject(SubjectsService);
  protected readonly categoriesService = inject(GradeCategoriesService);
  protected readonly gradesService = inject(GradesService);
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);

  protected readonly subject = computed(() =>
    this.subjectsService.subjects().find((s) => s.id === this.subjectId()),
  );

  protected readonly categories = computed(() =>
    this.categoriesService.forSubject(this.subjectId()),
  );

  protected readonly totalWeight = computed(() =>
    this.categories().reduce((sum, category) => sum + category.weight, 0),
  );

  protected readonly students = computed(() =>
    this.usersService
      .users()
      .filter(
        (user) => user.role === 'student' && user.enrolledSubjectIds.includes(this.subjectId()),
      )
      .sort((a, b) =>
        (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''),
      ),
  );

  protected readonly categoryName = signal('');
  protected readonly categoryWeight = signal<number | null>(null);
  protected readonly creatingCategory = signal(false);

  protected readonly editingCategoryId = signal<string | null>(null);
  protected readonly editCategoryName = signal('');
  protected readonly editCategoryWeight = signal<number | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly removingCategoryId = signal<string | null>(null);

  protected finalGradeFor(studentUid: string): number | null {
    const grade = this.gradesService
      .forSubject(this.subjectId())
      .find((g) => g.studentUid === studentUid);
    return computeFinalGrade(this.categories(), grade?.scores);
  }

  protected scoreFor(studentUid: string, categoryId: string): number | null {
    return this.gradesService.scoreFor(this.subjectId(), studentUid, categoryId);
  }

  protected async onSetScore(
    studentUid: string,
    categoryId: string,
    rawValue: string,
  ): Promise<void> {
    const trimmed = rawValue.trim();
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      this.toast.error(this.i18n.t('gradebook', 'invalidScore'));
      return;
    }
    try {
      await this.gradesService.setScore(this.subjectId(), studentUid, categoryId, score);
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
      await this.categoriesService.create(this.subjectId(), this.categoryName(), weight);
      this.categoryName.set('');
      this.categoryWeight.set(null);
    } catch {
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.creatingCategory.set(false);
    }
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

  protected goBack(): void {
    this.location.back();
  }
}
