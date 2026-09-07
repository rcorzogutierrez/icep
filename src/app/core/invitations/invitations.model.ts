import type { Timestamp } from 'firebase/firestore';
import type { UserRole } from '../users/users.model';

export type InvitableRole = Extract<UserRole, 'student' | 'teacher'>;
export type InvitationStatus = 'pending' | 'used' | 'revoked';

/** Documento en Firestore: invitations/{code}. El código es el propio id del doc. */
export interface Invitation {
  code: string;
  email: string;
  role: InvitableRole;
  status: InvitationStatus;
  createdBy: string;
  createdAt: Timestamp;
  usedByUid: string | null;
  usedAt: Timestamp | null;
}
