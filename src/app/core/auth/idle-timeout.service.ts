import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Tiempo de inactividad antes de cerrar sesión sola, y cuánto antes avisar.
 * 30 min es la app entera (no por página) — una PC compartida (biblioteca,
 * sala de profesores) con una sesión de notas/comentarios abierta e
 * indefinida es la razón de ser de este servicio.
 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_LEAD_MS = 60 * 1000;
/** No re-escribir localStorage en cada mousemove — alcanza con marcar "hubo actividad" cada tanto. */
const ACTIVITY_THROTTLE_MS = 10 * 1000;

const STORAGE_KEY = 'icep:lastActivity';

/**
 * Cierra la sesión sola tras `IDLE_TIMEOUT_MS` sin actividad real (mouse,
 * teclado, click, scroll, touch) en ninguna pestaña de la app — la
 * "actividad" se comparte entre pestañas vía `localStorage` + el evento
 * `storage` (que dispara en las OTRAS pestañas, no en la que escribió), así
 * que trabajar en una pestaña mantiene viva la sesión de todas: cerrar
 * sesión afecta al navegador entero (mismo Firebase Auth), tiene sentido
 * medir "inactivo" a ese mismo nivel, no por pestaña.
 *
 * `start()` lo llama `AppShell` (la única raíz de las rutas logueadas) una
 * vez; los listeners de actividad real viven ahí en la metadata `host` del
 * componente (limpieza automática al destruirse). Este servicio solo
 * expone el estado del aviso ("¿seguís ahí?") y arma/cancela los timers.
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private readonly _showWarning = signal(false);
  private readonly _secondsRemaining = signal(0);
  readonly showWarning = this._showWarning.asReadonly();
  readonly secondsRemaining = this._secondsRemaining.asReadonly();

  private warningTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private logoutTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private lastRegisteredAt = 0;

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY && event.newValue) {
      this.scheduleFrom(Number(event.newValue));
    }
  };

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    window.addEventListener('storage', this.onStorage);
    // Si ya había una marca de actividad (otra pestaña, o de antes de
    // recargar esta misma), arrancar desde ahí — no desde "ahora": una
    // recarga de página no debería regalarle tiempo extra a alguien que ya
    // estaba inactivo.
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      this.scheduleFrom(Number(stored));
    } else {
      this.registerActivity();
    }
  }

  stop(): void {
    this.started = false;
    window.removeEventListener('storage', this.onStorage);
    this.clearTimers();
  }

  /**
   * Actividad real del usuario — llamado (throttleado acá adentro) por los
   * listeners de `host` de `AppShell`, y también por el botón "Seguir
   * conectado" del aviso (ese caso sí debe resetear siempre, por eso el
   * throttle compara contra la última vez que efectivamente se registró,
   * no bloquea el primer llamado tras mostrar el aviso).
   */
  registerActivity(): void {
    const now = Date.now();
    if (!this._showWarning() && now - this.lastRegisteredAt < ACTIVITY_THROTTLE_MS) {
      return;
    }
    this.lastRegisteredAt = now;
    localStorage.setItem(STORAGE_KEY, String(now));
    this.scheduleFrom(now);
  }

  private scheduleFrom(lastActivityAt: number): void {
    this.clearTimers();
    this._showWarning.set(false);

    const elapsed = Date.now() - lastActivityAt;
    const msUntilLogout = IDLE_TIMEOUT_MS - elapsed;
    if (msUntilLogout <= 0) {
      void this.logout();
      return;
    }

    const msUntilWarning = msUntilLogout - WARNING_LEAD_MS;
    if (msUntilWarning <= 0) {
      this.beginWarning(msUntilLogout);
    } else {
      this.warningTimeoutId = setTimeout(() => this.beginWarning(WARNING_LEAD_MS), msUntilWarning);
    }
  }

  private beginWarning(msUntilLogout: number): void {
    this._showWarning.set(true);
    this._secondsRemaining.set(Math.ceil(msUntilLogout / 1000));
    this.countdownIntervalId = setInterval(() => {
      this._secondsRemaining.update((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    this.logoutTimeoutId = setTimeout(() => void this.logout(), msUntilLogout);
  }

  private clearTimers(): void {
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
    }
    if (this.logoutTimeoutId) {
      clearTimeout(this.logoutTimeoutId);
    }
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
    }
    this.warningTimeoutId = null;
    this.logoutTimeoutId = null;
    this.countdownIntervalId = null;
  }

  private async logout(): Promise<void> {
    this.clearTimers();
    this._showWarning.set(false);
    localStorage.removeItem(STORAGE_KEY);
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('[IdleTimeoutService] signOut failed:', error);
    }
    await this.router.navigateByUrl('/login?idle=1');
  }
}
