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
import { SubjectAssignmentsService } from '../subjects/subject-assignments.service';
import { UserProfileService } from '../users/user-profile.service';
import type { CourseSubjectTeacher } from './courses.model';

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
 * Quién dicta cada materia de un curso (paso 2, ver courses.model.ts —
 * el paso 1, quién participa del curso, es CourseTeachersService). A lo
 * sumo un profesor por materia dentro de un mismo curso: `assign` hace
 * upsert sobre el id determinístico `courseId_subjectId`, así que asignar
 * un profesor distinto REEMPLAZA al anterior en vez de sumarlo. Solo el
 * admin agrega/quita (ver firestore.rules); el listado en vivo se
 * sincroniza completo para staff (volumen trivial).
 *
 * `assign`/`unassign` acá TAMBIÉN mantienen `subjectAssignments` (materia
 * -> profesor, global, id determinístico `subjectId_teacherId`) como
 * tabla derivada — es lo único que leen `subjectAccessGuard` y las
 * reglas de grades/gradeCategories/assignments para decidir quién puede
 * calificar una materia, y no cambiamos esa infraestructura: solo
 * cambiamos quién la escribe (antes /admin/subjects a mano, ahora acá).
 * Al quitar o reemplazar una asignación, solo se revoca
 * `subjectAssignments` del profesor saliente si no dicta esa materia en
 * NINGÚN otro curso.
 */
@Injectable({ providedIn: 'root' })
export class CourseSubjectTeachersService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);

  private readonly _rows = signal<CourseSubjectTeacher[]>([]);
  private readonly _loading = signal(true);

  readonly rows = this._rows.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._rows.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'courseSubjectTeachers'),
        (snapshot) => {
          this._rows.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseSubjectTeacher),
          );
          this._loading.set(false);
        },
        () => {
          this._rows.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  forCourse(courseId: string): CourseSubjectTeacher[] {
    return this._rows().filter((r) => r.courseId === courseId);
  }

  /** El profesor (dentro de este curso) que dicta esta materia puntual, si hay uno. */
  forCourseSubject(courseId: string, subjectId: string): CourseSubjectTeacher | undefined {
    return this._rows().find((r) => r.courseId === courseId && r.subjectId === subjectId);
  }

  /** Fetch puntual (no reactivo) por curso; útil para borrar un curso. */
  async fetchForCourseIds(courseIds: string[]): Promise<CourseSubjectTeacher[]> {
    if (courseIds.length === 0) {
      return [];
    }
    const results: CourseSubjectTeacher[] = [];
    for (const idsChunk of chunk(courseIds, IN_QUERY_CHUNK_SIZE)) {
      const q = query(
        collection(this.firestore, 'courseSubjectTeachers'),
        where('courseId', 'in', idsChunk),
      );
      const snapshot = await getDocs(q);
      results.push(
        ...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseSubjectTeacher),
      );
    }
    return results;
  }

  /** Fetch puntual (no reactivo) por profesor; útil para borrar un usuario (ver UsersService.remove). */
  async fetchForTeacher(teacherId: string): Promise<CourseSubjectTeacher[]> {
    const q = query(
      collection(this.firestore, 'courseSubjectTeachers'),
      where('teacherId', '==', teacherId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseSubjectTeacher);
  }

  async assign(
    courseId: string,
    subjectId: string,
    teacherId: string,
    teacherName: string,
  ): Promise<void> {
    const id = `${courseId}_${subjectId}`;
    const previous = this._rows().find((r) => r.id === id);

    await setDoc(doc(this.firestore, 'courseSubjectTeachers', id), {
      courseId,
      subjectId,
      teacherId,
      teacherName,
      createdAt: serverTimestamp(),
    });
    // Upsert idempotente: asegura que subjectAssignments refleje que este
    // profesor puede calificar esta materia.
    await this.subjectAssignmentsService.assign(subjectId, teacherId, teacherName);

    if (previous && previous.teacherId !== teacherId) {
      const previousStillTeachesElsewhere = this._rows().some(
        (r) => r.id !== id && r.subjectId === subjectId && r.teacherId === previous.teacherId,
      );
      if (!previousStillTeachesElsewhere) {
        await this.subjectAssignmentsService.unassign(`${subjectId}_${previous.teacherId}`);
      }
    }
  }

  async unassign(row: CourseSubjectTeacher): Promise<void> {
    await deleteDoc(doc(this.firestore, 'courseSubjectTeachers', row.id));

    const stillTeachesElsewhere = this._rows().some(
      (r) => r.id !== row.id && r.subjectId === row.subjectId && r.teacherId === row.teacherId,
    );
    if (!stillTeachesElsewhere) {
      await this.subjectAssignmentsService.unassign(`${row.subjectId}_${row.teacherId}`);
    }
  }
}
