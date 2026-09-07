import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'member' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'rejected';

/** Documento en Firestore: users/{uid}. Ver firestore.rules para quién puede tocar qué campo. */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
