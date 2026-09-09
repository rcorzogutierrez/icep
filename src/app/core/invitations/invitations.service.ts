import { Injectable, effect, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIREBASE_FIRESTORE } from '../firebase/firebase.tokens';
import type { Locale } from '../i18n/translations';
import { UserProfileService } from '../users/user-profile.service';
import type { Invitation, InvitableRole } from './invitations.model';

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para que el código se pueda leer/tipear a mano. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode(): string {
  const randomValues = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(randomValues);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomValues[i] % CODE_ALPHABET.length];
  }
  return code;
}

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly firestore = inject(FIREBASE_FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);

  private readonly _invitations = signal<Invitation[]>([]);
  private readonly _loading = signal(true);

  readonly invitations = this._invitations.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor() {
    effect((onCleanup) => {
      // Esperar a que resuelva la sesión Y el perfil antes de decidir la
      // query: si no, se puede armar la query de "no admin" con un perfil
      // todavía sin cargar (mismo tipo de carrera que en UserProfileService).
      if (this.authService.initializing() || this.userProfileService.loading()) {
        return;
      }

      const user = this.authService.user();
      const isAdmin = this.userProfileService.isAdmin();

      if (!user) {
        this._invitations.set([]);
        this._loading.set(false);
        return;
      }

      this._loading.set(true);
      const invitationsQuery = isAdmin
        ? query(collection(this.firestore, 'invitations'), orderBy('createdAt', 'desc'))
        : query(
            collection(this.firestore, 'invitations'),
            where('createdBy', '==', user.uid),
            orderBy('createdAt', 'desc'),
          );

      const unsubscribe = onSnapshot(
        invitationsQuery,
        (snapshot) => {
          this._invitations.set(snapshot.docs.map((d) => d.data() as Invitation));
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

  /** Crea una invitación. El caller debe validar antes que el rol y las materias elegidas estén permitidos para su propio rol. */
  async create(email: string, role: InvitableRole, subjectIds: string[]): Promise<string> {
    const user = this.authService.user();
    if (!user) {
      throw new Error('No hay sesión activa.');
    }

    const code = generateCode();
    await setDoc(doc(this.firestore, 'invitations', code), {
      code,
      email: email.trim().toLowerCase(),
      role,
      subjectIds: role === 'student' ? subjectIds : [],
      status: 'pending',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      usedByUid: null,
      usedAt: null,
    });
    return code;
  }

  /**
   * Canjea un código para el uid dado: marca la invitación como usada y
   * devuelve su rol y materias asignadas, o null si el código no existe, ya
   * fue usado, o el email de la sesión actual no coincide con el de la
   * invitación (firestore.rules solo deja leer/canjear al dueño de ese
   * email o a staff; acá se trata como "no existe" en vez de dejar
   * propagar el permission-denied). El orden (canjear primero, crear el
   * perfil después) importa: firestore.rules valida la creación de
   * users/{uid} contra la invitación ya comprometida.
   */
  async redeem(
    code: string,
    uid: string,
  ): Promise<{ role: InvitableRole; subjectIds: string[] } | null> {
    const ref = doc(this.firestore, 'invitations', code);
    let snapshot;
    try {
      snapshot = await getDoc(ref);
    } catch {
      return null;
    }
    if (!snapshot.exists() || snapshot.data()['status'] !== 'pending') {
      return null;
    }

    const role = snapshot.data()['role'] as InvitableRole;
    const subjectIds = (snapshot.data()['subjectIds'] as string[] | undefined) ?? [];
    try {
      await updateDoc(ref, { status: 'used', usedByUid: uid, usedAt: serverTimestamp() });
    } catch {
      return null;
    }
    return { role, subjectIds };
  }

  revoke(code: string) {
    return updateDoc(doc(this.firestore, 'invitations', code), { status: 'revoked' });
  }

  /** Corrige el email de una invitación todavía pendiente (ej. typo). */
  updateEmail(code: string, email: string) {
    return updateDoc(doc(this.firestore, 'invitations', code), {
      email: email.trim().toLowerCase(),
    });
  }

  remove(code: string) {
    return deleteDoc(doc(this.firestore, 'invitations', code));
  }

  /** Canjea el código y crea el perfil del usuario en un solo paso. true si funcionó. */
  async redeemAndCreateProfile(code: string, user: User, locale: Locale): Promise<boolean> {
    const redeemed = await this.redeem(code, user.uid);
    if (!redeemed) {
      return false;
    }
    await this.userProfileService.createFromInvitation(
      user,
      redeemed.role,
      redeemed.subjectIds,
      code,
      locale,
    );
    return true;
  }
}
