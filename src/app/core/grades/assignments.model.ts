import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: assignments/{id}. Una tarea/ítem individual
 * dentro de una categoría de la rúbrica (ver grades.model.ts::GradeCategory)
 * — ej. "Tarea 1" dentro de la categoría "Tareas". El profesor carga los
 * puntos obtenidos por cada alumno en cada assignment (ver
 * Grade.scores); la categoría se resuelve sumando puntos obtenidos /
 * puntos posibles de las que ya tienen nota (ver grades.util.ts).
 */
export interface Assignment {
  id: string;
  subjectId: string;
  categoryId: string;
  name: string;
  pointsPossible: number;
  dueDate: Timestamp | null;
  /** Orden de visualización dentro de la categoría. */
  order: number;
  createdAt: Timestamp;
}
