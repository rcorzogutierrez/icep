import type { Timestamp } from 'firebase/firestore';
import type { Locale } from '../i18n/translations';

export type UserRole = 'student' | 'teacher' | 'admin';
/** "pending" ya no se usa para altas nuevas (el registro es por invitación, que aprueba de inmediato). */
export type UserStatus = 'pending' | 'approved' | 'rejected';

/** Documento en Firestore: users/{uid}. Ver firestore.rules para quién puede tocar qué campo. */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  /** Código de la invitación canjeada para crear esta cuenta. */
  invitationCode: string;
  /** ids de subjects/{id} asignados al canjear la invitación (solo aplica a role "student"). */
  enrolledSubjectIds: string[];
  locale: Locale;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
