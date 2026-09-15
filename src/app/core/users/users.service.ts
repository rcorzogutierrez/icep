import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CourseStudentsService } from '../courses/course-students.service';
import { CourseSubjectTeachersService } from '../courses/course-subject-teachers.service';
import { CourseTeachersService } from '../courses/course-teachers.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { UserProfile, UserRole } from './users.model';

/**
 * Listado en vivo de todos los usuarios (users/*), para el panel de admin.
 * Se suscribe solo mientras hay sesión (las Security Rules de todos modos
 * rechazan la lectura a quien no sea admin, pero no tiene sentido abrir la
 * suscripción sin usuario).
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly courseStudentsService = inject(CourseStudentsService);
  private readonly courseTeachersService = inject(CourseTeachersService);
  private readonly courseSubjectTeachersService = inject(CourseSubjectTeachersService);

  private readonly _users = signal<UserProfile[]>([]);
  private readonly _loading = signal(true);

  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (!this.authService.user()) {
        this._users.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const usersQuery = query(collection(this.firestore, 'users'), orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(
        usersQuery,
        (snapshot) => {
          this._users.set(snapshot.docs.map((d) => d.data() as UserProfile));
          this._loading.set(false);
        },
        (error) => {
          // Este servicio se suscribe para cualquier usuario logueado, sin
          // filtrar por rol — un no-admin/no-profesor no tiene permiso de
          // leer esta colección (ver firestore.rules) y el listener falla
          // en silencio para ESE caso puntual, a propósito (pasa en cada
          // sesión de cada estudiante, no es un problema). Cualquier otra
          // causa (índice faltante, red caída, etc.) sí se loguea.
          if (error.code !== 'permission-denied') {
            console.error('[UsersService] users listener failed:', error);
          }
          this._users.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  approve(uid: string) {
    return this.setStatus(uid, 'approved');
  }

  reject(uid: string) {
    return this.setStatus(uid, 'rejected');
  }

  private setStatus(uid: string, status: 'approved' | 'rejected') {
    return updateDoc(doc(this.firestore, 'users', uid), {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * No toca `enrolledSubjectIds`: si un estudiante pasa a profesor ese
   * campo queda huérfano pero inofensivo (nada lo lee para un no-estudiante).
   *
   * Si el nuevo rol es "student", revoca sus asignaciones de profesor
   * (courseTeachers/courseSubjectTeachers/subjectAssignments derivado): no
   * es solo prolijidad — la regla de escritura de grades/gradeCategories/
   * assignments solo chequea `exists(subjectAssignments/...)`, no el rol
   * actual, así que sin esto un profesor recién degradado conservaría
   * permiso real de escritura sobre esa materia.
   *
   * Si el nuevo rol NO es "student" (pasa a profesor o admin), revoca sus
   * `courseStudents`: acá no hay riesgo de seguridad (esa tabla no
   * habilita nada por sí sola), pero dejarla inflaría de por vida el
   * contador de "estudiantes" de esos cursos con alguien que ya no lo es.
   */
  /** El cambio de rol y la revocación de accesos van en el mismo `writeBatch` — o se aplica todo, o no se aplica nada (ver el comentario en CoursesService.remove sobre por qué). */
  async updateRole(uid: string, role: UserRole): Promise<void> {
    const batch = writeBatch(this.firestore);
    if (role === 'student') {
      await this.revokeTeachingAccess(uid, batch);
    } else {
      await this.revokeStudentEnrollments(uid, batch);
    }
    batch.update(doc(this.firestore, 'users', uid), {
      role,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  private async revokeTeachingAccess(uid: string, batch: WriteBatch): Promise<void> {
    const [courseTeacherRows, courseSubjectTeacherRows] = await Promise.all([
      this.courseTeachersService.fetchForTeacher(uid),
      this.courseSubjectTeachersService.fetchForTeacher(uid),
    ]);

    await Promise.all(
      courseSubjectTeacherRows.map((row) =>
        this.courseSubjectTeachersService.unassign(row, batch),
      ),
    );
    await Promise.all(
      courseTeacherRows.map((row) => this.courseTeachersService.unassign(row.id, batch)),
    );
  }

  private async revokeStudentEnrollments(uid: string, batch: WriteBatch): Promise<void> {
    const courseStudentRows = await this.courseStudentsService.fetchForStudent(uid);
    await Promise.all(
      courseStudentRows.map((row) => this.courseStudentsService.unassign(row.id, batch)),
    );
  }

  /**
   * Borra el perfil (users/{uid}), no la cuenta de Firebase Auth
   * subyacente: eso requiere Admin SDK (no disponible desde el cliente).
   * La persona podría volver a iniciar sesión con esa misma cuenta, pero
   * caería en /no-invitation sin un código nuevo — mismo efecto de acceso
   * que "reject", solo que sin dejar el registro en la lista.
   *
   * Antes de borrar el perfil, limpia toda referencia a este uid en las
   * tablas de curso (courseStudents/courseTeachers/courseSubjectTeachers) —
   * si no, quedan filas huérfanas: un curso puede mostrar "1 estudiante"
   * apuntando a un uid que ya no existe. Se consulta por uid en las tres
   * (no solo la del rol actual) porque un usuario pudo haber tenido otro
   * rol antes. courseSubjectTeachers primero, como en CoursesService.remove
   * — su unassign también revoca subjectAssignments cuando corresponde.
   */
  async remove(uid: string): Promise<void> {
    const [courseStudentRows, courseTeacherRows, courseSubjectTeacherRows] = await Promise.all([
      this.courseStudentsService.fetchForStudent(uid),
      this.courseTeachersService.fetchForTeacher(uid),
      this.courseSubjectTeachersService.fetchForTeacher(uid),
    ]);

    const batch = writeBatch(this.firestore);
    await Promise.all(
      courseSubjectTeacherRows.map((row) =>
        this.courseSubjectTeachersService.unassign(row, batch),
      ),
    );
    await Promise.all([
      ...courseStudentRows.map((row) => this.courseStudentsService.unassign(row.id, batch)),
      ...courseTeacherRows.map((row) => this.courseTeachersService.unassign(row.id, batch)),
    ]);

    batch.delete(doc(this.firestore, 'users', uid));
    await batch.commit();
  }
}
