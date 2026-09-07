import { Routes } from '@angular/router';
import { adminGuard, approvedGuard, authGuard, staffGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'invite/:code',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'no-invitation',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/no-invitation/no-invitation').then((m) => m.NoInvitation),
  },
  {
    path: 'rejected',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/rejected/rejected').then((m) => m.Rejected),
  },
  {
    path: '',
    canActivate: [authGuard, approvedGuard],
    loadComponent: () => import('./shared/layout/app-shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'invitations',
        canActivate: [staffGuard],
        loadComponent: () =>
          import('./features/invitations/invitations').then((m) => m.Invitations),
      },
      {
        path: 'admin/users',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/users/admin-users').then((m) => m.AdminUsers),
      },
      {
        path: 'admin/subjects',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/subjects/subjects').then((m) => m.AdminSubjects),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
