import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { CourseStudentsService } from '../../../core/courses/course-students.service';
import { CourseTeachersService } from '../../../core/courses/course-teachers.service';
import { CoursesService } from '../../../core/courses/courses.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import type { UserProfile, UserRole, UserStatus } from '../../../core/users/users.model';
import { UsersService } from '../../../core/users/users.service';
import { Button } from '../../../shared/components/button/button';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Loading } from '../../../shared/components/loading/loading';
import { Select, type SelectOption } from '../../../shared/components/select/select';
import { Page } from '../../../shared/layout/page/page';
import { PageHeader } from '../../../shared/layout/page-header/page-header';
import { IconChevronLeft, IconChevronRight, IconSearch } from '../../../shared/icons/icons';

const PAGE_SIZE = 10;

/** Chip de estado relleno (fondo + texto), mismo patrón que el resto de la app. */
const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'bg-slate-100 text-status-paused',
  approved: 'bg-status-active-soft text-status-active',
  rejected: 'bg-status-expired-soft text-status-expired',
};

/** Panel de admin: lista todos los usuarios y permite revocar/restaurar su acceso. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    Button,
    ConfirmDialog,
    Loading,
    Select,
    DatePipe,
    Page,
    PageHeader,
    IconChevronLeft,
    IconChevronRight,
    IconSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users.html',
})
export class AdminUsers {
  protected readonly usersService = inject(UsersService);
  protected readonly i18n = inject(I18nService);
  private readonly authService = inject(AuthService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseTeachersService = inject(CourseTeachersService);

  protected readonly statusClass = STATUS_CLASS;

  protected readonly pendingActionUid = signal<string | null>(null);
  protected readonly removingUid = signal<string | null>(null);
  protected readonly confirmingRemoveUser = signal<UserProfile | null>(null);
  protected readonly changingRoleUid = signal<string | null>(null);
  protected readonly confirmingRoleChangeToStudent = signal<UserProfile | null>(null);
  protected readonly confirmingRoleChangeFromStudent = signal<{
    user: UserProfile;
    role: UserRole;
  } | null>(null);

  protected readonly search = signal('');
  protected readonly roleFilter = signal<UserRole | 'all'>('all');
  protected readonly statusFilter = signal<UserStatus | 'all'>('all');
  protected readonly courseFilter = signal<string | 'all'>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;

  protected readonly roleFilterOptions = computed<SelectOption<UserRole | 'all'>[]>(() => [
    { value: 'all', label: this.i18n.t('adminUsers', 'allRoles') },
    { value: 'student', label: this.i18n.t('adminUsers', 'roleStudent') },
    { value: 'teacher', label: this.i18n.t('adminUsers', 'roleTeacher') },
    { value: 'admin', label: this.i18n.t('adminUsers', 'roleAdmin') },
  ]);

  protected readonly statusFilterOptions = computed<SelectOption<UserStatus | 'all'>[]>(() => [
    { value: 'all', label: this.i18n.t('adminUsers', 'allStatuses') },
    { value: 'approved', label: this.i18n.t('adminUsers', 'statusApproved') },
    { value: 'rejected', label: this.i18n.t('adminUsers', 'statusRejected') },
  ]);

  /** Un curso cuenta como vigente si no tiene fecha de fin, o si todavía no llegó — mismo criterio "fail-open" que el resto de la app (ver grades.util.ts::isCourseEndingSoon y MyStudents). */
  protected readonly activeCourses = computed(() =>
    this.coursesService
      .courses()
      .filter((course) => !course.endDate || course.endDate.toMillis() > Date.now())
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly courseFilterOptions = computed<SelectOption<string | 'all'>[]>(() => [
    { value: 'all', label: this.i18n.t('adminUsers', 'allCourses') },
    ...this.activeCourses().map((course) => ({ value: course.id, label: course.name })),
  ]);

  /** uids de estudiantes matriculados + profesores asignados al curso elegido (null = filtro de curso apagado). */
  private readonly courseMemberUids = computed<Set<string> | null>(() => {
    const courseId = this.courseFilter();
    if (courseId === 'all') {
      return null;
    }
    const uids = new Set<string>();
    this.courseStudentsService.forCourse(courseId).forEach((cs) => uids.add(cs.studentUid));
    this.courseTeachersService.forCourse(courseId).forEach((ct) => uids.add(ct.teacherId));
    return uids;
  });

  /** Búsqueda + filtros de rol/estado/curso sobre el listado completo (volumen trivial, ver UsersService). */
  protected readonly filteredUsers = computed<UserProfile[]>(() => {
    const query = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const courseMembers = this.courseMemberUids();
    return this.usersService.users().filter((user) => {
      if (role !== 'all' && user.role !== role) {
        return false;
      }
      if (status !== 'all' && user.status !== status) {
        return false;
      }
      if (courseMembers && !courseMembers.has(user.uid)) {
        return false;
      }
      if (query) {
        const name = (user.displayName ?? '').toLowerCase();
        const email = (user.email ?? '').toLowerCase();
        if (!name.includes(query) && !email.includes(query)) {
          return false;
        }
      }
      return true;
    });
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize)),
  );

  /** Si un filtro deja menos páginas que la actual, esta la acota — `page` solo mueve dentro de lo que realmente hay. */
  protected readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly pageUsers = computed<UserProfile[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredUsers().slice(start, start + this.pageSize);
  });

  protected readonly rangeStart = computed(() =>
    this.filteredUsers().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.filteredUsers().length),
  );

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  /**
   * El Select ya "eligió" el rol nuevo en cuanto el usuario lo clickeó — el
   * cambio real todavía no se aplicó (espera la confirmación). Si el
   * binding de `[value]` fuera `user.role` a secas, cancelar no lo haría
   * volver a mostrar el rol real: `user.role` nunca cambió, así que
   * Angular no tiene un valor distinto que re-empujar hacia el hijo. Este
   * método SÍ cambia de salida (el rol elegido mientras hay un diálogo
   * abierto para este usuario, el rol real en cualquier otro caso), así
   * que cancelar (que vacía la señal correspondiente) genuinamente fuerza
   * al Select a mostrar el rol real de nuevo.
   */
  protected displayedRole(user: UserProfile): UserRole {
    if (this.confirmingRoleChangeToStudent()?.uid === user.uid) {
      return 'student';
    }
    const pending = this.confirmingRoleChangeFromStudent();
    return pending?.user.uid === user.uid ? pending.role : user.role;
  }

  protected readonly roleOptions = computed<SelectOption<UserRole>[]>(() => [
    { value: 'student', label: this.i18n.t('adminUsers', 'roleStudent') },
    { value: 'teacher', label: this.i18n.t('adminUsers', 'roleTeacher') },
    { value: 'admin', label: this.i18n.t('adminUsers', 'roleAdmin') },
  ]);

  protected roleLabel(role: UserRole): string {
    switch (role) {
      case 'student':
        return this.i18n.t('adminUsers', 'roleStudent');
      case 'teacher':
        return this.i18n.t('adminUsers', 'roleTeacher');
      case 'admin':
        return this.i18n.t('adminUsers', 'roleAdmin');
    }
  }

  protected statusLabel(status: UserStatus): string {
    return status === 'rejected'
      ? this.i18n.t('adminUsers', 'statusRejected')
      : this.i18n.t('adminUsers', 'statusApproved');
  }

  protected initial(user: UserProfile): string {
    return (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase();
  }

  /** No se puede borrar la propia cuenta (ver firestore.rules) — se oculta el botón en esa fila. */
  protected isSelf(user: UserProfile): boolean {
    return user.uid === this.authService.user()?.uid;
  }

  protected async onRevoke(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.reject(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  protected async onReinstate(user: UserProfile): Promise<void> {
    this.pendingActionUid.set(user.uid);
    try {
      await this.usersService.approve(user.uid);
    } finally {
      this.pendingActionUid.set(null);
    }
  }

  /**
   * Sin guard explícito contra auto-degradarse: el botón/select ya está
   * oculto para la propia fila (ver isSelf), mismo criterio que "Borrar".
   *
   * Pasar a "student", o salir de "student", pide confirmación antes: en
   * ambos casos UsersService.updateRole revoca vínculos reales de curso
   * (ver sus comentarios), no es un cambio cosmético. Profesor <-> admin
   * se aplica directo, no toca ninguna de esas tablas.
   */
  protected onChangeRole(user: UserProfile, role: UserRole | undefined): void {
    if (!role || role === user.role) {
      return;
    }
    if (role === 'student') {
      this.confirmingRoleChangeToStudent.set(user);
      return;
    }
    if (user.role === 'student') {
      this.confirmingRoleChangeFromStudent.set({ user, role });
      return;
    }
    void this.applyRoleChange(user, role);
  }

  protected async applyRoleChange(user: UserProfile, role: UserRole): Promise<void> {
    this.changingRoleUid.set(user.uid);
    try {
      await this.usersService.updateRole(user.uid, role);
    } finally {
      this.changingRoleUid.set(null);
    }
  }

  protected async onRemove(user: UserProfile): Promise<void> {
    this.removingUid.set(user.uid);
    try {
      await this.usersService.remove(user.uid);
    } finally {
      this.removingUid.set(null);
    }
  }

  protected onSearchInput(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected onRoleFilterChange(value: UserRole | 'all' | undefined): void {
    this.roleFilter.set(value ?? 'all');
    this.page.set(1);
  }

  protected onStatusFilterChange(value: UserStatus | 'all' | undefined): void {
    this.statusFilter.set(value ?? 'all');
    this.page.set(1);
  }

  protected onCourseFilterChange(value: string | undefined): void {
    this.courseFilter.set(value ?? 'all');
    this.page.set(1);
  }

  protected goToPage(n: number): void {
    this.page.set(n);
  }

  protected prevPage(): void {
    this.page.set(Math.max(1, this.currentPage() - 1));
  }

  protected nextPage(): void {
    this.page.set(Math.min(this.totalPages(), this.currentPage() + 1));
  }
}
