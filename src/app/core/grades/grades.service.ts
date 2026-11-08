import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Query,
  type WriteBatch,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CourseSubjectTeachersService } from '../courses/course-subject-teachers.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import { GradeHistoryService } from './grade-history.service';
import type { Grade } from './grades.model';

/** Límite de valores de Firestore para un filtro `in`. */
const IN_QUERY_CHUNK_SIZE = 30;

/**
 * Las notas de cada estudiante por OFERTA DE CURSO (materia dictada en un
 * curso puntual — ver grades.model.ts::Grade.courseId; la misma materia en
 * otro curso es un `Grade` totalmente distinto, aunque sea el mismo
 * estudiante). Solo el admin o el profesor asignado a esa oferta
 * (`courseSubjectTeachers`, ver firestore.rules) puede cargar/editar.
 *
 * Listado en vivo, acotado por rol: el admin sincroniza la colección
 * completa (la necesita para cascadas cross-curso como
 * `SubjectsService.remove`); un profesor solo las notas de los cursos donde
 * dicta alguna materia (`courseSubjectTeachers` con su `teacherId`, el
 * mismo alcance que `accessibleCourseIds` en Gradebook/MyStudents/
 * MyCourseDetail), en bloques de `in` de a 30. Antes cada profesor
 * descargaba las notas de toda la institución al entrar y recibía cada
 * cambio de cualquier curso. Después se filtra en el cliente con
 * `forCourseSubject`. Un estudiante resuelve la suya con `fetchOwn` (getDoc
 * puntual por el id determinístico, sin necesitar permiso de "list").
 */
@Injectable({ providedIn: 'root' })
export class GradesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly gradeHistoryService = inject(GradeHistoryService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);

  private readonly _grades = signal<Grade[]>([]);
  private readonly _loading = signal(true);

  readonly grades = this._grades.asReadonly();
  readonly loading = this._loading.asReadonly();

  /**
   * Cursos del profesor logueado, ordenados y unidos en un string para que
   * el listener solo se rehaga cuando cambia SU conjunto de cursos, no ante
   * cualquier cambio en `courseSubjectTeachers` de otro profesor.
   */
  private readonly teacherCourseKey = computed(() => {
    const uid = this.authService.user()?.uid;
    if (!uid) {
      return '';
    }
    return [
      ...new Set(
        this.courseSubjectTeachersService
          .rows()
          .filter((r) => r.teacherId === uid)
          .map((r) => r.courseId),
      ),
    ]
      .sort()
      .join('|');
  });

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isAdmin = this.userProfileService.isAdmin();
      const isStaff = isAdmin || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._grades.set([]);
        this._loading.set(false);
        return;
      }

      let queries: Query[];
      if (isAdmin) {
        queries = [collection(this.firestore, 'grades')];
      } else {
        // Sin las filas del profesor todavía no se sabe qué cursos pedir.
        if (this.courseSubjectTeachersService.loading()) {
          this._loading.set(true);
          return;
        }
        const courseIds = this.teacherCourseKey().split('|').filter(Boolean);
        if (courseIds.length === 0) {
          this._grades.set([]);
          this._loading.set(false);
          return;
        }
        queries = [];
        for (let i = 0; i < courseIds.length; i += IN_QUERY_CHUNK_SIZE) {
          queries.push(
            query(
              collection(this.firestore, 'grades'),
              where('courseId', 'in', courseIds.slice(i, i + IN_QUERY_CHUNK_SIZE)),
            ),
          );
        }
      }

      this._loading.set(true);
      const parts = new Map<number, Grade[]>();
      const unsubscribes = queries.map((q, index) =>
        onSnapshot(
          q,
          (snapshot) => {
            parts.set(
              index,
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Grade),
            );
            if (parts.size === queries.length) {
              this._grades.set([...parts.values()].flat());
              this._loading.set(false);
            }
          },
          (error) => {
            console.error('[GradesService] grades listener failed:', error);
            parts.set(index, []);
            if (parts.size === queries.length) {
              this._grades.set([...parts.values()].flat());
            }
            this._loading.set(false);
          },
        ),
      );

      onCleanup(() => unsubscribes.forEach((unsubscribe) => unsubscribe()));
    });
  }

  /** Notas de todos los estudiantes de una oferta de curso, para la grilla del profesor/admin. */
  forCourseSubject(courseId: string, subjectId: string): Grade[] {
    return this._grades().filter(
      (grade) => grade.courseId === courseId && grade.subjectId === subjectId,
    );
  }

  /**
   * Notas de una materia CRUZANDO todos los cursos que la dicten — a
   * propósito no filtra por curso. Solo para cascadas de borrado de una
   * materia entera (ver SubjectsService.remove, que tiene que arrastrar
   * las notas de TODAS sus ofertas de curso, no solo una); el uso normal
   * para calificar es `forCourseSubject`.
   */
  forSubject(subjectId: string): Grade[] {
    return this._grades().filter((grade) => grade.subjectId === subjectId);
  }

  /**
   * `grade.scores` puede faltar en la práctica (ej. un documento creado
   * solo por `setComment` antes de cargar cualquier nota) aunque el tipo
   * `Grade` lo declare obligatorio — de ahí el `?.` extra, no solo en
   * `grade`.
   */
  scoreFor(
    courseId: string,
    subjectId: string,
    studentUid: string,
    assignmentId: string,
  ): number | null {
    const grade = this.forCourseSubject(courseId, subjectId).find(
      (g) => g.studentUid === studentUid,
    );
    return grade?.scores?.[assignmentId] ?? null;
  }

  /** Fetch puntual (no reactivo) de la propia nota, para el dashboard del estudiante. */
  async fetchOwn(courseId: string, subjectId: string, studentUid: string): Promise<Grade | null> {
    const snapshot = await getDoc(
      doc(this.firestore, 'grades', `${courseId}_${subjectId}_${studentUid}`),
    );
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Grade) : null;
  }

  /**
   * `assignmentName` es solo para dejar un registro legible en el
   * historial (ver GradeHistoryService) — no se guarda en el propio
   * `grades` doc. Si el puntaje no cambió realmente (ej. re-guardar el
   * mismo valor), no se agrega una entrada de historial.
   */
  async setScore(
    courseId: string,
    subjectId: string,
    studentUid: string,
    assignmentId: string,
    assignmentName: string,
    score: number | null,
  ): Promise<void> {
    const previousScore = this.scoreFor(courseId, subjectId, studentUid, assignmentId);
    const ref = doc(this.firestore, 'grades', `${courseId}_${subjectId}_${studentUid}`);
    await setDoc(
      ref,
      {
        courseId,
        subjectId,
        studentUid,
        scores: { [assignmentId]: score },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (previousScore === score) {
      return;
    }
    const user = this.authService.user();
    if (!user) {
      return;
    }
    await this.gradeHistoryService.record({
      courseId,
      subjectId,
      studentUid,
      assignmentId,
      assignmentName,
      previousScore,
      newScore: score,
      changedBy: user.uid,
      changedByName:
        this.userProfileService.profile()?.displayName ?? user.displayName ?? user.email ?? '',
    });
  }

  /**
   * Guarda varias notas del mismo estudiante en la misma materia en una
   * sola escritura — pensado para "guardar fila" en Gradebook, donde el
   * profesor puede tocar varias tareas antes de guardar. Llamar `setScore`
   * una vez por tarea hacía N `setDoc` al MISMO documento (todas comparten
   * `grades/{subjectId}_{studentUid}`): N round-trips en vez de 1, y si la
   * red se cortaba a mitad de camino, la fila quedaba con algunas notas
   * guardadas y otras no, sin manera simple de saber cuáles. Un registro de
   * historial por nota que realmente cambió, igual que `setScore` (eso sí
   * se mantiene separado a propósito — cada entrada es un cambio puntual).
   */
  async setScores(
    courseId: string,
    subjectId: string,
    studentUid: string,
    changes: { assignmentId: string; assignmentName: string; score: number | null }[],
  ): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    const scores: Record<string, number | null> = {};
    const changed: {
      assignmentId: string;
      assignmentName: string;
      previousScore: number | null;
      newScore: number | null;
    }[] = [];
    for (const { assignmentId, assignmentName, score } of changes) {
      scores[assignmentId] = score;
      const previousScore = this.scoreFor(courseId, subjectId, studentUid, assignmentId);
      if (previousScore !== score) {
        changed.push({ assignmentId, assignmentName, previousScore, newScore: score });
      }
    }

    const ref = doc(this.firestore, 'grades', `${courseId}_${subjectId}_${studentUid}`);
    await setDoc(
      ref,
      { courseId, subjectId, studentUid, scores, updatedAt: serverTimestamp() },
      { merge: true },
    );

    if (changed.length === 0) {
      return;
    }
    const user = this.authService.user();
    if (!user) {
      return;
    }
    const changedByName =
      this.userProfileService.profile()?.displayName ?? user.displayName ?? user.email ?? '';
    await Promise.all(
      changed.map((c) =>
        this.gradeHistoryService.record({
          courseId,
          subjectId,
          studentUid,
          assignmentId: c.assignmentId,
          assignmentName: c.assignmentName,
          previousScore: c.previousScore,
          newScore: c.newScore,
          changedBy: user.uid,
          changedByName,
        }),
      ),
    );
  }

  /** `batch`: si se pasa, encola el borrado en vez de commitear solo — para cascadas atómicas (ver SubjectsService.remove). */
  async remove(id: string, batch?: WriteBatch): Promise<void> {
    const ref = doc(this.firestore, 'grades', id);
    if (batch) {
      batch.delete(ref);
      return;
    }
    await deleteDoc(ref);
  }
}
