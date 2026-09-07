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
import type { GradeCategory } from './grades.model';

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
 * La rúbrica de cada materia (ver grades.model.ts). Solo el admin o el
 * profesor asignado a esa materia crea/edita/borra categorías (ver
 * firestore.rules); el listado en vivo se sincroniza completo para staff
 * (volumen trivial para un instituto chico) y se filtra por materia en el
 * cliente con `forSubject`.
 */
@Injectable({ providedIn: 'root' })
export class GradeCategoriesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _categories = signal<GradeCategory[]>([]);
  private readonly _loading = signal(true);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._categories.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'gradeCategories'),
        (snapshot) => {
          this._categories.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeCategory),
          );
          this._loading.set(false);
        },
        () => {
          this._categories.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Categorías de una materia, ordenadas para mostrar. */
  forSubject(subjectId: string): GradeCategory[] {
    return this._categories()
      .filter((category) => category.subjectId === subjectId)
      .sort((a, b) => a.order - b.order);
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForSubjectIds(subjectIds: string[]): Promise<GradeCategory[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const results: GradeCategory[] = [];
    for (const idsChunk of chunk(subjectIds, IN_QUERY_CHUNK_SIZE)) {
      const categoriesQuery = query(
        collection(this.firestore, 'gradeCategories'),
        where('subjectId', 'in', idsChunk),
      );
      const snapshot = await getDocs(categoriesQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeCategory));
    }
    return results;
  }

  async create(subjectId: string, name: string, weight: number): Promise<string> {
    const ref = doc(collection(this.firestore, 'gradeCategories'));
    await setDoc(ref, {
      subjectId,
      name: name.trim(),
      weight,
      order: this.forSubject(subjectId).length,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, fields: Partial<Pick<GradeCategory, 'name' | 'weight'>>) {
    return updateDoc(doc(this.firestore, 'gradeCategories', id), fields as DocumentData);
  }

  remove(id: string) {
    return deleteDoc(doc(this.firestore, 'gradeCategories', id));
  }
}
