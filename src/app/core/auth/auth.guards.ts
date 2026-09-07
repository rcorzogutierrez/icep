import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { type CanActivateFn, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { UserProfileService } from '../users/user-profile.service';
import { AuthService } from './auth.service';

/**
 * Único uso de RxJS de todo el feature de auth, y no es un formulario: los
 * guards de router necesitan esperar a que resuelva el primer valor async
 * (sesión / perfil de Firestore) antes de decidir, y `toObservable` es la
 * forma estándar de Angular de puentear un signal a algo que el router
 * puede esperar.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return toObservable(authService.initializing).pipe(
    filter((initializing) => !initializing),
    map(() => authService.isAuthenticated() || router.parseUrl('/login')),
  );
};

/**
 * Requiere sesión aprobada (status "approved"). El registro es solo por
 * invitación (ver InvitationsService.redeem): un usuario autenticado sin
 * perfil nunca canjeó una invitación, así que va a /no-invitation en vez de
 * quedar en una cola de "pending".
 */
export const approvedGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  return toObservable(userProfileService.loading).pipe(
    filter((loading) => !loading),
    map(() => {
      if (!authService.isAuthenticated()) {
        return router.parseUrl('/login');
      }
      switch (userProfileService.status()) {
        case 'approved':
          return true;
        case 'rejected':
          return router.parseUrl('/rejected');
        default:
          return router.parseUrl('/no-invitation');
      }
    }),
  );
};

/** Admin o profesor (para /invitations, /admin/users). */
export const staffGuard: CanActivateFn = () => {
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  return toObservable(userProfileService.loading).pipe(
    filter((loading) => !loading),
    map(
      () =>
        userProfileService.isAdmin() ||
        userProfileService.isTeacher() ||
        router.parseUrl('/dashboard'),
    ),
  );
};

/** Solo admin (para acciones administrativas dentro de /admin/users). */
export const adminGuard: CanActivateFn = () => {
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  return toObservable(userProfileService.loading).pipe(
    filter((loading) => !loading),
    map(() => userProfileService.isAdmin() || router.parseUrl('/dashboard')),
  );
};
