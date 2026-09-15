import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/provide-firebase';
import { provideAppIcons } from './shared/icons/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    // Explícito, no implícito: la app ya corría sin zone.js (ni siquiera
    // está instalado — es peer dependency opcional de @angular/core desde
    // la v18) porque todo el estado es signals + OnPush, pero nada lo
    // declaraba — dependía de que ninguna dependencia futura arrastrara
    // zone.js transitivamente sin que nadie lo notara.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideFirebase(),
    provideAppIcons(),
  ],
};
