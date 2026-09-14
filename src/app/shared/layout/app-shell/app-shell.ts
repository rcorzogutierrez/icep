import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { UserProfileService } from '../../../core/users/user-profile.service';
import { Button } from '../../components/button/button';
import { Modal } from '../../components/modal/modal';
import { ToastService } from '../../toast/toast.service';
import {
  IconBookOpen,
  IconGraduationCap,
  IconLayers,
  IconLayoutDashboard,
  IconLogOut,
  IconMenu,
  IconUserPlus,
  IconUsers,
  IconX,
} from '../../icons/icons';

/**
 * Shell persistente de la app logueada: sidebar de navegación + barra
 * superior, con el contenido de cada ruta hijo en el <router-outlet>. Ver
 * app.routes.ts — dashboard/invitations/admin/* son hijas de esta ruta.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Button,
    Modal,
    IconLayoutDashboard,
    IconUserPlus,
    IconBookOpen,
    IconLayers,
    IconUsers,
    IconGraduationCap,
    IconMenu,
    IconX,
    IconLogOut,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly userProfileService = inject(UserProfileService);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Sidebar como overlay en mobile (<lg); en desktop siempre visible, este signal no aplica. */
  protected readonly mobileNavOpen = signal(false);

  /**
   * Barra de progreso mientras se resuelve una navegación (baja el chunk
   * lazy, corren guards) — sin esto el router-outlet queda en blanco un
   * instante y no hay ninguna señal de que algo está pasando. `true` desde
   * `NavigationStart`; los eventos intermedios (guards, resolvers, carga
   * del chunk) no lo tocan, así se mantiene prendida hasta el cierre real.
   */
  private readonly routerEvent = toSignal(this.router.events);
  protected readonly navigating = signal(false);

  constructor() {
    effect(() => {
      const event = this.routerEvent();
      if (event instanceof NavigationStart) {
        this.navigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        this.navigating.set(false);
      }
    });
  }

  protected readonly editingNickname = signal(false);
  protected readonly nicknameDraft = signal('');
  protected readonly savingNickname = signal(false);

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.mobileNavOpen.set(false);
  }

  protected async onSignOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  protected openNicknameEditor(): void {
    this.nicknameDraft.set(
      this.userProfileService.profile()?.displayName ?? this.auth.user()?.displayName ?? '',
    );
    this.editingNickname.set(true);
  }

  protected async saveNickname(): Promise<void> {
    const uid = this.auth.user()?.uid;
    const nickname = this.nicknameDraft().trim();
    if (!uid || !nickname) {
      return;
    }
    this.savingNickname.set(true);
    try {
      await this.userProfileService.updateDisplayName(uid, nickname);
      this.editingNickname.set(false);
      this.toast.success(this.i18n.t('shell', 'nicknameUpdated'));
    } catch (error) {
      console.error('[AppShell]', error);
      this.toast.error(this.i18n.t('shell', 'errorGeneric'));
    } finally {
      this.savingNickname.set(false);
    }
  }
}
