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
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { Assignment } from './assignments.model';

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
 * Las tareas individuales de cada categoría (ver assignments.model.ts).
 * Solo el admin o el profesor asignado a esa materia crea/edita/borra (ver
 * firestore.rules); el listado en vivo se sincroniza completo para staff
 * (volumen trivial para un instituto chico) y se filtra por materia/
 * categoría en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class AssignmentsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _assignments = signal<Assignment[]>([]);
  private readonly _loading = signal(true);

  readonly assignments = this._assignments.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._assignments.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'assignments'),
        (snapshot) => {
          this._assignments.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment),
          );
          this._loading.set(false);
        },
        () => {
          this._assignments.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Tareas de una materia, ordenadas para mostrar. */
  forSubject(subjectId: string): Assignment[] {
    return this._assignments()
      .filter((assignment) => assignment.subjectId === subjectId)
      .sort((a, b) => a.order - b.order);
  }

  /** Tareas de una categoría puntual, ordenadas. */
  forCategory(categoryId: string): Assignment[] {
    return this._assignments()
      .filter((assignment) => assignment.categoryId === categoryId)
      .sort((a, b) => a.order - b.order);
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForSubjectIds(subjectIds: string[]): Promise<Assignment[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const results: Assignment[] = [];
    for (const idsChunk of chunk(subjectIds, IN_QUERY_CHUNK_SIZE)) {
      const assignmentsQuery = query(
        collection(this.firestore, 'assignments'),
        where('subjectId', 'in', idsChunk),
      );
      const snapshot = await getDocs(assignmentsQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment));
    }
    return results;
  }

  async create(
    subjectId: string,
    categoryId: string,
    name: string,
    pointsPossible: number,
    dueDate: Date | null,
  ): Promise<string> {
    const ref = doc(collection(this.firestore, 'assignments'));
    await setDoc(ref, {
      subjectId,
      categoryId,
      name: name.trim(),
      pointsPossible,
      dueDate,
      order: this.forCategory(categoryId).length,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(
    id: string,
    fields: Partial<Pick<Assignment, 'name' | 'pointsPossible'>> & { dueDate?: Date | null },
  ) {
    return updateDoc(doc(this.firestore, 'assignments', id), fields as DocumentData);
  }

  remove(id: string) {
    return deleteDoc(doc(this.firestore, 'assignments', id));
  }
}
