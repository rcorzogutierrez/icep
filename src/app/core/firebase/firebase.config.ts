import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  type Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
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
// initializeFirestore (no getFirestore) para pedir cache persistente en
// IndexedDB en vez del cache en memoria por defecto: lecturas repetidas de
// datos que cambian poco (materias, cursos, rúbricas) salen de cache en vez
// de red, y una recarga con mala conexión sigue mostrando lo último visto
// en vez de una pantalla en blanco. persistentMultipleTabManager porque la
// app puede quedar abierta en varias pestañas del mismo navegador a la vez.
export const firestore: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);

if (environment.useEmulators && environment.emulators) {
  const { auth, firestore: firestoreEmulator, storage } = environment.emulators;

  connectAuthEmulator(firebaseAuth, `http://${auth.host}:${auth.port}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firestore, firestoreEmulator.host, firestoreEmulator.port);
  connectStorageEmulator(firebaseStorage, storage.host, storage.port);
}
