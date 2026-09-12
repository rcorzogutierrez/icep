import { Routes } from '@angular/router';
import {
  adminGuard,
  approvedGuard,
  authGuard,
  courseAccessGuard,
  staffGuard,
  subjectAccessGuard,
  unsavedCourseChangesGuard,
} from './core/auth/auth.guards';

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
        path: 'my-students',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/my-students/my-students').then((m) => m.MyStudents),
      },
      {
        path: 'my-courses',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/my-courses/my-courses').then((m) => m.MyCourses),
      },
      {
        path: 'my-courses/:courseId',
        canActivate: [staffGuard, courseAccessGuard],
        loadComponent: () =>
          import('./features/my-courses/my-course-detail/my-course-detail').then(
            (m) => m.MyCourseDetail,
          ),
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
      {
        path: 'admin/courses',
        canActivate: [staffGuard],
        loadComponent: () => import('./features/admin/courses/courses').then((m) => m.AdminCourses),
      },
      {
        path: 'admin/courses/:courseId',
        canActivate: [staffGuard],
        canDeactivate: [unsavedCourseChangesGuard],
        loadComponent: () =>
          import('./features/admin/course-detail/course-detail').then((m) => m.CourseDetail),
      },
      {
        path: 'subjects/:subjectId/gradebook',
        canActivate: [staffGuard, subjectAccessGuard],
        loadComponent: () => import('./features/gradebook/gradebook').then((m) => m.Gradebook),
      },
      {
        path: 'subjects/:subjectId/assignments/:assignmentId/review',
        canActivate: [staffGuard, subjectAccessGuard],
        loadComponent: () =>
          import('./features/assignment-review/assignment-review').then((m) => m.AssignmentReview),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
