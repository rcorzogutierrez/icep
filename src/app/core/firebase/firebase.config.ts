import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { type Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { type FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

/**
 * Punto único de inicialización del SDK modular de Firebase (v9+), sin
 * @angular/fire. Este módulo tiene un side effect intencional: al
 * importarse por primera vez, inicializa la app de Firebase y las
 * instancias de Auth/Firestore/Storage exactamente una vez (import cache de
 * ES modules garantiza que no se vuelva a ejecutar).
 *
 * Estas instancias se inyectan en el resto de la app vía los
 * InjectionTokens de `firebase.tokens.ts` (ver `provideFirebase()` en
 * `provide-firebase.ts`) en vez de importarse directo, para que los
 * servicios sean testeables (se puede sobreescribir el provider en tests).
 */
export const firebaseApp: FirebaseApp = initializeApp(environment.firebase);

export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);

if (environment.useEmulators && environment.emulators) {
  const { auth, firestore: firestoreEmulator, storage } = environment.emulators;

  connectAuthEmulator(firebaseAuth, `http://${auth.host}:${auth.port}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firestore, firestoreEmulator.host, firestoreEmulator.port);
  connectStorageEmulator(firebaseStorage, storage.host, storage.port);
}
