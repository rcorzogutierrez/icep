import { InjectionToken } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

/**
 * Tokens de inyección para las instancias singleton del SDK modular de
 * Firebase. Inyectar estos tokens en vez de importar `firebase.config.ts`
 * directo mantiene los servicios (AuthService, etc.) testeables: en un test
 * se puede proveer un mock/fake sin tocar el SDK real.
 */
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIREBASE_FIRESTORE = new InjectionToken<Firestore>('FIREBASE_FIRESTORE');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FIREBASE_STORAGE');
