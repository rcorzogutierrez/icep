import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../core/courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../../core/courses/course-subjects.service';
import { CoursesService } from '../../core/courses/courses.service';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import type { GradeComment } from '../../core/grades/grade-comments.model';
import { GradeCommentsService } from '../../core/grades/grade-comments.service';
import type { Grade, GradeCategory } from '../../core/grades/grades.model';
import { GradesService } from '../../core/grades/grades.service';
import {
  computeCategoryPercent,
  computeFinalGrade,
  gradeBand as computeGradeBand,
  gradeCreditStatus,
  gradeLetter,
  isFullyGraded,
  type GradeBand,
  type GradeCreditStatus,
  type GradeLetter,
} from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import type { SubjectResource } from '../../core/subjects/subject-resources.model';
import { SubjectResourcesService } from '../../core/subjects/subject-resources.service';
import type { Subject } from '../../core/subjects/subjects.model';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { GradeStatusBadge } from '../../shared/components/grade-status-badge/grade-status-badge';
import { ResourceCard } from '../../shared/components/resource-card/resource-card';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Page } from '../../shared/layout/page/page';
import { PageHeader } from '../../shared/layout/page-header/page-header';
import {
  IconArrowRight,
  IconBookOpen,
  IconChevronDown,
  IconGraduationCap,
  IconLayers,
  IconMessageSquare,
  IconUserPlus,
  IconUsers,
} from '../../shared/icons/icons';

type StatIcon = 'users' | 'book' | 'mail' | 'graduation';

/**
 * Una materia dictada en un curso puntual, para el estudiante logueado — no
 * "una materia" a secas: si el estudiante repite la misma materia en dos
 * cursos (ej. una recursada), son dos ofertas distintas, cada una con su
 * propia rúbrica/nota/comentarios (ver GradeCategory.courseId). La clave
 * `${courseId}_${subjectId}` (ver `offeringKey`) identifica cada una.
 */
interface CourseOffering {
  courseId: string;
  courseName: string;
  subjectId: string;
}

interface SubjectDetail {
  categories: GradeCategory[];
  assignments: Assignment[];
  grade: Grade | null;
}

interface CategoryBreakdownRow {
  category: GradeCategory;
  percent: number | null;
  /** Vacío para categorías "de una sola nota" (ver GradeCategory.hasMultipleTasks) — no hay tareas individuales que listar. */
  assignments: { assignment: Assignment; score: number | null }[];
  /** Solo para categorías "de una sola nota" — el puntaje crudo que cargó el profesor (ej. "9/10"), no solo el % ya calculado. */
  singleScore: { earned: number | null; possible: number } | null;
}

interface StatCard {
  label: string;
  value: number;
  icon: StatIcon;
  /** Si está, la tarjeta es clickeable y navega ahí — un número sin adónde ir no invita a hacer clic. */
  route?: string;
}

/** Área logueada de la app (solo alcanzable con status "approved", ver approvedGuard). */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    Button,
    GradeStatusBadge,
    ResourceCard,
    Skeleton,
    Page,
    PageHeader,
    DecimalPipe,
    DatePipe,
    IconArrowRight,
    IconUsers,
    IconBookOpen,
    IconUserPlus,
    IconGraduationCap,
    IconLayers,
    IconMessageSquare,
    IconChevronDown,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  /** Cuántas tarjetas placeholder mostrar en el skeleton de "Mis materias" mientras carga — cantidad arbitraria, solo para dar la sensación de grilla. */
  protected readonly skeletonCards = [0, 1];

  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  protected readonly subjectsService = inject(SubjectsService);
  private readonly subjectResourcesService = inject(SubjectResourcesService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  private readonly coursesService = inject(CoursesService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly gradesService = inject(GradesService);
  private readonly gradeCommentsService = inject(GradeCommentsService);
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);

  /** Cada oferta de curso (materia+curso) en la que está matriculado el estudiante — ver CourseOffering. */
  protected readonly mySubjectOfferings = signal<CourseOffering[]>([]);
  /** Catálogo de materias (code/name) de las ofertas de arriba, por `subjectId` — subjects.model.ts no cambia por curso. */
  protected readonly mySubjectCatalog = signal<Map<string, Subject>>(new Map());
  protected readonly mySubjectTeachers = signal<Map<string, string[]>>(new Map());
  protected readonly mySubjectFinalGrades = signal<Map<string, number | null>>(new Map());
  protected readonly mySubjectComments = signal<Map<string, GradeComment[]>>(new Map());
  protected readonly mySubjectDetails = signal<Map<string, SubjectDetail>>(new Map());
  /** Por `subjectId` (no por oferta) — los recursos de materia no se separan por curso, ver subjectResources en CLAUDE.md. */
  protected readonly mySubjectResources = signal<Map<string, SubjectResource[]>>(new Map());
  protected readonly loadingMySubjects = signal(false);

  /** Acordeón: una sola oferta con el desglose abierto a la vez. */
  protected readonly expandedOfferingKey = signal<string | null>(null);

  /** Clave estable de una oferta de curso, para todos los Maps de arriba (menos `mySubjectResources`, que es por `subjectId`). */
  protected offeringKey(courseId: string, subjectId: string): string {
    return `${courseId}_${subjectId}`;
  }

  protected toggleSubjectDetail(courseId: string, subjectId: string): void {
    const key = this.offeringKey(courseId, subjectId);
    this.expandedOfferingKey.update((current) => (current === key ? null : key));
  }

  protected gradeBand(grade: number | null): GradeBand {
    return computeGradeBand(grade);
  }

  /** Desglose por categoría (y por tarea, si la categoría gestiona varias) de una oferta de curso, para el estudiante logueado. */
  protected categoryRowsFor(courseId: string, subjectId: string): CategoryBreakdownRow[] {
    const detail = this.mySubjectDetails().get(this.offeringKey(courseId, subjectId));
    if (!detail) {
      return [];
    }
    return detail.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => {
        const categoryAssignments = detail.assignments.filter((a) => a.categoryId === category.id);
        const percent = computeCategoryPercent(categoryAssignments, detail.grade?.scores);
        const assignments =
          category.hasMultipleTasks === false
            ? []
            : categoryAssignments.map((assignment) => ({
                assignment,
                score: detail.grade?.scores?.[assignment.id] ?? null,
              }));
        const soleAssignment =
          category.hasMultipleTasks === false ? categoryAssignments[0] : undefined;
        const singleScore = soleAssignment
          ? {
              earned: detail.grade?.scores?.[soleAssignment.id] ?? null,
              possible: soleAssignment.pointsPossible,
            }
          : null;
        return { category, percent, assignments, singleScore };
      });
  }

  /** Nombre del profesor de esta oferta de curso (a lo sumo uno, ver CourseSubjectTeacher), o el fallback si no tiene. */
  protected teacherNamesFor(courseId: string, subjectId: string): string {
    const names = this.mySubjectTeachers().get(this.offeringKey(courseId, subjectId));
    return names && names.length > 0
      ? names.join(', ')
      : this.i18n.t('dashboard', 'noTeacherAssigned');
  }

  /** Nota final de una oferta de curso (como estudiante), formateada, o el fallback si todavía no hay nada cargado. */
  protected finalGradeLabelFor(courseId: string, subjectId: string): string {
    const grade = this.mySubjectFinalGrades().get(this.offeringKey(courseId, subjectId));
    return grade != null
      ? `${Math.round(grade * 10) / 10}%`
      : this.i18n.t('dashboard', 'noGradeYet');
  }

  /** Comentarios del profesor para esa oferta de curso, los más nuevos primero, vacío si no dejó ninguno. */
  protected commentsFor(courseId: string, subjectId: string): GradeComment[] {
    return this.mySubjectComments().get(this.offeringKey(courseId, subjectId)) ?? [];
  }

  /**
   * Sin alerta de "curso por vencer" acá a propósito (mismo motivo que
   * MyStudents): el dashboard del estudiante lista varias ofertas a la vez.
   * Solo muestra Aprobado/Desaprobado una vez que la rúbrica está completa.
   */
  protected creditStatusFor(courseId: string, subjectId: string): GradeCreditStatus | null {
    const key = this.offeringKey(courseId, subjectId);
    const detail = this.mySubjectDetails().get(key);
    if (!detail) {
      return null;
    }
    const fullyGraded = isFullyGraded(detail.categories, detail.assignments, detail.grade?.scores);
    return gradeCreditStatus(fullyGraded, this.mySubjectFinalGrades().get(key) ?? null, false);
  }

  protected creditLetterFor(courseId: string, subjectId: string): GradeLetter | null {
    const status = this.creditStatusFor(courseId, subjectId);
    const grade = this.mySubjectFinalGrades().get(this.offeringKey(courseId, subjectId));
    return status && (status === 'passed' || status === 'failed') && grade != null
      ? gradeLetter(grade)
      : null;
  }

  /** Recursos (Drive/Dropbox/links) que el profesor dejó disponibles para esa materia — por `subjectId`, no se separan por curso. */
  protected resourcesFor(subjectId: string): SubjectResource[] {
    return this.mySubjectResources().get(subjectId) ?? [];
  }

  protected goToGradebook(courseId: string, subjectId: string): void {
    void this.router.navigateByUrl(`/subjects/${subjectId}/gradebook/${courseId}`);
  }

  protected goToStat(stat: StatCard): void {
    if (stat.route) {
      void this.router.navigateByUrl(stat.route);
    }
  }

  /**
   * Cursos donde el profesor logueado dicta ESTA materia puntual, con el
   * conteo de estudiantes de cada uno — mismo criterio de
   * courseSubjectTeachers (curso+materia+profesor) que Gradebook/Mis
   * estudiantes, no solo subjectAssignments (que es global a la materia,
   * sin curso). Un profesor puede dictarla en más de un curso a la vez.
   */
  protected coursesForSubject(
    subjectId: string,
  ): { courseId: string; courseName: string; studentCount: number }[] {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return [];
    }
    return this.courseSubjectTeachersService
      .rows()
      .filter((row) => row.subjectId === subjectId && row.teacherId === uid)
      .map((row) => {
        const course = this.coursesService.courses().find((c) => c.id === row.courseId);
        if (!course) {
          return null;
        }
        const studentCount = this.courseStudentsService
          .forCourse(row.courseId)
          .filter((cs) =>
            this.usersService.users().some((u) => u.uid === cs.studentUid && u.role === 'student'),
          ).length;
        return { courseId: row.courseId, courseName: course.name, studentCount };
      })
      .filter(
        (entry): entry is { courseId: string; courseName: string; studentCount: number } =>
          entry !== null,
      );
  }

  protected readonly roleLabel = computed(() => {
    switch (this.userProfileService.profile()?.role) {
      case 'admin':
        return this.i18n.t('adminUsers', 'roleAdmin');
      case 'teacher':
        return this.i18n.t('adminUsers', 'roleTeacher');
      case 'student':
        return this.i18n.t('adminUsers', 'roleStudent');
      default:
        return '';
    }
  });

  private readonly pendingInvitationsCount = computed(
    () =>
      this.invitationsService.invitations().filter((invitation) => invitation.status === 'pending')
        .length,
  );

  /** true mientras cualquier dato detrás de una tarjeta de estadística todavía no llegó — evita mostrar "0" antes de tiempo. */
  protected readonly statsLoading = computed(
    () =>
      this.usersService.loading() ||
      this.subjectsService.loading() ||
      this.invitationsService.loading() ||
      this.loadingMySubjects(),
  );

  protected readonly statCards = computed<StatCard[]>(() => {
    if (this.userProfileService.isAdmin()) {
      return [
        {
          label: this.i18n.t('dashboard', 'adminPanel'),
          value: this.usersService.users().length,
          icon: 'users',
          route: '/admin/users',
        },
        {
          label: this.i18n.t('dashboard', 'subjectsLink'),
          value: this.subjectsService.subjects().length,
          icon: 'book',
          route: '/admin/subjects',
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
          icon: 'mail',
          route: '/invitations',
        },
      ];
    }
    if (this.userProfileService.isTeacher()) {
      return [
        {
          label: this.i18n.t('dashboard', 'mySubjects'),
          value: this.subjectsService.mySubjects().length,
          icon: 'book',
        },
        {
          label: this.i18n.t('dashboard', 'statPendingInvitations'),
          value: this.pendingInvitationsCount(),
          icon: 'mail',
          route: '/invitations',
        },
      ];
    }
    return [
      {
        label: this.i18n.t('dashboard', 'mySubjects'),
        value: this.mySubjectCatalog().size,
        icon: 'graduation',
      },
    ];
  });

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      const uid = this.auth.user()?.uid;
      if (profile?.role !== 'student' || !uid) {
        this.clearMySubjects();
        this.loadingMySubjects.set(false);
        return;
      }

      this.loadingMySubjects.set(true);
      this.loadMySubjects(uid)
        .catch((error) => {
          console.error('[Dashboard] loadMySubjects failed:', error);
          this.clearMySubjects();
        })
        .finally(() => this.loadingMySubjects.set(false));
    });
  }

  private clearMySubjects(): void {
    this.mySubjectOfferings.set([]);
    this.mySubjectCatalog.set(new Map());
    this.mySubjectTeachers.set(new Map());
    this.mySubjectFinalGrades.set(new Map());
    this.mySubjectComments.set(new Map());
    this.mySubjectDetails.set(new Map());
    this.mySubjectResources.set(new Map());
  }

  /**
   * Las ofertas de curso de un estudiante salen de los cursos en los que
   * está matriculado (ver courses.model.ts), no de una lista suelta de
   * materias — y una misma materia puede aparecer más de una vez (una
   * oferta por curso, ver CourseOffering).
   */
  private async loadMySubjects(uid: string): Promise<void> {
    const courseStudents = await this.courseStudentsService.fetchForStudent(uid);
    const courseIds = [...new Set(courseStudents.map((cs) => cs.courseId))];
    const courseSubjects = await this.courseSubjectsService.fetchForCourseIds(courseIds);
    const subjectIds = [...new Set(courseSubjects.map((cs) => cs.subjectId))];

    if (courseSubjects.length === 0) {
      this.clearMySubjects();
      return;
    }

    const [
      subjects,
      courses,
      courseSubjectTeacherRows,
      categories,
      assignments,
      grades,
      resources,
      comments,
    ] = await Promise.all([
      this.subjectsService.fetchByIds(subjectIds),
      this.coursesService.fetchByIds(courseIds),
      this.courseSubjectTeachersService.fetchForCourseIds(courseIds),
      // Fetch cruzando TODOS los cursos que ofrecen estas materias (no solo
      // los del estudiante) — se filtra por oferta puntual más abajo; evita
      // un segundo round-trip por curso.
      this.gradeCategoriesService.fetchForSubjectIds(subjectIds),
      this.assignmentsService.fetchForSubjectIds(subjectIds),
      Promise.all(
        courseSubjects.map((cs) => this.gradesService.fetchOwn(cs.courseId, cs.subjectId, uid)),
      ),
      this.subjectResourcesService.fetchForSubjectIds(subjectIds),
      this.gradeCommentsService.fetchOwn(uid),
    ]);

    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const courseNameById = new Map(courses.map((c) => [c.id, c.name]));

    const offerings: CourseOffering[] = courseSubjects
      .filter((cs) => subjectById.has(cs.subjectId))
      .map((cs) => ({
        courseId: cs.courseId,
        courseName: courseNameById.get(cs.courseId) ?? cs.courseId,
        subjectId: cs.subjectId,
      }));
    this.mySubjectOfferings.set(offerings);
    this.mySubjectCatalog.set(subjectById);

    const byResource = new Map<string, SubjectResource[]>();
    for (const resource of resources) {
      byResource.set(resource.subjectId, [...(byResource.get(resource.subjectId) ?? []), resource]);
    }
    this.mySubjectResources.set(byResource);

    const byTeacher = new Map<string, string[]>();
    for (const row of courseSubjectTeacherRows) {
      const key = this.offeringKey(row.courseId, row.subjectId);
      byTeacher.set(key, [...(byTeacher.get(key) ?? []), row.teacherName]);
    }
    this.mySubjectTeachers.set(byTeacher);

    const byComment = new Map<string, GradeComment[]>();
    for (const comment of comments) {
      const key = this.offeringKey(comment.courseId, comment.subjectId);
      byComment.set(key, [...(byComment.get(key) ?? []), comment]);
    }
    for (const list of byComment.values()) {
      list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    }
    this.mySubjectComments.set(byComment);

    const finalGrades = new Map<string, number | null>();
    const details = new Map<string, SubjectDetail>();
    for (const offering of offerings) {
      const key = this.offeringKey(offering.courseId, offering.subjectId);
      const grade =
        grades.find(
          (g) => g?.courseId === offering.courseId && g?.subjectId === offering.subjectId,
        ) ?? null;
      const offeringCategories = categories.filter(
        (c) => c.courseId === offering.courseId && c.subjectId === offering.subjectId,
      );
      const offeringAssignments = assignments.filter(
        (a) => a.courseId === offering.courseId && a.subjectId === offering.subjectId,
      );
      finalGrades.set(
        key,
        computeFinalGrade(offeringCategories, offeringAssignments, grade?.scores),
      );
      details.set(key, {
        categories: offeringCategories,
        assignments: offeringAssignments,
        grade,
      });
    }
    this.mySubjectFinalGrades.set(finalGrades);
    this.mySubjectDetails.set(details);
  }

  protected goToAdmin(): void {
    void this.router.navigateByUrl('/admin/users');
  }

  protected goToInvitations(): void {
    void this.router.navigateByUrl('/invitations');
  }

  protected goToSubjects(): void {
    void this.router.navigateByUrl('/admin/subjects');
  }
}
