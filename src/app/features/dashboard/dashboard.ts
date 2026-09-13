import { DecimalPipe } from '@angular/common';
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
import type { Grade, GradeCategory } from '../../core/grades/grades.model';
import { GradesService } from '../../core/grades/grades.service';
import {
  computeCategoryPercent,
  computeFinalGrade,
  gradeBand as computeGradeBand,
  type GradeBand,
} from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { SubjectAssignmentsService } from '../../core/subjects/subject-assignments.service';
import type { Subject } from '../../core/subjects/subjects.model';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
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
    Page,
    PageHeader,
    DecimalPipe,
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
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  protected readonly subjectsService = inject(SubjectsService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  private readonly coursesService = inject(CoursesService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly gradesService = inject(GradesService);
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly router = inject(Router);

  protected readonly mySubjects = signal<Subject[]>([]);
  protected readonly mySubjectTeachers = signal<Map<string, string[]>>(new Map());
  protected readonly mySubjectFinalGrades = signal<Map<string, number | null>>(new Map());
  protected readonly mySubjectComments = signal<Map<string, string | null>>(new Map());
  protected readonly mySubjectDetails = signal<Map<string, SubjectDetail>>(new Map());
  protected readonly loadingMySubjects = signal(false);

  /** Acordeón: una sola materia con el desglose abierto a la vez. */
  protected readonly expandedSubjectId = signal<string | null>(null);

  protected toggleSubjectDetail(subjectId: string): void {
    this.expandedSubjectId.update((current) => (current === subjectId ? null : subjectId));
  }

  protected gradeBand(grade: number | null): GradeBand {
    return computeGradeBand(grade);
  }

  /** Desglose por categoría (y por tarea, si la categoría gestiona varias) de una materia, para el estudiante logueado. */
  protected categoryRowsFor(subjectId: string): CategoryBreakdownRow[] {
    const detail = this.mySubjectDetails().get(subjectId);
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
                score: detail.grade?.scores[assignment.id] ?? null,
              }));
        const soleAssignment =
          category.hasMultipleTasks === false ? categoryAssignments[0] : undefined;
        const singleScore = soleAssignment
          ? {
              earned: detail.grade?.scores[soleAssignment.id] ?? null,
              possible: soleAssignment.pointsPossible,
            }
          : null;
        return { category, percent, assignments, singleScore };
      });
  }

  /** Nombres de los profesores de una materia, unidos con coma (o el fallback si no tiene ninguno). */
  protected teacherNamesFor(subjectId: string): string {
    const names = this.mySubjectTeachers().get(subjectId);
    return names && names.length > 0
      ? names.join(', ')
      : this.i18n.t('dashboard', 'noTeacherAssigned');
  }

  /** Nota final de una materia (como estudiante), formateada, o el fallback si todavía no hay nada cargado. */
  protected finalGradeLabelFor(subjectId: string): string {
    const grade = this.mySubjectFinalGrades().get(subjectId);
    return grade != null
      ? `${Math.round(grade * 10) / 10}%`
      : this.i18n.t('dashboard', 'noGradeYet');
  }

  /** Comentario del profesor para esa materia, o null si no dejó ninguno. */
  protected commentFor(subjectId: string): string | null {
    return this.mySubjectComments().get(subjectId) ?? null;
  }

  protected goToGradebook(subjectId: string): void {
    void this.router.navigateByUrl(`/subjects/${subjectId}/gradebook`);
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
        value: this.mySubjects().length,
        icon: 'graduation',
      },
    ];
  });

  constructor() {
    effect(() => {
      const profile = this.userProfileService.profile();
      const uid = this.auth.user()?.uid;
      if (profile?.role !== 'student' || !uid) {
        this.mySubjects.set([]);
        this.mySubjectTeachers.set(new Map());
        this.mySubjectFinalGrades.set(new Map());
        this.mySubjectComments.set(new Map());
        this.mySubjectDetails.set(new Map());
        this.loadingMySubjects.set(false);
        return;
      }

      this.loadingMySubjects.set(true);
      this.loadMySubjects(uid)
        .catch(() => {
          this.mySubjects.set([]);
          this.mySubjectTeachers.set(new Map());
          this.mySubjectFinalGrades.set(new Map());
          this.mySubjectComments.set(new Map());
          this.mySubjectDetails.set(new Map());
        })
        .finally(() => this.loadingMySubjects.set(false));
    });
  }

  /** Las materias de un estudiante salen de los cursos en los que está matriculado (ver courses.model.ts), no de una lista suelta. */
  private async loadMySubjects(uid: string): Promise<void> {
    const courseStudents = await this.courseStudentsService.fetchForStudent(uid);
    const courseIds = courseStudents.map((cs) => cs.courseId);
    const courseSubjects = await this.courseSubjectsService.fetchForCourseIds(courseIds);
    const subjectIds = [...new Set(courseSubjects.map((cs) => cs.subjectId))];

    if (subjectIds.length === 0) {
      this.mySubjects.set([]);
      this.mySubjectTeachers.set(new Map());
      this.mySubjectFinalGrades.set(new Map());
      this.mySubjectComments.set(new Map());
      this.mySubjectDetails.set(new Map());
      return;
    }

    const [subjects, teacherAssignments, categories, assignments, grades] = await Promise.all([
      this.subjectsService.fetchByIds(subjectIds),
      this.subjectAssignmentsService.fetchBySubjectIds(subjectIds),
      this.gradeCategoriesService.fetchForSubjectIds(subjectIds),
      this.assignmentsService.fetchForSubjectIds(subjectIds),
      Promise.all(subjectIds.map((id) => this.gradesService.fetchOwn(id, uid))),
    ]);

    this.mySubjects.set(subjects);

    const byTeacher = new Map<string, string[]>();
    for (const assignment of teacherAssignments) {
      byTeacher.set(assignment.subjectId, [
        ...(byTeacher.get(assignment.subjectId) ?? []),
        assignment.teacherName,
      ]);
    }
    this.mySubjectTeachers.set(byTeacher);

    const finalGrades = new Map<string, number | null>();
    const comments = new Map<string, string | null>();
    const details = new Map<string, SubjectDetail>();
    for (const subjectId of subjectIds) {
      const grade = grades.find((g) => g?.subjectId === subjectId) ?? null;
      const subjectCategories = categories.filter((c) => c.subjectId === subjectId);
      const subjectAssignments = assignments.filter((a) => a.subjectId === subjectId);
      finalGrades.set(
        subjectId,
        computeFinalGrade(subjectCategories, subjectAssignments, grade?.scores),
      );
      comments.set(subjectId, grade?.comment ?? null);
      details.set(subjectId, {
        categories: subjectCategories,
        assignments: subjectAssignments,
        grade,
      });
    }
    this.mySubjectFinalGrades.set(finalGrades);
    this.mySubjectComments.set(comments);
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
