import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
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

  /**
   * Redirect en vez de popup: un popup de Google bloqueado, con cookies de
   * terceros restringidas, o con un adblocker/extensión de privacidad
   * puede quedar en blanco sin ningún error visible. El redirect navega
   * de verdad a Google y vuelve, evitando esa categoría de fallas — el
   * resultado se recoge después con consumeGoogleRedirectResult().
   */
  signInWithGoogle() {
    return signInWithRedirect(this.auth, googleProvider);
  }

  /** Resultado del login con Google tras volver del redirect; null si esta carga no viene de ahí. */
  consumeGoogleRedirectResult() {
    return getRedirectResult(this.auth);
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
