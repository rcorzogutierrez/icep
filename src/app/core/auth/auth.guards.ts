import { inject } from '@angular/core';
import { type CanActivateFn, type CanDeactivateFn, Router } from '@angular/router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import { UserProfileService } from '../users/user-profile.service';
import { waitForSignal } from '../utils/wait-for-signal';
import { AuthService } from './auth.service';
import type { CourseDetail } from '../../features/admin/course-detail/course-detail';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await waitForSignal(authService.initializing, (initializing) => !initializing);
  return authService.isAuthenticated() || router.parseUrl('/login');
};

/**
 * Requiere sesión aprobada (status "approved"). El registro es solo por
 * invitación (ver InvitationsService.redeem): un usuario autenticado sin
 * perfil nunca canjeó una invitación, así que va a /no-invitation en vez de
 * quedar en una cola de "pending".
 */
export const approvedGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  await waitForSignal(userProfileService.loading, (loading) => !loading);

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
};

/** Admin o profesor (para /invitations, /admin/users). */
export const staffGuard: CanActivateFn = async () => {
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  await waitForSignal(userProfileService.loading, (loading) => !loading);
  return (
    userProfileService.isAdmin() || userProfileService.isTeacher() || router.parseUrl('/dashboard')
  );
};

/** Solo admin (para acciones administrativas dentro de /admin/users). */
export const adminGuard: CanActivateFn = async () => {
  const userProfileService = inject(UserProfileService);
  const router = inject(Router);

  await waitForSignal(userProfileService.loading, (loading) => !loading);
  return userProfileService.isAdmin() || router.parseUrl('/dashboard');
};

/**
 * Admin, o el profesor realmente asignado a ESTA oferta de curso —
 * `:subjectId` dictada en `:courseId` puntual (para
 * /subjects/:subjectId/gradebook/:courseId y
 * /subjects/:subjectId/assignments/:assignmentId/review/:courseId) —
 * mismo chequeo que hacen las reglas de Firestore para escribir notas
 * (`courseSubjectTeachers`, no el viejo `subjectAssignments` global a la
 * materia), así la navegación no deja entrar a un profesor a calificar una
 * oferta de curso que no le corresponde, aunque dicte la misma materia en
 * otro curso. El id de `courseSubjectTeachers` no incluye el teacherId
 * (`{courseId}_{subjectId}`, a lo sumo un profesor por oferta), así que
 * hace falta leer el doc y comparar, no alcanza con `exists()`.
 */
export const courseSubjectAccessGuard: CanActivateFn = async (route) => {
  const userProfileService = inject(UserProfileService);
  const authService = inject(AuthService);
  const firestore = inject(FIREBASE_FIRESTORE);
  const router = inject(Router);

  await waitForSignal(userProfileService.loading, (loading) => !loading);

  if (userProfileService.isAdmin()) {
    return true;
  }
  if (!userProfileService.isTeacher()) {
    return router.parseUrl('/dashboard');
  }

  const courseId = route.paramMap.get('courseId');
  const subjectId = route.paramMap.get('subjectId');
  const uid = authService.user()?.uid;
  if (!courseId || !subjectId || !uid) {
    return router.parseUrl('/dashboard');
  }

  const snapshot = await getDoc(
    doc(firestore, 'courseSubjectTeachers', `${courseId}_${subjectId}`),
  );
  return (
    (snapshot.exists() && snapshot.data()['teacherId'] === uid) || router.parseUrl('/dashboard')
  );
};

/**
 * Admin, o el profesor con al menos una materia asignada en `:courseId`
 * (para /my-courses/:courseId) — mismo criterio que subjectAccessGuard,
 * pero a nivel de curso: no alcanza con dictar la materia en algún curso,
 * tiene que ser específicamente en ESTE.
 */
export const courseAccessGuard: CanActivateFn = async (route) => {
  const userProfileService = inject(UserProfileService);
  const authService = inject(AuthService);
  const firestore = inject(FIREBASE_FIRESTORE);
  const router = inject(Router);

  await waitForSignal(userProfileService.loading, (loading) => !loading);

  if (userProfileService.isAdmin()) {
    return true;
  }
  if (!userProfileService.isTeacher()) {
    return router.parseUrl('/dashboard');
  }

  const courseId = route.paramMap.get('courseId');
  const uid = authService.user()?.uid;
  if (!courseId || !uid) {
    return router.parseUrl('/dashboard');
  }

  const assignments = await getDocs(
    query(
      collection(firestore, 'courseSubjectTeachers'),
      where('courseId', '==', courseId),
      where('teacherId', '==', uid),
    ),
  );
  return !assignments.empty || router.parseUrl('/my-courses');
};

/**
 * Gestionar curso (Materias/Estudiantes/Profesores) mantiene los cambios en
 * un borrador local hasta que se confirma "Guardar" (ver CourseDetail) — si
 * hay algo sin guardar y el usuario intenta salir de la página entera (no
 * cambiar de pestaña, eso es interno), le preguntamos primero en vez de
 * perderlo en silencio.
 */
export const unsavedCourseChangesGuard: CanDeactivateFn<CourseDetail> = (component) => {
  if (!component.hasPendingChanges()) {
    return true;
  }
  return component.confirmLeaveWithUnsavedChanges();
};
