import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CourseSubjectTeachersService } from '../../../core/courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CoursesService } from '../../../core/courses/courses.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { SubjectsService } from '../../../core/subjects/subjects.service';
import type { Subject } from '../../../core/subjects/subjects.model';
import { Button } from '../../../shared/components/button/button';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Loading } from '../../../shared/components/loading/loading';
import { Modal } from '../../../shared/components/modal/modal';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import { ToastService } from '../../../shared/toast/toast.service';

interface SubjectOffering {
  courseId: string;
  courseName: string;
  teacherName: string | null;
}

/** Panel de admin: crear/editar materias. Quién las dicta se asigna desde acá (modal "Gestionar") o desde Cursos. */
@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [Button, ConfirmDialog, Loading, Modal, Page, PageHeader, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subjects.html',
})
export class AdminSubjects {
  protected readonly subjectsService = inject(SubjectsService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly coursesService = inject(CoursesService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);

  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);
  protected readonly confirmingRemoveSubject = signal<Subject | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editCode = signal('');
  protected readonly savingEdit = signal(false);

  protected readonly managingSubject = signal<Subject | null>(null);
  protected readonly addingCourseId = signal<string | undefined>(undefined);
  protected readonly addingToCourse = signal(false);

  /** Cursos donde esta materia ya se dicta, con el nombre del curso y el profesor asignado (si hay). */
  protected readonly offeringsForManaging = computed<SubjectOffering[]>(() => {
    const subject = this.managingSubject();
    if (!subject) {
      return [];
    }
    const courses = this.coursesService.courses();
    const teacherRows = this.courseSubjectTeachersService.rows();
    return this.courseSubjectsService.forSubject(subject.id).map((cs) => ({
      courseId: cs.courseId,
      courseName: courses.find((c) => c.id === cs.courseId)?.name ?? cs.courseId,
      teacherName:
        teacherRows.find((r) => r.courseId === cs.courseId && r.subjectId === subject.id)
          ?.teacherName ?? null,
    }));
  });

  /** Cursos que todavía NO dictan esta materia, para el selector "agregar a un curso nuevo". */
  protected readonly coursesWithoutSubjectOptions = computed<SelectOption<string>[]>(() => {
    const subject = this.managingSubject();
    if (!subject) {
      return [];
    }
    const offeredCourseIds = new Set(
      this.courseSubjectsService.forSubject(subject.id).map((cs) => cs.courseId),
    );
    return this.coursesService
      .courses()
      .filter((course) => !offeredCourseIds.has(course.id))
      .map((course) => ({ value: course.id, label: course.name }));
  });

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
    } catch (error) {
      console.error('[AdminSubjects]', error);
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
    } catch (error) {
      console.error('[AdminSubjects]', error);
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected openManage(subject: Subject): void {
    this.managingSubject.set(subject);
    this.addingCourseId.set(undefined);
  }

  protected closeManage(): void {
    this.managingSubject.set(null);
  }

  protected goToOffering(courseId: string): void {
    const subject = this.managingSubject();
    if (!subject) {
      return;
    }
    this.managingSubject.set(null);
    void this.router.navigate(['/subjects', subject.id, 'gradebook', courseId]);
  }

  protected async addToCourse(): Promise<void> {
    const subject = this.managingSubject();
    const courseId = this.addingCourseId();
    if (!subject || !courseId) {
      return;
    }

    this.addingToCourse.set(true);
    try {
      await this.courseSubjectsService.assign(courseId, subject.id, subject.name, subject.code);
      this.toast.success(this.i18n.t('adminSubjects', 'manageAddSuccess'));
      this.goToOffering(courseId);
    } catch (error) {
      console.error('[AdminSubjects]', error);
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.addingToCourse.set(false);
    }
  }

  protected async onRemove(subject: Subject): Promise<void> {
    this.removingId.set(subject.id);
    try {
      await this.subjectsService.remove(subject.id);
      this.toast.success(this.i18n.t('adminSubjects', 'deleted'));
    } catch (error) {
      console.error('[AdminSubjects]', error);
      this.toast.error(this.i18n.t('adminSubjects', 'errorGeneric'));
    } finally {
      this.removingId.set(null);
    }
  }
}
