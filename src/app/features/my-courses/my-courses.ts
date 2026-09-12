import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../core/courses/course-subject-teachers.service';
import { CoursesService } from '../../core/courses/courses.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { UsersService } from '../../core/users/users.service';
import { Page } from '../../shared/layout/page/page';
import { PageHeader } from '../../shared/layout/page-header/page-header';
import {
  IconBookOpen,
  IconChevronRight,
  IconLayers,
  IconSearch,
  IconUsers,
} from '../../shared/icons/icons';

interface MyCourseRow {
  id: string;
  name: string;
  studentCount: number;
  subjectCount: number;
}

/**
 * Punto de entrada "por curso" para un profesor: sus cursos como tarjetas,
 * cada una lleva al roster de ese curso puntual (ver MyCourseDetail).
 * Contraparte de Mis estudiantes (que es "todas mis materias, sin importar
 * el curso") — pensada para cuando hay muchos cursos/estudiantes y buscar
 * a una persona en una tabla plana deja de ser práctico.
 */
@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [
    RouterLink,
    Page,
    PageHeader,
    IconBookOpen,
    IconChevronRight,
    IconLayers,
    IconSearch,
    IconUsers,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-courses.html',
})
export class MyCourses {
  private readonly authService = inject(AuthService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  private readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);

  protected readonly search = signal('');

  protected readonly loading = computed(
    () =>
      this.coursesService.loading() ||
      this.courseStudentsService.loading() ||
      this.courseSubjectTeachersService.loading() ||
      this.usersService.loading(),
  );

  /** Cursos donde el profesor logueado dicta al menos una materia. */
  private readonly myCourseIds = computed(() => {
    const uid = this.authService.user()?.uid;
    if (!uid) {
      return [];
    }
    return [
      ...new Set(
        this.courseSubjectTeachersService
          .rows()
          .filter((r) => r.teacherId === uid)
          .map((r) => r.courseId),
      ),
    ];
  });

  protected readonly courseRows = computed<MyCourseRow[]>(() => {
    const uid = this.authService.user()?.uid;
    return this.myCourseIds()
      .map((courseId) => {
        const course = this.coursesService.courses().find((c) => c.id === courseId);
        if (!course) {
          return null;
        }
        const subjectCount = new Set(
          this.courseSubjectTeachersService
            .forCourse(courseId)
            .filter((r) => r.teacherId === uid)
            .map((r) => r.subjectId),
        ).size;
        // Contar solo filas de courseStudents cuyo uid sigue siendo
        // efectivamente estudiante hoy (mismo criterio que
        // MyCourseDetail.studentRows) — si no, una fila vieja de alguien
        // borrado o reasignado a otro rol infla este número aunque el
        // detalle del curso ya no lo muestre en ningún lado.
        const studentCount = this.courseStudentsService
          .forCourse(courseId)
          .filter((cs) =>
            this.usersService.users().some((u) => u.uid === cs.studentUid && u.role === 'student'),
          ).length;
        return {
          id: course.id,
          name: course.name,
          studentCount,
          subjectCount,
        };
      })
      .filter((row): row is MyCourseRow => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.courseRows().filter((row) => !term || row.name.toLowerCase().includes(term));
  });
}
