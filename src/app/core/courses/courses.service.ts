import { Injectable, effect, inject, signal } from '@angular/core';
import {
  Timestamp,
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
import { CourseSubjectTeachersService } from './course-subject-teachers.service';
import { CourseSubjectsService } from './course-subjects.service';
import { CourseTeachersService } from './course-teachers.service';
import type { Course } from './courses.model';

/** Catálogo de cursos. Solo el admin crea/edita/borra (ver firestore.rules); cualquier autenticado puede leer. */
@Injectable({ providedIn: 'root' })
export class CoursesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseTeachersService = inject(CourseTeachersService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);

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

  async create(name: string, startDate: Date, endDate: Date): Promise<string> {
    const ref = doc(collection(this.firestore, 'courses'));
    await setDoc(ref, {
      name: name.trim(),
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, fields: Partial<Pick<Course, 'name' | 'startDate' | 'endDate'>>) {
    return updateDoc(doc(this.firestore, 'courses', id), fields as DocumentData);
  }

  /** Borra el curso y, con él, sus materias, estudiantes, profesores y asignaciones materia-profesor. */
  async remove(id: string): Promise<void> {
    const [courseSubjects, courseStudents, courseTeachers, courseSubjectTeachers] =
      await Promise.all([
        this.courseSubjectsService.fetchForCourseIds([id]),
        this.courseStudentsService.fetchForCourseIds([id]),
        this.courseTeachersService.fetchForCourseIds([id]),
        this.courseSubjectTeachersService.fetchForCourseIds([id]),
      ]);
    // Las asignaciones materia-profesor primero (pueden revocar
    // subjectAssignments), después el resto.
    await Promise.all(
      courseSubjectTeachers.map((row) => this.courseSubjectTeachersService.unassign(row)),
    );
    await Promise.all([
      ...courseSubjects.map((cs) => this.courseSubjectsService.unassign(cs.id)),
      ...courseStudents.map((cs) => this.courseStudentsService.unassign(cs.id)),
      ...courseTeachers.map((ct) => this.courseTeachersService.unassign(ct.id)),
    ]);
    await deleteDoc(doc(this.firestore, 'courses', id));
  }
}
