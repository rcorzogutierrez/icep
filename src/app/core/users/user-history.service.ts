import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type WriteBatch,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from './user-profile.service';
import type { UserHistoryEntry } from './user-history.model';

/**
 * Auditoría de cambios de rol/estado de cuentas (ver user-history.model.ts).
 * Solo admin lee — un cambio de rol/estado es siempre una acción de admin
 * (ver firestore.rules), así que a diferencia de gradeHistory esto no es
 * algo que le interese a un profesor. `UsersService` es el único que
 * escribe acá, un registro por cada cambio real (nunca en un no-op, mismo
 * criterio que GradesService.setScore).
 */
@Injectable({ providedIn: 'root' })
export class UserHistoryService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _entries = signal<UserHistoryEntry[]>([]);
  private readonly _loading = signal(true);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isAdmin = this.userProfileService.isAdmin();

      if (!user || !isAdmin) {
        this._entries.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(
        collection(this.firestore, 'userHistory'),
        (snapshot) => {
          this._entries.set(
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as UserHistoryEntry),
          );
          this._loading.set(false);
        },
        (error) => {
          console.error('[UserHistoryService] history listener failed:', error);
          this._entries.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  /** Cambios de rol/estado de una cuenta, los más nuevos primero. */
  forUser(targetUid: string): UserHistoryEntry[] {
    return this._entries()
      .filter((e) => e.targetUid === targetUid)
      .sort((a, b) => (b.changedAt?.toMillis() ?? 0) - (a.changedAt?.toMillis() ?? 0));
  }

  /** `batch`: si se pasa, encola el registro en vez de commitear solo — va siempre junto con el cambio real en UsersService. */
  record(
    entry: Omit<UserHistoryEntry, 'id' | 'changedAt'>,
    batch?: WriteBatch,
  ): void | Promise<void> {
    const ref = doc(collection(this.firestore, 'userHistory'));
    const data = { ...entry, changedAt: serverTimestamp() };
    if (batch) {
      batch.set(ref, data);
      return;
    }
    return setDoc(ref, data);
  }
}
