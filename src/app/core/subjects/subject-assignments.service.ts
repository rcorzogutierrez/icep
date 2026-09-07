import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { SubjectAssignment } from './subject-assignments.model';

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
 * Quién enseña cada materia (relación muchos a muchos, ver
 * subject-assignments.model.ts). Solo el admin crea/borra asignaciones (ver
 * firestore.rules); el listado en vivo solo se sincroniza para admin/
 * profesor (staff) — un estudiante resuelve las suyas con `fetchBySubjectIds`.
 */
@Injectable({ providedIn: 'root' })
export class SubjectAssignmentsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _assignments = signal<SubjectAssignment[]>([]);
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
      const assignmentsQuery = query(
        collection(this.firestore, 'subjectAssignments'),
        orderBy('createdAt'),
      );

      const unsubscribe = onSnapshot(
        assignmentsQuery,
        (snapshot) => {
          this._assignments.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubjectAssignment),
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

  /** Fetch puntual (no reactivo) de asignaciones por materia, para el "Mis materias" del estudiante. */
  async fetchBySubjectIds(subjectIds: string[]): Promise<SubjectAssignment[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const results: SubjectAssignment[] = [];
    for (const idsChunk of chunk(subjectIds, IN_QUERY_CHUNK_SIZE)) {
      const assignmentsQuery = query(
        collection(this.firestore, 'subjectAssignments'),
        where('subjectId', 'in', idsChunk),
      );
      const snapshot = await getDocs(assignmentsQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubjectAssignment));
    }
    return results;
  }

  async assign(subjectId: string, teacherId: string, teacherName: string): Promise<void> {
    const ref = doc(collection(this.firestore, 'subjectAssignments'));
    await setDoc(ref, { subjectId, teacherId, teacherName, createdAt: serverTimestamp() });
  }

  unassign(assignmentId: string) {
    return deleteDoc(doc(this.firestore, 'subjectAssignments', assignmentId));
  }
}
