import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CourseSubjectTeachersService } from '../courses/course-subject-teachers.service';
import { CourseSubjectsService } from '../courses/course-subjects.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { GradeCategoriesService } from '../grades/grade-categories.service';
import { GradesService } from '../grades/grades.service';
import { UserProfileService } from '../users/user-profile.service';
import { SubjectAssignmentsService } from './subject-assignments.service';
import type { Subject } from './subjects.model';

/** Firestore permite hasta 30 valores por cláusula "in". */
const IN_QUERY_CHUNK_SIZE = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Catálogo de materias. Solo el admin crea/edita/borra (ver firestore.rules); profesores y admin pueden listar. */
@Injectable({ providedIn: 'root' })
export class SubjectsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly subjectAssignmentsService = inject(SubjectAssignmentsService);
  private readonly courseSubjectsService = inject(CourseSubjectsService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);
  private readonly gradeCategoriesService = inject(GradeCategoriesService);
  private readonly gradesService = inject(GradesService);

  private readonly _subjects = signal<Subject[]>([]);
  private readonly _loading = signal(true);

  readonly subjects = this._subjects.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Las materias que enseña el profesor logueado (para el checklist de invitaciones). */
  readonly mySubjects = computed(() => {
    const uid = this.authService.user()?.uid;
    if (!uid) {
      return [];
    }
    const myIds = new Set(
      this.subjectAssignmentsService
        .assignments()
        .filter((assignment) => assignment.teacherId === uid)
        .map((assignment) => assignment.subjectId),
    );
    return this._subjects().filter((subject) => myIds.has(subject.id));
  });

  constructor() {
    effect((onCleanup) => {
      // Esperar a que resuelva la sesión Y el perfil (mismo motivo que en
      // InvitationsService/UserProfileService: evitar decidir "sin acceso"
      // con datos todavía no cargados).
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._subjects.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const subjectsQuery = query(collection(this.firestore, 'subjects'), orderBy('name'));

      const unsubscribe = onSnapshot(
        subjectsQuery,
        (snapshot) => {
          this._subjects.set(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Subject));
          this._loading.set(false);
        },
        () => {
          this._subjects.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  async create(name: string, code: string): Promise<string> {
    const ref = doc(collection(this.firestore, 'subjects'));
    await setDoc(ref, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  /** Fetch puntual (no reactivo) de materias por id, para el "Mis materias" del estudiante. */
  async fetchByIds(ids: string[]): Promise<Subject[]> {
    if (ids.length === 0) {
      return [];
    }
    const results: Subject[] = [];
    for (const idsChunk of chunk(ids, IN_QUERY_CHUNK_SIZE)) {
      const subjectsQuery = query(
        collection(this.firestore, 'subjects'),
        where(documentId(), 'in', idsChunk),
      );
      const snapshot = await getDocs(subjectsQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Subject));
    }
    return results;
  }

  update(id: string, fields: Partial<Pick<Subject, 'name' | 'code'>>) {
    return updateDoc(doc(this.firestore, 'subjects', id), fields as DocumentData);
  }

  /**
   * Borra la materia y, con ella, todo lo que cuelga de ella: asignaciones
   * de profesor (globales y por curso), rúbrica (categorías, que a su vez
   * cascadean sus tareas), notas cargadas, y los vínculos con los cursos
   * que la incluían.
   */
  async remove(id: string): Promise<void> {
    const assignments = await this.subjectAssignmentsService.fetchBySubjectIds([id]);
    const categories = this.gradeCategoriesService.forSubject(id);
    const grades = this.gradesService.forSubject(id);
    const courseSubjectRows = this.courseSubjectsService.forSubject(id);
    const courseSubjectTeacherRows = courseSubjectRows.flatMap((cs) =>
      this.courseSubjectTeachersService.forCourse(cs.courseId).filter((r) => r.subjectId === id),
    );

    await Promise.all(
      courseSubjectTeacherRows.map((row) => this.courseSubjectTeachersService.unassign(row)),
    );

    await Promise.all([
      ...assignments.map((assignment) => this.subjectAssignmentsService.unassign(assignment.id)),
      ...categories.map((category) => this.gradeCategoriesService.remove(category.id)),
      ...grades.map((grade) => this.gradesService.remove(grade.id)),
      ...courseSubjectRows.map((row) => this.courseSubjectsService.unassign(row.id)),
    ]);

    await deleteDoc(doc(this.firestore, 'subjects', id));
  }
}
