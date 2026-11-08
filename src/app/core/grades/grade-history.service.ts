import { Injectable, effect, inject, signal, type Signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import type { GradeHistoryEntry } from './grade-history.model';

/** Estudiante + oferta de curso cuyo historial se quiere ver. */
export interface GradeHistoryTarget {
  courseId: string;
  subjectId: string;
  studentUid: string;
}

/**
 * Auditoría de cambios de nota (ver grade-history.model.ts). Solo staff
 * puede leerla (mismo motivo que `grades.list`: es una herramienta de
 * revisión, no algo que el estudiante consulta directo); `GradesService`
 * es el único que escribe acá, un registro por cada cambio real de
 * puntaje (ver `setScore`).
 *
 * A diferencia del resto de los servicios de `core/`, este NO mantiene un
 * listener global de la colección: `gradeHistory` solo crece (nunca se
 * borra nada) y se consulta para UN estudiante a la vez, desde un modal.
 * Sincronizarla entera en cada sesión de staff hacía que cada profesor
 * descargara el historial completo de la institución al entrar. Ahora cada
 * modal abre su propia consulta acotada con `watchStudent` y la cierra al
 * cerrarse.
 */
@Injectable({ providedIn: 'root' })
export class GradeHistoryService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  /**
   * Historial en vivo de UN estudiante en una oferta de curso, los cambios
   * más nuevos primero. Escucha solo mientras `target()` no sea null (es
   * decir, mientras el modal esté abierto) y se cierra solo cuando el
   * target cambia o el componente se destruye.
   *
   * Llamar en un contexto de inyección (inicializador de campo de un
   * componente). La consulta usa solo igualdades, así que no necesita
   * índice compuesto.
   */
  watchStudent(target: () => GradeHistoryTarget | null): {
    entries: Signal<GradeHistoryEntry[]>;
    loading: Signal<boolean>;
  } {
    const entries = signal<GradeHistoryEntry[]>([]);
    const loading = signal(false);

    effect((onCleanup) => {
      const current = target();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!current || !this.authService.user() || !isStaff) {
        entries.set([]);
        loading.set(false);
        return;
      }

      entries.set([]);
      loading.set(true);
      const unsubscribe = onSnapshot(
        query(
          collection(this.firestore, 'gradeHistory'),
          where('courseId', '==', current.courseId),
          where('subjectId', '==', current.subjectId),
          where('studentUid', '==', current.studentUid),
        ),
        (snapshot) => {
          entries.set(
            snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }) as GradeHistoryEntry)
              .sort((a, b) => (b.changedAt?.toMillis() ?? 0) - (a.changedAt?.toMillis() ?? 0)),
          );
          loading.set(false);
        },
        (error) => {
          console.error('[GradeHistoryService] history listener failed:', error);
          entries.set([]);
          loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });

    return { entries: entries.asReadonly(), loading: loading.asReadonly() };
  }

  record(entry: Omit<GradeHistoryEntry, 'id' | 'changedAt'>): Promise<void> {
    const ref = doc(collection(this.firestore, 'gradeHistory'));
    return setDoc(ref, { ...entry, changedAt: serverTimestamp() });
  }
}
