import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import { GradeHistoryService } from './grade-history.service';
import type { Grade } from './grades.model';

/**
 * Las notas de cada estudiante por materia (ver grades.model.ts). Solo el
 * admin o el profesor asignado a esa materia puede cargar/editar (ver
 * firestore.rules); el listado en vivo se sincroniza completo para staff
 * (volumen trivial) y se filtra por materia en el cliente con `forSubject`.
 * Un estudiante resuelve la suya con `fetchOwn` (getDoc puntual por el id
 * determinístico, sin necesitar permiso de "list").
 */
@Injectable({ providedIn: 'root' })
export class GradesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly gradeHistoryService = inject(GradeHistoryService);

  private readonly _grades = signal<Grade[]>([]);
  private readonly _loading = signal(true);

  readonly grades = this._grades.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._grades.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'grades'),
        (snapshot) => {
          this._grades.set(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Grade));
          this._loading.set(false);
        },
        (error) => {
          console.error('[GradesService] grades listener failed:', error);
          this._grades.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Notas de todos los estudiantes de una materia, para la grilla del profesor/admin. */
  forSubject(subjectId: string): Grade[] {
    return this._grades().filter((grade) => grade.subjectId === subjectId);
  }

  /**
   * `grade.scores` puede faltar en la práctica (ej. un documento creado
   * solo por `setComment` antes de cargar cualquier nota) aunque el tipo
   * `Grade` lo declare obligatorio — de ahí el `?.` extra, no solo en
   * `grade`.
   */
  scoreFor(subjectId: string, studentUid: string, categoryId: string): number | null {
    const grade = this.forSubject(subjectId).find((g) => g.studentUid === studentUid);
    return grade?.scores?.[categoryId] ?? null;
  }

  /** Fetch puntual (no reactivo) de la propia nota, para el dashboard del estudiante. */
  async fetchOwn(subjectId: string, studentUid: string): Promise<Grade | null> {
    const snapshot = await getDoc(doc(this.firestore, 'grades', `${subjectId}_${studentUid}`));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Grade) : null;
  }

  /**
   * `assignmentName` es solo para dejar un registro legible en el
   * historial (ver GradeHistoryService) — no se guarda en el propio
   * `grades` doc. Si el puntaje no cambió realmente (ej. re-guardar el
   * mismo valor), no se agrega una entrada de historial.
   */
  async setScore(
    subjectId: string,
    studentUid: string,
    assignmentId: string,
    assignmentName: string,
    score: number | null,
  ): Promise<void> {
    const previousScore = this.scoreFor(subjectId, studentUid, assignmentId);
    const ref = doc(this.firestore, 'grades', `${subjectId}_${studentUid}`);
    await setDoc(
      ref,
      { subjectId, studentUid, scores: { [assignmentId]: score }, updatedAt: serverTimestamp() },
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

  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, 'grades', id));
  }
}
