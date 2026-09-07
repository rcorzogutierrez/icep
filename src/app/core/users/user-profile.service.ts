import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { Locale } from '../i18n/translations';
import type { InvitableRole } from '../invitations/invitations.model';
import type { UserProfile } from './users.model';

/**
 * Perfil de acceso (users/{uid}) del usuario autenticado. El doc se crea
 * como parte del canje de una invitación (ver InvitationsService.redeem +
 * Login), no acá: este servicio solo lo LEE en vivo. Mismo patrón que
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
  readonly isTeacher = computed(() => this._profile()?.role === 'teacher');
  readonly isStudent = computed(() => this._profile()?.role === 'student');

  constructor() {
    effect((onCleanup) => {
      const user = this.authService.user();

      if (!user) {
        this._profile.set(null);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const unsubscribe = onSnapshot(doc(this.firestore, 'users', user.uid), (snapshot) => {
        this._profile.set(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
        this._loading.set(false);
      });

      onCleanup(() => unsubscribe());
    });
  }

  /** Chequeo puntual (no reactivo) de si ya existe perfil para un uid. Usado al loguearse para saber si es un alta nueva. */
  async fetchOnce(uid: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, 'users', uid));
    return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
  }

  /** Crea el perfil tras canjear una invitación (ver InvitationsService.redeem). */
  createFromInvitation(user: User, role: InvitableRole, invitationCode: string, locale: Locale) {
    return setDoc(doc(this.firestore, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role,
      status: 'approved',
      invitationCode,
      locale,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
