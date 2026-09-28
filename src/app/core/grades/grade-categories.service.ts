import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CourseSubjectTeachersService } from '../courses/course-subject-teachers.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { Assignment } from './assignments.model';
import { AssignmentsService } from './assignments.service';
import type { GradeCategory } from './grades.model';

/** Firestore permite hasta 30 valores por cláusula "in". */
const IN_QUERY_CHUNK_SIZE = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * La rúbrica de cada OFERTA DE CURSO (materia dictada en un curso puntual,
 * ver grades.model.ts::GradeCategory.courseId) — dos cursos que dicten la
 * misma materia, o el mismo profesor repitiéndola en un curso nuevo, tienen
 * cada uno la suya, nunca la comparten. Solo el admin o el profesor
 * asignado a esa oferta (`courseSubjectTeachers`, ver firestore.rules)
 * crea/edita/borra categorías; el listado en vivo se sincroniza completo
 * para staff (volumen trivial para un instituto chico) y se filtra en el
 * cliente con `forCourseSubject` (uso normal) o `forSubject` (cruza
 * cursos — solo para sugerir una rúbrica anterior como punto de partida,
 * ver Gradebook).
 */
@Injectable({ providedIn: 'root' })
export class GradeCategoriesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly assignmentsService = inject(AssignmentsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);

  private readonly _categories = signal<GradeCategory[]>([]);
  private readonly _loading = signal(true);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._categories.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'gradeCategories'),
        (snapshot) => {
          this._categories.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeCategory),
          );
          this._loading.set(false);
        },
        (error) => {
          console.error('[GradeCategoriesService] categories listener failed:', error);
          this._categories.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });

    /**
     * Autorepara categorías "de una sola nota" creadas antes de que
     * `pointsPossible` se sincronizara con `weight` en create()/update() —
     * sin esto, una categoría vieja se quedaba con un máximo fijo (ej. 100)
     * para siempre aunque su peso fuera, digamos, 10, obligando al
     * profesor a convertir cada nota a mano a la escala vieja en vez de
     * cargarla directamente sobre el peso. Corre en cuanto las tres
     * colecciones necesarias ya cargaron; es idempotente — en cuanto el
     * mismatch desaparece deja de escribir nada — y solo toca lo que esta
     * cuenta puede escribir de verdad (el admin corrige cualquier materia,
     * un profesor solo las suyas, mismo criterio que la regla de
     * `assignments`) para no dispararle un `permission-denied` silencioso
     * por cada materia ajena.
     */
    effect(() => {
      if (
        this._loading() ||
        this.assignmentsService.loading() ||
        this.courseSubjectTeachersService.loading()
      ) {
        return;
      }

      const isAdmin = this.userProfileService.isAdmin();
      const uid = this.authService.user()?.uid;
      const myCourseSubjectIds = isAdmin
        ? null
        : new Set(
            this.courseSubjectTeachersService
              .rows()
              .filter((r) => r.teacherId === uid)
              .map((r) => `${r.courseId}_${r.subjectId}`),
          );

      for (const category of this._categories()) {
        if (category.hasMultipleTasks !== false) {
          continue;
        }
        if (!isAdmin && !myCourseSubjectIds!.has(`${category.courseId}_${category.subjectId}`)) {
          continue;
        }
        const [soleAssignment] = this.assignmentsService.forCategory(category.id);
        if (soleAssignment && soleAssignment.pointsPossible !== category.weight) {
          this.assignmentsService
            .update(soleAssignment.id, { pointsPossible: category.weight })
            .catch((error) => {
              console.error('[GradeCategoriesService] auto-fix pointsPossible failed:', error);
            });
        }
      }
    });
  }

  /** Categorías de una oferta de curso (materia+curso puntual), ordenadas para mostrar — el uso normal. */
  forCourseSubject(courseId: string, subjectId: string): GradeCategory[] {
    return this._categories()
      .filter((category) => category.courseId === courseId && category.subjectId === subjectId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Categorías de una materia CRUZANDO todos los cursos que la dicten —
   * a propósito no filtra por curso. Solo para encontrar rúbricas
   * anteriores de la misma materia y sugerirlas como punto de partida (ver
   * Gradebook); el uso normal para calificar es `forCourseSubject`.
   */
  forSubject(subjectId: string): GradeCategory[] {
    return this._categories()
      .filter((category) => category.subjectId === subjectId)
      .sort((a, b) => a.order - b.order);
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForSubjectIds(subjectIds: string[]): Promise<GradeCategory[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const results: GradeCategory[] = [];
    for (const idsChunk of chunk(subjectIds, IN_QUERY_CHUNK_SIZE)) {
      const categoriesQuery = query(
        collection(this.firestore, 'gradeCategories'),
        where('subjectId', 'in', idsChunk),
      );
      const snapshot = await getDocs(categoriesQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeCategory));
    }
    return results;
  }

  /**
   * `batch`: si se pasa, encola la categoría (y, si aplica, su tarea
   * invisible) en vez de commitear cada una — usado por la sugerencia de
   * rúbrica anterior (Gradebook) para copiar varias categorías+tareas en
   * una sola escritura atómica. `order`: si se pasa, se usa tal cual en
   * vez de calcularlo de `forCourseSubject(...).length` — necesario al
   * copiar varias categorías en el mismo batch, donde ese cálculo daría
   * siempre 0 (ninguna de las anteriores del mismo batch todavía "existe"
   * en el signal local hasta que el batch se commitea).
   */
  async create(
    courseId: string,
    subjectId: string,
    name: string,
    weight: number,
    hasMultipleTasks: boolean,
    batch?: WriteBatch,
    order?: number,
  ): Promise<string> {
    const trimmedName = name.trim();
    const ref = doc(collection(this.firestore, 'gradeCategories'));
    const data = {
      courseId,
      subjectId,
      name: trimmedName,
      weight,
      hasMultipleTasks,
      order: order ?? this.forCourseSubject(courseId, subjectId).length,
      createdAt: serverTimestamp(),
    };
    if (batch) {
      batch.set(ref, data);
    } else {
      await setDoc(ref, data);
    }
    if (!hasMultipleTasks) {
      // El puntaje de una categoría "de una sola nota" se carga sobre una
      // escala igual a su peso (no un 0-100 fijo): así "9" en una categoría
      // de peso 10 significa 9/10 (90%, notable), no 9/100 (9%, aplazo) —
      // evita que el profesor cargue pensando en una escala y el sistema
      // la interprete con otra.
      await this.assignmentsService.create(
        courseId,
        subjectId,
        ref.id,
        trimmedName,
        weight,
        null,
        batch,
      );
    }
    return ref.id;
  }

  async update(id: string, fields: Partial<Pick<GradeCategory, 'name' | 'weight'>>) {
    await updateDoc(doc(this.firestore, 'gradeCategories', id), fields as DocumentData);

    const category = this._categories().find((c) => c.id === id);
    if (!category || category.hasMultipleTasks) {
      return;
    }
    // Categoría "de una sola nota": su tarea invisible lleva el mismo
    // nombre (nunca se muestra, pero conviene mantenerlo en sincronía) y el
    // mismo puntaje máximo que el peso (ver comentario en create()) — si
    // el peso cambia, el máximo tiene que moverse con él.
    const [soleAssignment] = this.assignmentsService.forCategory(id);
    if (!soleAssignment) {
      return;
    }
    const assignmentFields: Partial<Pick<Assignment, 'name' | 'pointsPossible'>> = {};
    if (fields.name !== undefined) {
      assignmentFields.name = fields.name;
    }
    if (fields.weight !== undefined) {
      assignmentFields.pointsPossible = fields.weight;
    }
    if (Object.keys(assignmentFields).length > 0) {
      await this.assignmentsService.update(soleAssignment.id, assignmentFields);
    }
  }

  /** `batch`: si se pasa, encola esta categoría y sus tareas en vez de commitear cada una — para cascadas atómicas (ver SubjectsService.remove). */
  async remove(id: string, batch?: WriteBatch): Promise<void> {
    const assignments = this.assignmentsService.forCategory(id);
    const ref = doc(this.firestore, 'gradeCategories', id);
    if (batch) {
      await Promise.all(assignments.map((a) => this.assignmentsService.remove(a.id, batch)));
      batch.delete(ref);
      return;
    }
    await Promise.all(assignments.map((a) => this.assignmentsService.remove(a.id)));
    await deleteDoc(ref);
  }

  /**
   * Copia toda la rúbrica (categorías + tareas, sin fechas de vencimiento)
   * de otra oferta de curso de la MISMA materia a `toCourseId` — el punto
   * de partida que ofrece Gradebook cuando un profesor arranca una oferta
   * nueva y ya existe una rúbrica anterior de esa materia (de él mismo en
   * otro curso, o de otro profesor). Es una COPIA real, no una plantilla
   * vinculada: queda 100% editable después, sin afectar la original. Todo
   * en un solo `writeBatch` (varias escrituras por una sola acción del
   * usuario, ver la regla de Performance en CLAUDE.md) — no hace nada si
   * la oferta de origen no tiene categorías (ya se borró, o nunca la tuvo).
   */
  async copyFrom(fromCourseId: string, toCourseId: string, subjectId: string): Promise<void> {
    const sourceCategories = this.forCourseSubject(fromCourseId, subjectId);
    if (sourceCategories.length === 0) {
      return;
    }
    const batch = writeBatch(this.firestore);
    for (const [index, category] of sourceCategories.entries()) {
      const newCategoryId = await this.create(
        toCourseId,
        subjectId,
        category.name,
        category.weight,
        category.hasMultipleTasks,
        batch,
        index,
      );
      if (category.hasMultipleTasks !== false) {
        const sourceAssignments = this.assignmentsService.forCategory(category.id);
        for (const [taskIndex, assignment] of sourceAssignments.entries()) {
          await this.assignmentsService.create(
            toCourseId,
            subjectId,
            newCategoryId,
            assignment.name,
            assignment.pointsPossible,
            null,
            batch,
            taskIndex,
          );
        }
      }
    }
    await batch.commit();
  }
}
