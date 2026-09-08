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
import type { CourseSubject } from './courses.model';

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
 * Qué materias tiene cada curso (ver courses.model.ts). Solo el admin
 * agrega/quita (ver firestore.rules); el listado en vivo se sincroniza
 * completo para staff (volumen trivial) y se filtra en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class CourseSubjectsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _courseSubjects = signal<CourseSubject[]>([]);
  private readonly _loading = signal(true);

  readonly courseSubjects = this._courseSubjects.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._courseSubjects.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'courseSubjects'),
        (snapshot) => {
          this._courseSubjects.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseSubject),
          );
          this._loading.set(false);
        },
        () => {
          this._courseSubjects.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  forCourse(courseId: string): CourseSubject[] {
    return this._courseSubjects().filter((cs) => cs.courseId === courseId);
  }

  /** Cursos que incluyen esta materia (para el roster del gradebook). */
  forSubject(subjectId: string): CourseSubject[] {
    return this._courseSubjects().filter((cs) => cs.subjectId === subjectId);
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForCourseIds(courseIds: string[]): Promise<CourseSubject[]> {
    if (courseIds.length === 0) {
      return [];
    }
    const results: CourseSubject[] = [];
    for (const idsChunk of chunk(courseIds, IN_QUERY_CHUNK_SIZE)) {
      const q = query(
        collection(this.firestore, 'courseSubjects'),
        where('courseId', 'in', idsChunk),
      );
      const snapshot = await getDocs(q);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseSubject));
    }
    return results;
  }

  async assign(
    courseId: string,
    subjectId: string,
    subjectName: string,
    subjectCode: string,
  ): Promise<void> {
    const ref = doc(this.firestore, 'courseSubjects', `${courseId}_${subjectId}`);
    await setDoc(ref, {
      courseId,
      subjectId,
      subjectName,
      subjectCode,
      createdAt: serverTimestamp(),
    });
  }

  unassign(id: string) {
    return deleteDoc(doc(this.firestore, 'courseSubjects', id));
  }
}
