import { Injectable, effect, inject, signal } from '@angular/core';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { GradeHistoryEntry } from './grade-history.model';

/**
 * `Omit` no distribuye sobre una unión discriminada — `Omit<A|B, K>` se
 * aplana a los campos en común, perdiendo `assignmentId`/`previousComment`/
 * etc. de cada variante. Esta sí distribuye.
 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/**
 * Auditoría de cambios de nota (ver grade-history.model.ts). Solo staff
 * puede leerla (mismo motivo que `grades.list`: es una herramienta de
 * revisión, no algo que el estudiante consulta directo); `GradesService`
 * es el único que escribe acá, un registro por cada cambio real de
 * puntaje (ver `setScore`).
 */
@Injectable({ providedIn: 'root' })
export class GradeHistoryService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _entries = signal<GradeHistoryEntry[]>([]);
  private readonly _loading = signal(true);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._entries.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'gradeHistory'),
        (snapshot) => {
          this._entries.set(
            snapshot.docs.map((d) => {
              const data = d.data();
              // Documentos de antes de que existiera `kind` (todos eran de
              // nota) — sin esto quedarían sin `kind` y el template no
              // sabría cómo renderizarlos.
              return { id: d.id, kind: 'score', ...data } as GradeHistoryEntry;
            }),
          );
          this._loading.set(false);
        },
        (error) => {
          console.error('[GradeHistoryService] history listener failed:', error);
          this._entries.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Cambios de nota de un estudiante en una materia, los más nuevos primero. */
  forStudent(subjectId: string, studentUid: string): GradeHistoryEntry[] {
    return this._entries()
      .filter((e) => e.subjectId === subjectId && e.studentUid === studentUid)
      .sort((a, b) => (b.changedAt?.toMillis() ?? 0) - (a.changedAt?.toMillis() ?? 0));
  }

  record(entry: DistributiveOmit<GradeHistoryEntry, 'id' | 'changedAt'>): Promise<void> {
    const ref = doc(collection(this.firestore, 'gradeHistory'));
    return setDoc(ref, { ...entry, changedAt: serverTimestamp() });
  }
}
