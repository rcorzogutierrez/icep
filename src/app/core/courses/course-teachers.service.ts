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
import type { CourseTeacher } from './courses.model';

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
 * Qué profesores participan de cada curso (paso 1, ver courses.model.ts —
 * el paso 2, quién dicta cada materia, es CourseSubjectTeachersService).
 * Solo el admin agrega/quita (ver firestore.rules); el listado en vivo se
 * sincroniza completo para staff (volumen trivial).
 */
@Injectable({ providedIn: 'root' })
export class CourseTeachersService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _courseTeachers = signal<CourseTeacher[]>([]);
  private readonly _loading = signal(true);

  readonly courseTeachers = this._courseTeachers.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._courseTeachers.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'courseTeachers'),
        (snapshot) => {
          this._courseTeachers.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseTeacher),
          );
          this._loading.set(false);
        },
        () => {
          this._courseTeachers.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  forCourse(courseId: string): CourseTeacher[] {
    return this._courseTeachers().filter((ct) => ct.courseId === courseId);
  }

  /** Fetch puntual (no reactivo) por curso; útil para borrar un curso. */
  async fetchForCourseIds(courseIds: string[]): Promise<CourseTeacher[]> {
    if (courseIds.length === 0) {
      return [];
    }
    const results: CourseTeacher[] = [];
    for (const idsChunk of chunk(courseIds, IN_QUERY_CHUNK_SIZE)) {
      const q = query(
        collection(this.firestore, 'courseTeachers'),
        where('courseId', 'in', idsChunk),
      );
      const snapshot = await getDocs(q);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseTeacher));
    }
    return results;
  }

  /** Fetch puntual (no reactivo) por profesor; útil para borrar un usuario (ver UsersService.remove). */
  async fetchForTeacher(teacherId: string): Promise<CourseTeacher[]> {
    const q = query(
      collection(this.firestore, 'courseTeachers'),
      where('teacherId', '==', teacherId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseTeacher);
  }

  async assign(courseId: string, teacherId: string, teacherName: string): Promise<void> {
    const ref = doc(this.firestore, 'courseTeachers', `${courseId}_${teacherId}`);
    await setDoc(ref, { courseId, teacherId, teacherName, createdAt: serverTimestamp() });
  }

  unassign(id: string) {
    return deleteDoc(doc(this.firestore, 'courseTeachers', id));
  }
}
