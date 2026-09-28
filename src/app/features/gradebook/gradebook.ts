import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CourseStudentsService } from '../../core/courses/course-students.service';
import { CourseSubjectTeachersService } from '../../core/courses/course-subject-teachers.service';
import { CoursesService } from '../../core/courses/courses.service';
import type { Assignment } from '../../core/grades/assignments.model';
import { AssignmentsService } from '../../core/grades/assignments.service';
import { GradeCategoriesService } from '../../core/grades/grade-categories.service';
import { GradeCommentsService } from '../../core/grades/grade-comments.service';
import { GradeHistoryService } from '../../core/grades/grade-history.service';
import { GradesService } from '../../core/grades/grades.service';
import type { GradeCategory } from '../../core/grades/grades.model';
import {
  computeFinalGrade,
  daysUntil,
  gradeCreditStatus,
  gradeLetter,
  isCourseEndingSoon,
  isFullyGraded,
  type GradeCreditStatus,
  type GradeLetter,
} from '../../core/grades/grades.util';
import { I18nService } from '../../core/i18n/i18n.service';
import type { SubjectResource } from '../../core/subjects/subject-resources.model';
import { SubjectResourcesService } from '../../core/subjects/subject-resources.service';
import { SubjectsService } from '../../core/subjects/subjects.service';
import { UserProfileService } from '../../core/users/user-profile.service';
import { UsersService } from '../../core/users/users.service';
import { Button } from '../../shared/components/button/button';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { CourseEndingAlert } from '../../shared/components/course-ending-alert/course-ending-alert';
import { GradeStatusBadge } from '../../shared/components/grade-status-badge/grade-status-badge';
import { Loading } from '../../shared/components/loading/loading';
import { Modal } from '../../shared/components/modal/modal';
import { ResourceCard } from '../../shared/components/resource-card/resource-card';
import { Select, type SelectOption } from '../../shared/components/select/select';
import { Page } from '../../shared/layout/page/page';
import { PageHeader } from '../../shared/layout/page-header/page-header';
import {
  IconArrowRight,
  IconChevronDown,
  IconHistory,
  IconMessageSquare,
  IconPlus,
} from '../../shared/icons/icons';
import { ToastService } from '../../shared/toast/toast.service';

/** Rúbrica + tareas + grilla de notas de una materia. Ver auth.guards.ts::subjectAccessGuard para quién puede entrar. */
@Component({
  selector: 'app-gradebook',
  standalone: true,
  imports: [
    Button,
    ConfirmDialog,
    CourseEndingAlert,
    GradeStatusBadge,
    Loading,
    Modal,
    ResourceCard,
    Select,
    Page,
    PageHeader,
    IconArrowRight,
    IconChevronDown,
    IconHistory,
    IconMessageSquare,
    IconPlus,
    DecimalPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gradebook.html',
})
export class Gradebook {
  readonly subjectId = input.required<string>();
  /**
   * Qué OFERTA de curso de esta materia estamos calificando — la rúbrica,
   * las tareas y las notas son todas de `courseId`+`subjectId`, nunca de la
   * materia sola (dos cursos que ofrezcan la misma materia tienen cada uno
   * la suya, ver GradeCategory.courseId). `courseSubjectAccessGuard` ya
   * validó que el profesor logueado dicta justo esta oferta antes de dejar
   * entrar — acá no hace falta re-derivar "cursos accesibles".
   */
  readonly courseId = input.required<string>();

  protected readonly subjectsService = inject(SubjectsService);
  protected readonly categoriesService = inject(GradeCategoriesService);
  protected readonly assignmentsService = inject(AssignmentsService);
  protected readonly gradesService = inject(GradesService);
  protected readonly gradeHistoryService = inject(GradeHistoryService);
  protected readonly gradeCommentsService = inject(GradeCommentsService);
  protected readonly resourcesService = inject(SubjectResourcesService);
  protected readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  private readonly coursesService = inject(CoursesService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected readonly subject = computed(() =>
    this.subjectsService.subjects().find((s) => s.id === this.subjectId()),
  );

  protected readonly categories = computed(() =>
    this.categoriesService.forCourseSubject(this.courseId(), this.subjectId()),
  );

  protected readonly totalWeight = computed(() =>
    this.categories().reduce((sum, category) => sum + category.weight, 0),
  );

  protected readonly assignments = computed(() =>
    this.assignmentsService.forCourseSubject(this.courseId(), this.subjectId()),
  );

  protected readonly resources = computed(() => this.resourcesService.forSubject(this.subjectId()));

  /** Categorías "con varias tareas" — las únicas que gestionan tareas propias (ver grades.model.ts). */
  protected readonly multiTaskCategories = computed(() =>
    this.categories().filter((category) => category.hasMultipleTasks !== false),
  );

  protected readonly categoryOptions = computed<SelectOption<string>[]>(() =>
    this.multiTaskCategories().map((category) => ({ value: category.id, label: category.name })),
  );

  // --- Sugerencia de rúbrica anterior --------------------------------
  // Cuando esta oferta de curso todavía no tiene rúbrica pero YA existe
  // una para la misma materia en otro curso (de este profesor o de otro),
  // se ofrece como punto de partida editable en vez de arrancar de cero
  // cada vez — nunca se aplica sola, el profesor previsualiza y confirma.

  /** Una rúbrica candidata por cada OTRO curso que ya dicte esta materia. */
  private readonly rubricCandidates = computed(() => {
    const otherCategories = this.categoriesService
      .forSubject(this.subjectId())
      .filter((c) => c.courseId !== this.courseId());
    const earliestByCourseId = new Map<string, number>();
    for (const category of otherCategories) {
      const ts = category.createdAt?.toMillis() ?? 0;
      const current = earliestByCourseId.get(category.courseId);
      if (current === undefined || ts < current) {
        earliestByCourseId.set(category.courseId, ts);
      }
    }
    return [...earliestByCourseId.entries()].map(([courseId, createdAt]) => {
      const teacherRow = this.courseSubjectTeachersService.forCourseSubject(
        courseId,
        this.subjectId(),
      );
      return {
        courseId,
        courseName: this.coursesService.courses().find((c) => c.id === courseId)?.name ?? courseId,
        teacherId: teacherRow?.teacherId ?? null,
        teacherName: teacherRow?.teacherName ?? null,
        createdAt,
      };
    });
  });

  /** La candidata que se sugiere por defecto: la última rúbrica propia si tiene una, si no la más reciente de cualquiera. */
  private readonly defaultRubricCandidateId = computed(() => {
    const candidates = this.rubricCandidates();
    if (candidates.length === 0) {
      return null;
    }
    const uid = this.authService.user()?.uid;
    const own = candidates
      .filter((c) => c.teacherId === uid)
      .sort((a, b) => b.createdAt - a.createdAt);
    const pool = own.length > 0 ? own : [...candidates].sort((a, b) => b.createdAt - a.createdAt);
    return pool[0].courseId;
  });

  /** Candidata elegida a mano (link "ver otra"), o la sugerida por defecto si no se tocó nada. */
  protected readonly selectedRubricCandidateId = signal<string | null>(null);

  protected readonly effectiveRubricCandidateId = computed(
    () => this.selectedRubricCandidateId() ?? this.defaultRubricCandidateId(),
  );

  protected readonly selectedRubricCandidate = computed(
    () =>
      this.rubricCandidates().find((c) => c.courseId === this.effectiveRubricCandidateId()) ?? null,
  );

  /** Para el select "ver otra rúbrica anterior" — solo tiene sentido mostrarlo cuando hay más de una candidata. */
  protected readonly rubricCandidateOptions = computed<SelectOption<string>[]>(() =>
    this.rubricCandidates().map((c) => ({
      value: c.courseId,
      label: c.teacherName ? `${c.courseName} · ${c.teacherName}` : c.courseName,
    })),
  );

  protected readonly rubricSuggestionDismissed = signal(false);

  /** Solo mientras esta oferta arranca vacía y hay algo para sugerir — desaparece sola en cuanto se crea la primera categoría. */
  protected readonly showRubricSuggestion = computed(
    () =>
      !this.rubricSuggestionDismissed() &&
      !this.categoriesService.loading() &&
      this.categories().length === 0 &&
      this.rubricCandidates().length > 0,
  );

  protected readonly showSuggestionPreview = signal(false);

  protected readonly suggestionPreviewCategories = computed(() => {
    const candidateId = this.effectiveRubricCandidateId();
    return candidateId
      ? this.categoriesService.forCourseSubject(candidateId, this.subjectId())
      : [];
  });

  protected suggestionAssignmentsFor(categoryId: string): Assignment[] {
    return this.assignmentsService.forCategory(categoryId);
  }

  protected selectRubricCandidate(courseId: string): void {
    this.selectedRubricCandidateId.set(courseId);
  }

  protected dismissRubricSuggestion(): void {
    this.rubricSuggestionDismissed.set(true);
  }

  protected openSuggestionPreview(): void {
    this.showSuggestionPreview.set(true);
  }

  protected closeSuggestionPreview(): void {
    this.showSuggestionPreview.set(false);
  }

  protected readonly applyingSuggestion = signal(false);

  protected async applyRubricSuggestion(): Promise<void> {
    const candidateId = this.effectiveRubricCandidateId();
    if (!candidateId) {
      return;
    }
    this.applyingSuggestion.set(true);
    try {
      await this.categoriesService.copyFrom(candidateId, this.courseId(), this.subjectId());
      this.showSuggestionPreview.set(false);
      this.toast.success(this.i18n.t('gradebook', 'rubricSuggestionApplied'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.applyingSuggestion.set(false);
    }
  }
  // --- fin sugerencia de rúbrica anterior -----------------------------

  protected readonly course = computed(() =>
    this.coursesService.courses().find((c) => c.id === this.courseId()),
  );

  /** null si no hay curso en foco o el curso no tiene fecha fin cargada (cursos viejos, ver Course.endDate). */
  protected readonly daysUntilCourseEnd = computed(() => {
    const endDate = this.course()?.endDate;
    return endDate ? daysUntil(endDate.toDate()) : null;
  });

  protected readonly courseEndingSoon = computed(() =>
    isCourseEndingSoon(this.course()?.endDate?.toDate() ?? null),
  );

  /** Cuántos estudiantes de la materia (dentro del curso en foco) siguen sin nota final estando el curso por vencer — ver gradeCreditStatus. */
  protected readonly unfinishedCount = computed(() => {
    if (!this.course()) {
      return 0;
    }
    return this.students().filter((s) => this.creditStatusFor(s.uid) === 'unfinished').length;
  });

  /** El roster de ESTA oferta de curso — `courseSubjectAccessGuard` ya validó el acceso antes de entrar acá. */
  protected readonly students = computed(() => {
    const studentUids = new Set(
      this.courseStudentsService.forCourse(this.courseId()).map((cs) => cs.studentUid),
    );
    return this.usersService
      .users()
      .filter((user) => user.role === 'student' && studentUids.has(user.uid))
      .sort((a, b) =>
        (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''),
      );
  });

  /** true mientras cualquier dato detrás de `students()`/la grilla de notas todavía no llegó — evita mostrar "sin estudiantes" antes de tiempo. */
  protected readonly studentsLoading = computed(
    () =>
      this.usersService.loading() ||
      this.courseStudentsService.loading() ||
      this.gradesService.loading(),
  );

  protected readonly rubricOpen = signal(false);
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
  protected readonly confirmingRemoveCategory = signal<GradeCategory | null>(null);

  protected readonly assignmentsOpen = signal(false);
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
  protected readonly confirmingRemoveAssignment = signal<Assignment | null>(null);

  protected readonly resourcesOpen = signal(false);
  protected readonly showAddResourceForm = signal(false);
  protected readonly resourceTitle = signal('');
  protected readonly resourceUrl = signal('');
  protected readonly creatingResource = signal(false);
  protected readonly removingResourceId = signal<string | null>(null);
  protected readonly confirmingRemoveResource = signal<SubjectResource | null>(null);

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
      .forCourseSubject(this.courseId(), this.subjectId())
      .find((g) => g.studentUid === studentUid);
    return computeFinalGrade(this.categories(), this.assignments(), grade?.scores);
  }

  private fullyGradedFor(studentUid: string): boolean {
    const grade = this.gradesService
      .forCourseSubject(this.courseId(), this.subjectId())
      .find((g) => g.studentUid === studentUid);
    return isFullyGraded(this.categories(), this.assignments(), grade?.scores);
  }

  protected creditStatusFor(studentUid: string): GradeCreditStatus | null {
    return gradeCreditStatus(
      this.fullyGradedFor(studentUid),
      this.finalGradeFor(studentUid),
      this.courseEndingSoon(),
    );
  }

  protected creditLetterFor(studentUid: string): GradeLetter | null {
    if (!this.fullyGradedFor(studentUid)) {
      return null;
    }
    const grade = this.finalGradeFor(studentUid);
    return grade !== null ? gradeLetter(grade) : null;
  }

  protected scoreFor(studentUid: string, assignmentId: string): number | null {
    return this.gradesService.scoreFor(this.courseId(), this.subjectId(), studentUid, assignmentId);
  }

  /**
   * Borrador de notas de la grilla, por estudiante — no se escribe a
   * Firestore en cada tecla ni al perder el foco, sino recién cuando el
   * profesor confirma con el botón "Guardar" de esa fila (ver onSaveRow).
   * Clave `${studentUid}_${assignmentId}` porque el mismo assignmentId se
   * repite por columna para todos los estudiantes de la grilla.
   */
  protected readonly editingScores = signal<Record<string, string>>({});
  protected readonly savingRowUid = signal<string | null>(null);

  private scoreDraftKey(studentUid: string, assignmentId: string): string {
    return `${studentUid}_${assignmentId}`;
  }

  protected inputValueFor(studentUid: string, assignmentId: string): string {
    const draft = this.editingScores()[this.scoreDraftKey(studentUid, assignmentId)];
    if (draft !== undefined) {
      return draft;
    }
    const score = this.scoreFor(studentUid, assignmentId);
    return score === null ? '' : String(score);
  }

  protected onScoreInput(studentUid: string, assignmentId: string, value: string): void {
    this.editingScores.update((map) => ({
      ...map,
      [this.scoreDraftKey(studentUid, assignmentId)]: value,
    }));
  }

  /** Tareas de esta fila cuyo borrador difiere del valor guardado — ninguna significa fila "limpia". */
  private dirtyAssignmentsFor(studentUid: string): Assignment[] {
    return this.assignments().filter((assignment) => {
      const draft = this.editingScores()[this.scoreDraftKey(studentUid, assignment.id)];
      if (draft === undefined) {
        return false;
      }
      const saved = this.scoreFor(studentUid, assignment.id);
      return draft.trim() !== (saved === null ? '' : String(saved));
    });
  }

  protected isRowDirty(studentUid: string): boolean {
    return this.dirtyAssignmentsFor(studentUid).length > 0;
  }

  /** true si ALGUNA fila tiene cambios sin guardar — oculta la columna "Acciones" entera cuando no hace falta. */
  protected hasAnyDirtyRow(): boolean {
    return this.students().some((student) => this.isRowDirty(student.uid));
  }

  /** Descarta el borrador de una fila (vuelve a lo que ya está guardado), sin tocar Firestore. */
  protected discardRow(studentUid: string): void {
    this.editingScores.update((map) => {
      const rest = { ...map };
      const prefix = `${studentUid}_`;
      for (const key of Object.keys(rest)) {
        if (key.startsWith(prefix)) {
          delete rest[key];
        }
      }
      return rest;
    });
  }

  /** Valida el borrador de una fila; null + toast de error si algo no es válido, si no la lista de cambios a aplicar. */
  private validateDirtyRow(
    studentUid: string,
  ): { assignment: Assignment; score: number | null }[] | null {
    const dirtyAssignments = this.dirtyAssignmentsFor(studentUid);
    if (dirtyAssignments.length === 0) {
      return null;
    }
    const updates: { assignment: Assignment; score: number | null }[] = [];
    for (const assignment of dirtyAssignments) {
      const raw = this.editingScores()[this.scoreDraftKey(studentUid, assignment.id)] ?? '';
      const trimmed = raw.trim();
      const score = trimmed === '' ? null : Number(trimmed);
      if (
        score !== null &&
        (Number.isNaN(score) || score < 0 || score > assignment.pointsPossible)
      ) {
        this.toast.error(this.i18n.t('gradebook', 'invalidScore'));
        return null;
      }
      updates.push({ assignment, score });
    }
    return updates;
  }

  protected readonly confirmingRowUid = signal<string | null>(null);

  protected confirmingRowStudentName(): string {
    const student = this.students().find((s) => s.uid === this.confirmingRowUid());
    return student?.displayName ?? student?.email ?? '';
  }

  /** Resumen "antes → después" de una fila, para el diálogo de confirmación. */
  protected rowChangeSummaryFor(
    studentUid: string,
  ): { assignmentName: string; from: string; to: string }[] {
    return this.dirtyAssignmentsFor(studentUid).map((assignment) => {
      const draft = this.editingScores()[this.scoreDraftKey(studentUid, assignment.id)] ?? '';
      const saved = this.scoreFor(studentUid, assignment.id);
      const trimmed = draft.trim();
      const noGrade = this.i18n.t('gradebook', 'noGradeYet');
      return {
        assignmentName: assignment.name,
        from: saved === null ? noGrade : `${saved}/${assignment.pointsPossible}`,
        to: trimmed === '' ? noGrade : `${trimmed}/${assignment.pointsPossible}`,
      };
    });
  }

  protected openSaveRowConfirm(studentUid: string): void {
    if (!this.validateDirtyRow(studentUid)) {
      return;
    }
    this.confirmingRowUid.set(studentUid);
  }

  protected closeSaveRowConfirm(): void {
    this.confirmingRowUid.set(null);
  }

  protected async confirmSaveRow(): Promise<void> {
    const studentUid = this.confirmingRowUid();
    if (!studentUid) {
      return;
    }
    this.confirmingRowUid.set(null);
    await this.onSaveRow(studentUid);
  }

  private async onSaveRow(studentUid: string): Promise<void> {
    const updates = this.validateDirtyRow(studentUid);
    if (!updates) {
      return;
    }

    this.savingRowUid.set(studentUid);
    try {
      await this.gradesService.setScores(
        this.courseId(),
        this.subjectId(),
        studentUid,
        updates.map(({ assignment, score }) => ({
          assignmentId: assignment.id,
          assignmentName: assignment.name,
          score,
        })),
      );
      this.editingScores.update((map) => {
        const rest = { ...map };
        for (const { assignment } of updates) {
          delete rest[this.scoreDraftKey(studentUid, assignment.id)];
        }
        return rest;
      });
      this.toast.success(this.i18n.t('gradebook', 'scoresSaved'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.savingRowUid.set(null);
    }
  }

  protected hasComment(studentUid: string): boolean {
    return (
      this.gradeCommentsService.forStudent(this.courseId(), this.subjectId(), studentUid).length > 0
    );
  }

  protected readonly commentEditorFor = signal<{ uid: string; name: string } | null>(null);
  protected readonly newCommentText = signal('');
  protected readonly newCommentCategoryId = signal<string | undefined>(undefined);
  protected readonly addingComment = signal(false);

  protected readonly commentEntries = computed(() => {
    const target = this.commentEditorFor();
    return target
      ? this.gradeCommentsService.forStudent(this.courseId(), this.subjectId(), target.uid)
      : [];
  });

  /** Todas las categorías (no solo "con varias tareas") — un comentario puede referirse a cualquiera. */
  protected readonly commentCategoryOptions = computed<SelectOption<string>[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );

  protected openCommentEditor(student: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
  }): void {
    this.commentEditorFor.set({
      uid: student.uid,
      name: student.displayName ?? student.email ?? '',
    });
    this.newCommentText.set('');
    this.newCommentCategoryId.set(undefined);
  }

  protected readonly historyStudent = signal<{
    uid: string;
    displayName?: string | null;
    email?: string | null;
  } | null>(null);

  protected readonly historyEntries = computed(() => {
    const student = this.historyStudent();
    return student
      ? this.gradeHistoryService.forStudent(this.courseId(), this.subjectId(), student.uid)
      : [];
  });

  protected openHistory(student: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
  }): void {
    this.historyStudent.set(student);
  }

  protected closeHistory(): void {
    this.historyStudent.set(null);
  }

  protected closeCommentEditor(): void {
    this.commentEditorFor.set(null);
    this.newCommentText.set('');
    this.newCommentCategoryId.set(undefined);
  }

  /** Agrega un comentario nuevo a la lista — no reemplaza ni oculta los anteriores, ver GradeCommentsService. */
  protected async addComment(): Promise<void> {
    const target = this.commentEditorFor();
    const text = this.newCommentText().trim();
    if (!target || !text) {
      return;
    }
    const categoryId = this.newCommentCategoryId() ?? null;
    const categoryName = categoryId
      ? (this.categories().find((c) => c.id === categoryId)?.name ?? null)
      : null;
    this.addingComment.set(true);
    try {
      await this.gradeCommentsService.add(
        this.courseId(),
        this.subjectId(),
        target.uid,
        text,
        categoryId,
        categoryName,
      );
      this.toast.success(this.i18n.t('gradebook', 'commentAdded'));
      this.newCommentText.set('');
      this.newCommentCategoryId.set(undefined);
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.addingComment.set(false);
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
        this.courseId(),
        this.subjectId(),
        this.categoryName(),
        weight,
        this.categoryHasMultipleTasks(),
      );
      this.closeAddCategoryForm();
      this.toast.success(this.i18n.t('gradebook', 'categoryAdded'));
    } catch (error) {
      console.error('[Gradebook]', error);
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
      this.toast.success(this.i18n.t('gradebook', 'categorySaved'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.savingCategory.set(false);
    }
  }

  protected async onRemoveCategory(category: GradeCategory): Promise<void> {
    this.removingCategoryId.set(category.id);
    try {
      await this.categoriesService.remove(category.id);
      this.toast.success(this.i18n.t('gradebook', 'categoryDeleted'));
    } catch (error) {
      console.error('[Gradebook]', error);
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
        this.courseId(),
        this.subjectId(),
        categoryId,
        this.assignmentName(),
        points,
        this.assignmentDueDate() ? new Date(this.assignmentDueDate()) : null,
      );
      this.closeAddAssignmentForm();
      this.toast.success(this.i18n.t('gradebook', 'assignmentAdded'));
    } catch (error) {
      console.error('[Gradebook]', error);
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
      this.toast.success(this.i18n.t('gradebook', 'assignmentSaved'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.savingAssignment.set(false);
    }
  }

  protected async onRemoveAssignment(assignment: Assignment): Promise<void> {
    this.removingAssignmentId.set(assignment.id);
    try {
      await this.assignmentsService.remove(assignment.id);
      this.toast.success(this.i18n.t('gradebook', 'assignmentDeleted'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.removingAssignmentId.set(null);
    }
  }

  private isValidUrl(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  protected async onCreateResource(): Promise<void> {
    const title = this.resourceTitle().trim();
    const url = this.resourceUrl().trim();
    if (!title || !url) {
      return;
    }
    if (!this.isValidUrl(url)) {
      this.toast.error(this.i18n.t('gradebook', 'resourceUrlInvalid'));
      return;
    }

    this.creatingResource.set(true);
    try {
      await this.resourcesService.create(this.subjectId(), title, url);
      this.closeAddResourceForm();
      this.toast.success(this.i18n.t('gradebook', 'resourceAdded'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.creatingResource.set(false);
    }
  }

  protected openAddResourceForm(): void {
    this.showAddResourceForm.set(true);
  }

  protected closeAddResourceForm(): void {
    this.showAddResourceForm.set(false);
    this.resourceTitle.set('');
    this.resourceUrl.set('');
  }

  protected async onRemoveResource(resource: SubjectResource): Promise<void> {
    this.removingResourceId.set(resource.id);
    try {
      await this.resourcesService.remove(resource.id);
      this.toast.success(this.i18n.t('gradebook', 'resourceDeleted'));
    } catch (error) {
      console.error('[Gradebook]', error);
      this.toast.error(this.i18n.t('gradebook', 'errorGeneric'));
    } finally {
      this.removingResourceId.set(null);
    }
  }

  protected goBack(): void {
    this.location.back();
  }

  protected goToReview(assignmentId: string): void {
    this.router.navigate([
      '/subjects',
      this.subjectId(),
      'assignments',
      assignmentId,
      'review',
      this.courseId(),
    ]);
  }
}
