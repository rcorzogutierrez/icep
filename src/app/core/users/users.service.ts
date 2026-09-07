import { Injectable, effect, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { UserProfile } from './users.model';

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
        () => {
          // Un no-admin no tiene permiso de leer esta colección (ver
          // firestore.rules): el listener falla en silencio para esos casos,
          // el adminGuard ya evita que lleguen acá.
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
}
