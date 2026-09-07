import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';

const googleProvider = new GoogleAuthProvider();

/**
 * Envuelve el Auth del SDK modular de Firebase (basado en callbacks) y lo
 * vuelca a signals a mano. Nada de la capa Observable de un wrapper de
 * Angular para Firebase: `onAuthStateChanged` se suscribe dentro de un
 * `effect()` y se desuscribe con su callback `onCleanup`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  private readonly _user = signal<User | null>(null);
  private readonly _initializing = signal(true);

  /** Usuario autenticado actual, o null si no hay sesión. */
  readonly user = this._user.asReadonly();
  /** true mientras el SDK todavía no resolvió el estado inicial de sesión. */
  readonly initializing = this._initializing.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    effect((onCleanup) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        this._user.set(user);
        this._initializing.set(false);
      });
      onCleanup(() => unsubscribe());
    });
  }

  signInWithGoogle() {
    return signInWithPopup(this.auth, googleProvider);
  }

  signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  signUpWithEmail(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  signOut() {
    return firebaseSignOut(this.auth);
  }
}
