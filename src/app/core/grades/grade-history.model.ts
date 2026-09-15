import type { Timestamp } from 'firebase/firestore';

interface GradeHistoryEntryBase {
  id: string;
  subjectId: string;
  studentUid: string;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
}

/** Un cambio de nota en una tarea puntual (ver GradesService.setScore). */
export interface ScoreHistoryEntry extends GradeHistoryEntryBase {
  kind: 'score';
  assignmentId: string;
  /** Denormalizado: sigue siendo legible aunque la tarea se borre después. */
  assignmentName: string;
  previousScore: number | null;
  newScore: number | null;
}

/** Un cambio del comentario general de la materia (ver GradesService.setComment). */
export interface CommentHistoryEntry extends GradeHistoryEntryBase {
  kind: 'comment';
  previousComment: string | null;
  newComment: string | null;
}

/**
 * Documento en Firestore: gradeHistory/{id}, id autogenerado. Un registro
 * inmutable de un cambio de nota o de comentario — quién lo hizo, cuándo, y
 * el valor antes/después. Nunca se edita ni se borra (ver firestore.rules):
 * es la respuesta a "¿por qué cambió mi nota?" o "¿qué decía el comentario
 * antes de que lo reemplazaran?", así que el propio registro tiene que ser
 * confiable incluso ante un admin.
 *
 * `kind` no existía en los primeros documentos (todos eran de nota) — ver
 * GradeHistoryService, que rellena `kind: 'score'` al leer uno que no lo
 * tenga, para no perder compatibilidad con datos viejos.
 */
export type GradeHistoryEntry = ScoreHistoryEntry | CommentHistoryEntry;
