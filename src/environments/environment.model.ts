/**
 * Tipos compartidos por environment.ts y environment.development.ts.
 *
 * Viven en un archivo aparte (no en environment.ts) a propósito: Angular
 * reemplaza el módulo "./environment" completo vía `fileReplacements` en
 * angular.json, y esa sustitución también reescribe cualquier import de
 * "./environment" hecho *desde* environment.development.ts, convirtiéndolo
 * en un self-import roto. Este archivo, al no ser el target del
 * replacement, se puede importar con seguridad desde ambos.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface EmulatorTarget {
  host: string;
  port: number;
}

export interface Environment {
  production: boolean;
  /** Si es true, firebase.config.ts conecta los emuladores locales en vez del proyecto real. */
  useEmulators: boolean;
  firebase: FirebaseWebConfig;
  emulators?: {
    auth: EmulatorTarget;
    firestore: EmulatorTarget;
    storage: EmulatorTarget;
  };
}
