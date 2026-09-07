import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { firebaseApp, firebaseAuth, firebaseStorage, firestore } from './firebase.config';
import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIREBASE_FIRESTORE,
  FIREBASE_STORAGE,
} from './firebase.tokens';

/**
 * Registra las instancias de Firebase (ya inicializadas una sola vez en
 * `firebase.config.ts`) como providers de Angular. Agregar a los
 * `providers` de `app.config.ts`.
 */
export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: firebaseApp },
    { provide: FIREBASE_AUTH, useValue: firebaseAuth },
    { provide: FIREBASE_FIRESTORE, useValue: firestore },
    { provide: FIREBASE_STORAGE, useValue: firebaseStorage },
  ]);
}
