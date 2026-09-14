import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: gradeHistory/{id}, id autogenerado. Un registro
 * inmutable de un cambio de nota (ver GradesService.setScore) — quién lo
 * hizo, cuándo, y el valor antes/después. Nunca se edita ni se borra (ver
 * firestore.rules): es la respuesta a "¿por qué cambió mi nota?", así que
 * el propio registro tiene que ser confiable incluso ante un admin.
 */
export interface GradeHistoryEntry {
  id: string;
  subjectId: string;
  studentUid: string;
  assignmentId: string;
  /** Denormalizado: sigue siendo legible aunque la tarea se borre después. */
  assignmentName: string;
  previousScore: number | null;
  newScore: number | null;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
}
