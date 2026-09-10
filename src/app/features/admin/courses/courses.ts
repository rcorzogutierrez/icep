import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { CourseInvitationsService } from '../../../core/invitations/course-invitations.service';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseSubjectsService } from '../../../core/courses/course-subjects.service';
import { CourseTeachersService } from '../../../core/courses/course-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import type { Course } from '../../../core/courses/courses.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { Button } from '../../../shared/components/button/button';
import { InviteCodeCard } from '../../../shared/components/invite-code-card/invite-code-card';
import {
  IconArrowRight,
  IconBookOpen,
  IconGraduationCap,
  IconPlus,
  IconUsers,
} from '../../../shared/icons/icons';
import { ToastService } from '../../../shared/toast/toast.service';

/**
 * `new Date('2026-06-01')` (sin hora) se interpreta como medianoche UTC, no
 * local — en cualquier huso horario detrás de UTC (Latinoamérica) eso
 * corre la fecha mostrada un día para atrás. Agregar la hora fuerza a
 * interpretarlo en el huso local, que es lo que el input `type="date"` ya
 * asume.
 */
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Panel de admin: crear cursos y ver su resumen. La gestión de materias/estudiantes/profesores vive en la página de detalle. */
@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [
    Button,
    DatePipe,
    InviteCodeCard,
    IconArrowRight,
    IconBookOpen,
    IconGraduationCap,
    IconPlus,
    IconUsers,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './courses.html',
})
export class AdminCourses {
  protected readonly coursesService = inject(CoursesService);
  protected readonly courseSubjectsService = inject(CourseSubjectsService);
  protected readonly courseStudentsService = inject(CourseStudentsService);
  protected readonly courseTeachersService = inject(CourseTeachersService);
  protected readonly courseInvitationsService = inject(CourseInvitationsService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly name = signal('');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly creating = signal(false);
  protected readonly removingId = signal<string | null>(null);

  /** Código de invitación del curso recién creado, para mostrarlo ahí mismo (mismo patrón que Invitations.createdCode). */
  protected readonly createdInvitationCode = signal<string | null>(null);
  /** Nombre del curso al que pertenece `createdInvitationCode` — si se crean varios seguidos, deja claro cuál es cuál. */
  protected readonly createdCourseName = signal<string | null>(null);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editStartDate = signal('');
  protected readonly editEndDate = signal('');
  protected readonly savingEdit = signal(false);

  protected subjectsCountFor(courseId: string): number {
    return this.courseSubjectsService.forCourse(courseId).length;
  }

  protected studentsCountFor(courseId: string): number {
    return this.courseStudentsService.forCourse(courseId).length;
  }

  protected teachersCountFor(courseId: string): number {
    return this.courseTeachersService.forCourse(courseId).length;
  }

  /** Ambas fechas cargadas y fin no anterior a inicio (se muestra un toast si no). */
  private datesValid(start: string, end: string): boolean {
    if (!start || !end) {
      return false;
    }
    if (end < start) {
      this.toast.error(this.i18n.t('adminCourses', 'errorDatesInvalid'));
      return false;
    }
    return true;
  }

  /**
   * Crea el curso Y, en el mismo paso, su código de invitación — nada que
   * generar aparte después. Son dos escrituras separadas a propósito: si
   * la primera (el curso) falla, no hay nada más que hacer. Si falla la
   * segunda (el código), el curso YA quedó creado — avisar eso puntual en
   * vez de un error genérico que sugiera "no pasó nada, probá de nuevo"
   * (el código siempre se puede generar después desde Gestionar →
   * Estudiantes, así que esto no bloquea nada).
   */
  protected async onCreate(): Promise<void> {
    const start = this.startDate();
    const end = this.endDate();
    const name = this.name().trim();
    if (!name || !this.datesValid(start, end)) {
      return;
    }
    this.creating.set(true);
    this.createdInvitationCode.set(null);
    this.createdCourseName.set(null);

    let courseId: string;
    try {
      courseId = await this.coursesService.create(name, parseLocalDate(start), parseLocalDate(end));
      this.name.set('');
      this.startDate.set('');
      this.endDate.set('');
      this.toast.success(this.i18n.t('adminCourses', 'created'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
      this.creating.set(false);
      return;
    }

    try {
      const code = await this.courseInvitationsService.create(courseId, name);
      this.createdInvitationCode.set(code);
      this.createdCourseName.set(name);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorInviteGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  protected startEdit(course: Course): void {
    this.editingId.set(course.id);
    this.editName.set(course.name);
    this.editStartDate.set(
      course.startDate ? course.startDate.toDate().toISOString().slice(0, 10) : '',
    );
    this.editEndDate.set(course.endDate ? course.endDate.toDate().toISOString().slice(0, 10) : '');
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(course: Course): Promise<void> {
    const start = this.editStartDate();
    const end = this.editEndDate();
    if (!this.editName().trim() || !this.datesValid(start, end)) {
      return;
    }
    this.savingEdit.set(true);
    try {
      await this.coursesService.update(course.id, {
        name: this.editName().trim(),
        startDate: Timestamp.fromDate(parseLocalDate(start)),
        endDate: Timestamp.fromDate(parseLocalDate(end)),
      });
      this.editingId.set(null);
      this.toast.success(this.i18n.t('adminCourses', 'updated'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.savingEdit.set(false);
    }
  }

  protected async onRemove(course: Course): Promise<void> {
    this.removingId.set(course.id);
    try {
      await this.coursesService.remove(course.id);
      this.toast.success(this.i18n.t('adminCourses', 'deleted'));
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.removingId.set(null);
    }
  }

  protected goToDetail(courseId: string): void {
    this.router.navigate(['/admin/courses', courseId]);
  }
}
