import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { UserProfile } from './users.model';

/**
 * Perfil de aprobación de acceso (users/{uid}) del usuario autenticado.
 * Se crea solo en el primer login (status "pending") y de ahí en más solo
 * lo puede tocar un admin (ver firestore.rules). Mismo patrón que
 * AuthService: callback nativo (`onSnapshot`) volcado a signal a mano
 * dentro de un `effect()`, desuscripto con su `onCleanup` cuando cambia el
 * usuario o el servicio se destruye.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);

  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _loading = signal(true);

  readonly profile = this._profile.asReadonly();
  /** true mientras todavía no llegó el primer snapshot del perfil. */
  readonly loading = this._loading.asReadonly();
  readonly status = computed(() => this._profile()?.status ?? null);
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');

  constructor() {
    effect((onCleanup) => {
      const user = this.authService.user();

      if (!user) {
        this._profile.set(null);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const ref = doc(this.firestore, 'users', user.uid);

      const unsubscribe = onSnapshot(ref, (snapshot) => {
        if (!snapshot.exists()) {
          void setDoc(ref, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: 'member',
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }
        this._profile.set(snapshot.data() as UserProfile);
        this._loading.set(false);
      });

      onCleanup(() => unsubscribe());
    });
  }
}
