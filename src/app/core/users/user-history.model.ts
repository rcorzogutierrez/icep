import type { Timestamp } from 'firebase/firestore';

export type UserHistoryField = 'role' | 'status';

/**
 * Documento en Firestore: userHistory/{id}, id autogenerado. Auditoría
 * inmutable de cada cambio real de rol o estado de una cuenta (ver
 * UsersService.updateRole/approve/reject) — quién lo hizo, cuándo, y el
 * valor antes/después. Mismo criterio que gradeHistory (core/grades/
 * grade-history.model.ts): nunca se edita ni se borra, ni siquiera el
 * admin — es la respuesta confiable a "¿quién subió esta cuenta a admin,
 * y cuándo?", que hasta ahora no tenía forma de responderse (a diferencia
 * de las notas, un cambio de rol/estado no dejaba rastro).
 */
export interface UserHistoryEntry {
  id: string;
  targetUid: string;
  /** Denormalizado: sigue siendo legible aunque la cuenta afectada se borre después. */
  targetName: string;
  field: UserHistoryField;
  previousValue: string;
  newValue: string;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
}
