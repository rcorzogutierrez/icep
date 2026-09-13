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
        () => {
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

  scoreFor(subjectId: string, studentUid: string, categoryId: string): number | null {
    const grade = this.forSubject(subjectId).find((g) => g.studentUid === studentUid);
    return grade?.scores[categoryId] ?? null;
  }

  /** Fetch puntual (no reactivo) de la propia nota, para el dashboard del estudiante. */
  async fetchOwn(subjectId: string, studentUid: string): Promise<Grade | null> {
    const snapshot = await getDoc(doc(this.firestore, 'grades', `${subjectId}_${studentUid}`));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Grade) : null;
  }

  setScore(
    subjectId: string,
    studentUid: string,
    categoryId: string,
    score: number | null,
  ): Promise<void> {
    const ref = doc(this.firestore, 'grades', `${subjectId}_${studentUid}`);
    return setDoc(
      ref,
      { subjectId, studentUid, scores: { [categoryId]: score }, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  /** Comentario general del profesor para un estudiante en una materia, o null si no puso ninguno. */
  commentFor(subjectId: string, studentUid: string): string | null {
    const grade = this.forSubject(subjectId).find((g) => g.studentUid === studentUid);
    return grade?.comment ?? null;
  }

  setComment(subjectId: string, studentUid: string, comment: string): Promise<void> {
    const ref = doc(this.firestore, 'grades', `${subjectId}_${studentUid}`);
    return setDoc(
      ref,
      {
        subjectId,
        studentUid,
        comment: comment.trim() || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, 'grades', id));
  }
}
