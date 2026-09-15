import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { SubjectAssignmentsService } from '../subjects/subject-assignments.service';
import { UserProfileService } from '../users/user-profile.service';
import type { GradeComment } from './grade-comments.model';
import { GradesService } from './grades.service';

/**
 * Comentarios del profesor a un estudiante en una materia (ver
 * grade-comments.model.ts) — varios en el tiempo, con fecha y categoría
 * opcional, a diferencia del viejo `Grade.comment` (un único valor). Solo
 * `create` (nunca `update`/`delete`, ver firestore.rules); el listado en
 * vivo se sincroniza completo para staff (volumen trivial) y se filtra por
 * materia+estudiante en el cliente con `forStudent`. El estudiante resuelve
 * los suyos con `fetchOwn` (query puntual filtrada solo por su propio uid,
 * sin necesitar un índice compuesto).
 */
@Injectable({ providedIn: 'root' })
export class GradeCommentsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  private readonly gradesService = inject(GradesService);

  private readonly _comments = signal<GradeComment[]>([]);
  private readonly _loading = signal(true);

  readonly comments = this._comments.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._comments.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'gradeComments'),
        (snapshot) => {
          this._comments.set(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeComment));
          this._loading.set(false);
        },
        (error) => {
          console.error('[GradeCommentsService] comments listener failed:', error);
          this._comments.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });

    /**
     * Migra el viejo `Grade.comment` (un único valor por materia+
     * estudiante) a un comentario nuevo la primera vez que alguien con
     * acceso de escritura entra, para no perder lo que ya se había
     * escrito con el sistema anterior. `createdByName` queda vacío a
     * propósito — no sabemos quién lo escribió originalmente, y atribuirlo
     * a quien dispara la migración sería incorrecto; la UI muestra un
     * fallback ("Comentario anterior") cuando el nombre viene vacío. Usa
     * `grade.updatedAt` como fecha aproximada (lo único que había). Solo
     * migra lo que esta cuenta puede escribir de verdad (mismo criterio
     * que el resto de la app: admin todo, profesor solo sus materias) para
     * no dispararle un `permission-denied` por una materia ajena.
     * Idempotente: en cuanto existe al menos un comentario para esa
     * materia+estudiante, no se vuelve a migrar.
     */
    effect(() => {
      if (
        this._loading() ||
        this.gradesService.loading() ||
        this.subjectAssignmentsService.loading()
      ) {
        return;
      }

      const isAdmin = this.userProfileService.isAdmin();
      const uid = this.authService.user()?.uid;
      const mySubjectIds = isAdmin
        ? null
        : new Set(
            this.subjectAssignmentsService
              .assignments()
              .filter((a) => a.teacherId === uid)
              .map((a) => a.subjectId),
          );

      for (const grade of this.gradesService.grades()) {
        if (!grade.comment) {
          continue;
        }
        if (!isAdmin && !mySubjectIds!.has(grade.subjectId)) {
          continue;
        }
        if (this.forStudent(grade.subjectId, grade.studentUid).length > 0) {
          continue;
        }
        const ref = doc(collection(this.firestore, 'gradeComments'));
        setDoc(ref, {
          subjectId: grade.subjectId,
          studentUid: grade.studentUid,
          text: grade.comment,
          categoryId: null,
          categoryName: null,
          createdBy: uid,
          createdByName: '',
          createdAt: grade.updatedAt,
        }).catch((error) => {
          console.error('[GradeCommentsService] legacy comment migration failed:', error);
        });
      }
    });
  }

  /** Comentarios de un estudiante en una materia, los más nuevos primero. */
  forStudent(subjectId: string, studentUid: string): GradeComment[] {
    return this._comments()
      .filter((c) => c.subjectId === subjectId && c.studentUid === studentUid)
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }

  /** Fetch puntual (no reactivo) de los propios comentarios, para el dashboard del estudiante — todas sus materias a la vez, sin índice compuesto (un solo `where`). */
  async fetchOwn(studentUid: string): Promise<GradeComment[]> {
    const commentsQuery = query(
      collection(this.firestore, 'gradeComments'),
      where('studentUid', '==', studentUid),
    );
    const snapshot = await getDocs(commentsQuery);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeComment);
  }

  async add(
    subjectId: string,
    studentUid: string,
    text: string,
    categoryId: string | null,
    categoryName: string | null,
  ): Promise<void> {
    const user = this.authService.user();
    if (!user) {
      return;
    }
    const ref = doc(collection(this.firestore, 'gradeComments'));
    await setDoc(ref, {
      subjectId,
      studentUid,
      text: text.trim(),
      categoryId,
      categoryName,
      createdBy: user.uid,
      createdByName:
        this.userProfileService.profile()?.displayName ?? user.displayName ?? user.email ?? '',
      createdAt: serverTimestamp(),
    });
  }
}
