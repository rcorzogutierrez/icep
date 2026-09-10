import type { Timestamp } from 'firebase/firestore';

export type CourseInvitationStatus = 'active' | 'revoked';

/**
 * Documento en Firestore: courseInvitations/{code}. A diferencia de
 * `Invitation` (individual, atada a un email, un solo uso), esta NO está
 * atada a ningún email y es de uso múltiple: cualquiera con el código o el
 * link/QR se une como estudiante al curso indicado — mismo modelo que un
 * código de clase de Google Classroom. El rol siempre es "student": sumar
 * profesores a un curso sigue siendo cosa de /admin/courses, no de un
 * código compartible.
 */
export interface CourseInvitation {
  code: string;
  courseId: string;
  /** Denormalizado para no depender de otro fetch al mostrar el historial. */
  courseName: string;
  status: CourseInvitationStatus;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  /** Cuántos se unieron con este código; informativo, no un límite. */
  redemptionCount: number;
}
