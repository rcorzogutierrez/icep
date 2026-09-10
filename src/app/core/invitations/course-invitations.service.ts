import { Injectable, effect, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { CourseStudentsService } from '../courses/course-students.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { Locale } from '../i18n/translations';
import { UserProfileService } from '../users/user-profile.service';
import type { CourseInvitation } from './course-invitations.model';
import { generateInvitationCode } from './invitation-code';

/** Vencimiento: 30 días desde la creación (mismo tope máximo que valida firestore.rules). */
const COURSE_INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Códigos de invitación por curso (ver course-invitations.model.ts para el
 * porqué de un modelo separado de `invitations`). El listado en vivo se
 * sincroniza completo para staff (volumen trivial, unos pocos códigos por
 * curso) y se filtra en el cliente con `forCourse`.
 */
@Injectable({ providedIn: 'root' })
export class CourseInvitationsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly courseStudentsService = inject(CourseStudentsService);

  private readonly _invitations = signal<CourseInvitation[]>([]);
  private readonly _loading = signal(true);

  readonly invitations = this._invitations.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isStaff = this.userProfileService.isAdmin() || this.userProfileService.isTeacher();

      if (!user || !isStaff) {
        this._invitations.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const invitationsQuery = query(
        collection(this.firestore, 'courseInvitations'),
        orderBy('createdAt', 'desc'),
      );

      const unsubscribe = onSnapshot(
        invitationsQuery,
        (snapshot) => {
          this._invitations.set(snapshot.docs.map((d) => d.data() as CourseInvitation));
          this._loading.set(false);
        },
        () => {
          this._invitations.set([]);
          this._loading.set(false);
        },
      );

      onCleanup(() => unsubscribe());
    });
  }

  forCourse(courseId: string): CourseInvitation[] {
    return this._invitations().filter((inv) => inv.courseId === courseId);
  }

  async create(courseId: string, courseName: string): Promise<string> {
    const user = this.authService.user();
    if (!user) {
      throw new Error('No hay sesión activa.');
    }

    const code = generateInvitationCode();
    await setDoc(doc(this.firestore, 'courseInvitations', code), {
      code,
      courseId,
      courseName,
      status: 'active',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + COURSE_INVITATION_TTL_MS),
      redemptionCount: 0,
    });
    return code;
  }

  revoke(code: string) {
    return updateDoc(doc(this.firestore, 'courseInvitations', code), { status: 'revoked' });
  }

  remove(code: string) {
    return deleteDoc(doc(this.firestore, 'courseInvitations', code));
  }

  /**
   * Canjea un código de curso: crea el perfil (rol student, sin materias
   * sueltas — las da el curso) y matricula al usuario en `courseId`. A
   * diferencia de la invitación individual, el código NO se marca "usado"
   * (es multi-uso a propósito): solo se lleva la cuenta en
   * `redemptionCount`. true si funcionó; false si el código no existe, no
   * está activo, o venció.
   */
  async redeemAndCreateProfile(code: string, user: User, locale: Locale): Promise<boolean> {
    const ref = doc(this.firestore, 'courseInvitations', code);
    let snapshot;
    try {
      snapshot = await getDoc(ref);
    } catch {
      return false;
    }
    if (!snapshot.exists() || snapshot.data()['status'] !== 'active') {
      return false;
    }
    const expiresAt = snapshot.data()['expiresAt'] as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      return false;
    }
    const courseId = snapshot.data()['courseId'] as string;

    await this.userProfileService.createFromInvitation(user, 'student', [], code, locale);
    await this.courseStudentsService.assign(
      courseId,
      user.uid,
      user.displayName ?? user.email ?? '',
    );
    try {
      await updateDoc(ref, { redemptionCount: increment(1) });
    } catch {
      // No crítico: el estudiante ya quedó creado y matriculado; en el peor
      // caso el contador de "cuántos se unieron" queda desactualizado.
    }
    return true;
  }
}
