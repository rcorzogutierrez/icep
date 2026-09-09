import type { Timestamp } from 'firebase/firestore';
import type { UserRole } from '../users/users.model';

export type InvitableRole = Extract<UserRole, 'student' | 'teacher'>;
export type InvitationStatus = 'pending' | 'used' | 'revoked';

/** Documento en Firestore: invitations/{code}. El código es el propio id del doc. */
export interface Invitation {
  code: string;
  email: string;
  role: InvitableRole;
  /** ids de subjects/{id} a asignar al canjear (vacío para invitaciones de rol "teacher"). */
  subjectIds: string[];
  status: InvitationStatus;
  createdBy: string;
  createdAt: Timestamp;
  /** Vencimiento: pasado este momento, ya no se puede canjear (ver firestore.rules). Ausente en invitaciones creadas antes de este campo. */
  expiresAt?: Timestamp;
  usedByUid: string | null;
  usedAt: Timestamp | null;
}
