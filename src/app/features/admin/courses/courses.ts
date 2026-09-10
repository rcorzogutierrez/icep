import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import type { CourseInvitation } from '../../../core/invitations/course-invitations.model';
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
  IconQrCode,
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
    IconQrCode,
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

  /**
   * Qué curso muestra el panel de invitación de abajo — no es una "última
   * creada" efímera: se puede volver a ver el código de CUALQUIER curso
   * clickeando su botón "Código" en la fila (antes, crear un segundo curso
   * hacía desaparecer el código del primero sin manera de volver a verlo
   * sin entrar a Gestionar).
   */
  protected readonly selectedCourseId = signal<string | null>(null);
  /** Curso cuyo código se está generando/regenerando ahora mismo (fila o panel, comparten este estado). */
  protected readonly regeneratingCourseId = signal<string | null>(null);
  protected readonly revokingSelectedCode = signal<string | null>(null);

  protected readonly selectedCourse = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.selectedCourseId()),
  );

  /** El código vigente (activo y no vencido) de un curso, si hay uno — usado por cada fila y por el panel. */
  protected activeInvitationFor(courseId: string): CourseInvitation | undefined {
    return this.courseInvitationsService
      .forCourse(courseId)
      .find((inv) => inv.status === 'active' && inv.expiresAt.toMillis() > Date.now());
  }

  /** true si el curso ya tuvo algún código (aunque esté vencido/revocado) — decide "Regenerar" vs "Generar". */
  protected hasInvitationHistory(courseId: string): boolean {
    return this.courseInvitationsService.forCourse(courseId).length > 0;
  }

  /** El código vigente del curso seleccionado, si hay uno. */
  protected readonly selectedInvitation = computed<CourseInvitation | undefined>(() => {
    const courseId = this.selectedCourseId();
    return courseId ? this.activeInvitationFor(courseId) : undefined;
  });

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
   * generar aparte después. No abre el panel automáticamente: se ve
   * clickeando "Código" en la fila, cuando el usuario lo pida. Son dos
   * escrituras separadas a propósito: si la primera (el curso) falla, no
   * hay nada más que hacer. Si falla la segunda (el código), el curso YA
   * quedó creado — avisar eso puntual en vez de un error genérico que
   * sugiera "no pasó nada, probá de nuevo" (el botón "Código" ofrece
   * "Generar" si todavía no hay uno, así que esto no bloquea nada).
   */
  protected async onCreate(): Promise<void> {
    const start = this.startDate();
    const end = this.endDate();
    const name = this.name().trim();
    if (!name || !this.datesValid(start, end)) {
      return;
    }
    this.creating.set(true);

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
      await this.courseInvitationsService.create(courseId, name);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorInviteGeneric'));
    } finally {
      this.creating.set(false);
    }
  }

  /**
   * Selecciona este curso en el panel de abajo. Si ya tiene un código
   * vigente, con eso alcanza (el panel lo muestra solo, reactivo). Si no
   * (nunca tuvo uno, o el que tenía venció/fue revocado), lo genera de una
   * — un solo clic, no "abrir el panel y después apretar Generar".
   */
  protected async onViewInvitation(course: Course): Promise<void> {
    this.selectedCourseId.set(course.id);
    if (this.activeInvitationFor(course.id)) {
      return;
    }
    await this.generateInvitation(course);
  }

  protected async onGenerateForSelected(): Promise<void> {
    const course = this.selectedCourse();
    if (course) {
      await this.generateInvitation(course);
    }
  }

  private async generateInvitation(course: Course): Promise<void> {
    this.regeneratingCourseId.set(course.id);
    try {
      await this.courseInvitationsService.create(course.id, course.name);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.regeneratingCourseId.set(null);
    }
  }

  protected async onRevokeSelected(invitation: CourseInvitation): Promise<void> {
    this.revokingSelectedCode.set(invitation.code);
    try {
      await this.courseInvitationsService.revoke(invitation.code);
    } catch {
      this.toast.error(this.i18n.t('adminCourses', 'errorGeneric'));
    } finally {
      this.revokingSelectedCode.set(null);
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
