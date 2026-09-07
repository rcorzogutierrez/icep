import { Routes } from '@angular/router';
import { adminGuard, approvedGuard, authGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'pending',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/pending/pending').then((m) => m.Pending),
  },
  {
    path: 'rejected',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/rejected/rejected').then((m) => m.Rejected),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, approvedGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, approvedGuard, adminGuard],
    loadComponent: () => import('./features/admin/users/admin-users').then((m) => m.AdminUsers),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
