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
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { CourseStudent } from './courses.model';

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
 * Qué estudiantes tiene cada curso (ver courses.model.ts). Solo el admin
 * agrega/quita (ver firestore.rules); el listado en vivo se sincroniza
 * completo para staff (volumen trivial) y se filtra en el cliente. Un
 * estudiante resuelve los suyos con `fetchForStudent` (no sincroniza todo).
 */
@Injectable({ providedIn: 'root' })
export class CourseStudentsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _courseStudents = signal<CourseStudent[]>([]);
  private readonly _loading = signal(true);

  readonly courseStudents = this._courseStudents.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._courseStudents.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'courseStudents'),
        (snapshot) => {
          this._courseStudents.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseStudent),
          );
          this._loading.set(false);
        },
        () => {
          this._courseStudents.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  forCourse(courseId: string): CourseStudent[] {
    return this._courseStudents().filter((cs) => cs.courseId === courseId);
  }

  /** Cursos en los que están estos alumnos (para el roster del gradebook). */
  forCourseIds(courseIds: string[]): CourseStudent[] {
    const ids = new Set(courseIds);
    return this._courseStudents().filter((cs) => ids.has(cs.courseId));
  }

  /** Fetch puntual (no reactivo) de asignaciones por curso; útil para borrar un curso. */
  async fetchForCourseIds(courseIds: string[]): Promise<CourseStudent[]> {
    if (courseIds.length === 0) {
      return [];
    }
    const results: CourseStudent[] = [];
    for (const idsChunk of chunk(courseIds, IN_QUERY_CHUNK_SIZE)) {
      const q = query(
        collection(this.firestore, 'courseStudents'),
        where('courseId', 'in', idsChunk),
      );
      const snapshot = await getDocs(q);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseStudent));
    }
    return results;
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForStudent(studentUid: string): Promise<CourseStudent[]> {
    const q = query(
      collection(this.firestore, 'courseStudents'),
      where('studentUid', '==', studentUid),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseStudent);
  }

  async assign(courseId: string, studentUid: string, studentName: string): Promise<void> {
    const ref = doc(this.firestore, 'courseStudents', `${courseId}_${studentUid}`);
    await setDoc(ref, { courseId, studentUid, studentName, createdAt: serverTimestamp() });
  }

  unassign(id: string) {
    return deleteDoc(doc(this.firestore, 'courseStudents', id));
  }
}
