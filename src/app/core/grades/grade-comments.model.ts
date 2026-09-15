import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: gradeComments/{id}, id autogenerado. Un
 * comentario puntual del profesor (o admin) para un estudiante en una
 * materia — a diferencia del viejo `Grade.comment` (un único valor,
 * reemplazado para siempre en cada edición, ver grades.model.ts), acá cada
 * comentario es su propia entrada: se van acumulando con fecha, y el
 * estudiante los ve todos, no solo el último. Opcionalmente puede quedar
 * etiquetado a una categoría de la rúbrica (ej. "sobre Asistencia") — útil
 * cuando la materia tiene varias instancias de evaluación a lo largo del
 * tiempo y no alcanza con un comentario genérico. Nunca se edita ni se
 * borra (ver firestore.rules) — si el profesor se equivocó, corresponde
 * agregar un comentario nuevo aclarando, no reescribir el anterior en
 * silencio.
 */
export interface GradeComment {
  id: string;
  subjectId: string;
  studentUid: string;
  text: string;
  /** Categoría de la rúbrica a la que se refiere, si el profesor eligió una — null = comentario general. */
  categoryId: string | null;
  /** Denormalizado: sigue siendo legible aunque la categoría se borre o se renombre después. */
  categoryName: string | null;
  createdBy: string;
  /** Vacío en un comentario migrado del viejo `Grade.comment` (no sabemos quién lo escribió originalmente) — ver GradeCommentsService. */
  createdByName: string;
  createdAt: Timestamp;
}
