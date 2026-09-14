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
import { detectResourceProvider, type SubjectResource } from './subject-resources.model';

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
 * Links a recursos externos (Drive, Dropbox, cualquier URL) que un
 * profesor deja disponibles para una materia — ver subject-resources.model.ts
 * para el detalle de campos y cómo se detecta el proveedor. Solo el admin o
 * el profesor asignado a esa materia crea/borra (ver firestore.rules); el
 * listado en vivo se sincroniza completo para staff (volumen trivial) y se
 * filtra por materia en el cliente con `forSubject`.
 */
@Injectable({ providedIn: 'root' })
export class SubjectResourcesService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _resources = signal<SubjectResource[]>([]);
  private readonly _loading = signal(true);

  readonly resources = this._resources.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._resources.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'subjectResources'),
        (snapshot) => {
          this._resources.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubjectResource),
          );
          this._loading.set(false);
        },
        (error) => {
          console.error('[SubjectResourcesService] resources listener failed:', error);
          this._resources.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Recursos de una materia, los más nuevos primero. */
  forSubject(subjectId: string): SubjectResource[] {
    return this._resources()
      .filter((r) => r.subjectId === subjectId)
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }

  /** Fetch puntual (no reactivo), para el "Mis materias" del estudiante (que no sincroniza todo). */
  async fetchForSubjectIds(subjectIds: string[]): Promise<SubjectResource[]> {
    if (subjectIds.length === 0) {
      return [];
    }
    const results: SubjectResource[] = [];
    for (const idsChunk of chunk(subjectIds, IN_QUERY_CHUNK_SIZE)) {
      const resourcesQuery = query(
        collection(this.firestore, 'subjectResources'),
        where('subjectId', 'in', idsChunk),
      );
      const snapshot = await getDocs(resourcesQuery);
      results.push(...snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubjectResource));
    }
    return results;
  }

  async create(subjectId: string, title: string, url: string): Promise<void> {
    const user = this.authService.user();
    if (!user) {
      return;
    }
    const { provider, driveFileId } = detectResourceProvider(url);
    const ref = doc(collection(this.firestore, 'subjectResources'));
    await setDoc(ref, {
      subjectId,
      title: title.trim(),
      url: url.trim(),
      provider,
      driveFileId,
      createdBy: user.uid,
      createdByName: user.displayName ?? user.email ?? '',
      createdAt: serverTimestamp(),
    });
  }

  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, 'subjectResources', id));
  }
}
