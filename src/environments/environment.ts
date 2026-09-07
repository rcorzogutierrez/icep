import type { Environment } from './environment.model';

/**
 * Entorno de producción. `ng build` (configuración `production`, la que usa
 * por defecto) usa este archivo tal cual.
 *
 * IMPORTANTE: completar `firebase` con las credenciales del proyecto real
 * antes de desplegar. Estas credenciales son públicas por diseño (viajan al
 * navegador); la seguridad real vive en las Security Rules de Firestore y
 * Storage, no en ocultar este objeto.
 */
export const environment: Environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'AIzaSyDCiMTf3VyT4LN8cjdQlW9W7zOXqYyi5_0',
    authDomain: 'icep-44c27.firebaseapp.com',
    projectId: 'icep-44c27',
    storageBucket: 'icep-44c27.firebasestorage.app',
    messagingSenderId: '632951000079',
    appId: '1:632951000079:web:b92316a66297d472c5a77a',
  },
};
