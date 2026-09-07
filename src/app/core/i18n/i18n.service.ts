import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import { type Locale, translations } from './translations';

const STORAGE_KEY = 'icep-locale';

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') {
      return stored;
    }
  } catch {
    // localStorage puede no estar disponible (SSR, modo privado estricto); default abajo.
  }
  return 'es';
}

type Translations = typeof translations.es;

/**
 * Idioma de la UI (ES/EN). Arranca de localStorage (funciona antes de
 * loguearse, en /login); una vez que el perfil de Firestore carga con un
 * `locale` guardado, ese valor manda y se sincroniza a localStorage. Cambiar
 * de idioma estando logueado persiste la preferencia en users/{uid}.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _locale = signal<Locale>(detectInitialLocale());
  readonly locale = this._locale.asReadonly();

  private readonly dict = computed(() => translations[this._locale()]);

  constructor() {
    // El locale guardado en el perfil (si existe) manda sobre localStorage.
    effect(() => {
      const savedLocale = this.userProfileService.profile()?.locale;
      if (savedLocale && savedLocale !== this._locale()) {
        this.applyLocale(savedLocale);
      }
    });
  }

  t<S extends keyof Translations>(section: S, key: keyof Translations[S]): string {
    return this.dict()[section][key] as string;
  }

  setLocale(locale: Locale): void {
    this.applyLocale(locale);

    const user = this.authService.user();
    if (user) {
      void updateDoc(doc(this.firestore, 'users', user.uid), {
        locale,
        updatedAt: serverTimestamp(),
      });
    }
  }

  private applyLocale(locale: Locale): void {
    this._locale.set(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignorar si localStorage no está disponible.
    }
  }
}
