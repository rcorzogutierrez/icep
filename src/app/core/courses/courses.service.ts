import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import { CourseStudentsService } from './course-students.service';
import { CourseSubjectsService } from './course-subjects.service';
import type { Course } from './courses.model';

/** Catálogo de cursos. Solo el admin crea/edita/borra (ver firestore.rules); cualquier autenticado puede leer. */
@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);

  private readonly _courses = signal<Course[]>([]);
  private readonly _loading = signal(true);

  readonly courses = this._courses.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._courses.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const coursesQuery = query(collection(this.firestore, 'courses'), orderBy('createdAt'));

      const unsubscribe = onSnapshot(
        coursesQuery,
        (snapshot) => {
          this._courses.set(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Course));
          this._loading.set(false);
        },
        () => {
          this._courses.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  async create(name: string): Promise<string> {
    const ref = doc(collection(this.firestore, 'courses'));
    await setDoc(ref, { name: name.trim(), createdAt: serverTimestamp() });
    return ref.id;
  }

  update(id: string, fields: Partial<Pick<Course, 'name'>>) {
    return updateDoc(doc(this.firestore, 'courses', id), fields as DocumentData);
  }

  /** Borra el curso y, con él, sus materias y estudiantes asignados. */
  async remove(id: string): Promise<void> {
    const [courseSubjects, courseStudents] = await Promise.all([
      this.courseSubjectsService.fetchForCourseIds([id]),
      this.courseStudentsService.fetchForCourseIds([id]),
    ]);
    await Promise.all([
      ...courseSubjects.map((cs) => this.courseSubjectsService.unassign(cs.id)),
      ...courseStudents.map((cs) => this.courseStudentsService.unassign(cs.id)),
    ]);
    await deleteDoc(doc(this.firestore, 'courses', id));
  }
}
