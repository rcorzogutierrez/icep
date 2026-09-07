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
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
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

  private readonly _subjects = signal<Subject[]>([]);
  private readonly _loading = signal(true);

  readonly subjects = this._subjects.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** Las materias del profesor logueado (para el checklist de invitaciones). */
  readonly mySubjects = computed(() => {
    const uid = this.authService.user()?.uid;
    return this._subjects().filter((subject) => subject.teacherId === uid);
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

  async create(
    name: string,
    code: string,
    teacherId: string | null,
    teacherName: string | null,
  ): Promise<string> {
    const ref = doc(collection(this.firestore, 'subjects'));
    await setDoc(ref, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      teacherId,
      teacherName,
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

  update(id: string, fields: Partial<Pick<Subject, 'name' | 'teacherId' | 'teacherName'>>) {
    return updateDoc(doc(this.firestore, 'subjects', id), fields as DocumentData);
  }

  remove(id: string) {
    return deleteDoc(doc(this.firestore, 'subjects', id));
  }
}
