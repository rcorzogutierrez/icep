import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import type { Subject } from '../../../core/subjects/subjects.model';
import { Button } from '../../../shared/components/button/button';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import { ToastService } from '../../../shared/toast/toast.service';

/** Panel de admin: crear/editar materias. Quién las dicta se gestiona desde Cursos, no acá. */
@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [Button, Page, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subjects.html',
})
export class AdminSubjects {
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editCode = signal('');
  protected readonly savingEdit = signal(false);

  /** El código ya existe en otra materia (comparación case-insensitive, excluyendo `excludeId`). */
  private isCodeTaken(code: string, excludeId?: string): boolean {
    const normalized = code.trim().toUpperCase();
    return this.subjectsService
      .subjects()
      .some((subject) => subject.id !== excludeId && subject.code === normalized);
  }

  protected async onCreate(): Promise<void> {
    if (!this.name().trim() || !this.code().trim()) {
      return;
    }
    if (this.isCodeTaken(this.code())) {
      this.toast.error(this.i18n.t('adminSubjects', 'duplicateCode'));
      return;
    }

    this.creating.set(true);
    try {
      await this.subjectsService.create(this.name(), this.code());
      this.name.set('');
      this.code.set('');
      this.toast.success(this.i18n.t('adminSubjects', 'created'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected startEdit(subject: Subject): void {
    this.editingId.set(subject.id);
    this.editName.set(subject.name);
    this.editCode.set(subject.code);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(subject: Subject): Promise<void> {
    if (!this.editName().trim() || !this.editCode().trim()) {
      return;
    }
    if (this.isCodeTaken(this.editCode(), subject.id)) {
      this.toast.error(this.i18n.t('adminSubjects', 'duplicateCode'));
      return;
    }

    this.savingEdit.set(true);
    try {
      await this.subjectsService.update(subject.id, {
        name: this.editName().trim(),
        code: this.editCode().trim().toUpperCase(),
      });
      this.editingId.set(null);
      this.toast.success(this.i18n.t('adminSubjects', 'updated'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected goToGradebook(subject: Subject): void {
    void this.router.navigateByUrl(`/subjects/${subject.id}/gradebook`);
  }

  protected async onRemove(subject: Subject): Promise<void> {
    this.removingId.set(subject.id);
    try {
      await this.subjectsService.remove(subject.id);
      this.toast.success(this.i18n.t('adminSubjects', 'deleted'));
    } catch {
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.removingId.set(null);
    }
  }
}
