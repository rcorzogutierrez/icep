import type { Environment } from './environment.model';

/**
 * Entorno de desarrollo. `ng serve` / `ng build --configuration development`
 * reemplazan environment.ts por este archivo (ver "fileReplacements" en
 * angular.json).
 *
 * `useEmulators: true` hace que core/firebase/firebase.config.ts conecte
 * Auth, Firestore y Storage al Firebase Emulator Suite local en vez de
 * pegarle a un proyecto real — nunca desarrollar contra producción.
 *
 * El `projectId` coincide a propósito con el proyecto real (ver
 * environment.ts / .firebaserc): `firebase.json` tiene `singleProjectMode`
 * en los emuladores, que unifica todo bajo un solo proyecto igual —
 * usar un id distinto acá solo genera warnings de "multiple projectIds"
 * sin ningún beneficio real, ya que no hace falta que exista un proyecto
 * real para desarrollar contra los emuladores.
 */
export const environment: Environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'icep-44c27',
    storageBucket: 'icep-44c27.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  emulators: {
    auth: { host: '127.0.0.1', port: 9099 },
    firestore: { host: '127.0.0.1', port: 8080 },
    storage: { host: '127.0.0.1', port: 9199 },
  },
};
