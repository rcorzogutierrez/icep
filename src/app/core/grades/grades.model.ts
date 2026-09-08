import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: gradeCategories/{id}. La rúbrica de una materia:
 * varias categorías con peso (ej. "Asistencia" 10%, "Tareas (4)" 40%). La
 * suma de los pesos de una materia debe dar 100 — validado en el cliente,
 * ver GradeCategoriesService, no en las reglas (no hay agregación entre
 * documentos sin Cloud Functions).
 *
 * `hasMultipleTasks` se elige una sola vez, al crear la categoría (ver
 * GradeCategoriesService.create), y no se vuelve a cambiar:
 * - `false` ("con una sola nota"): la categoría no gestiona tareas propias.
 *   El servicio le crea UNA tarea invisible de 100 puntos que el profesor
 *   nunca ve ni edita — cargar el puntaje de esa tarea (0-100) ES la nota
 *   de la categoría. La sección "Tareas" de la UI no la muestra.
 * - `true` (o ausente, en categorías creadas antes de que existiera este
 *   campo): "con varias tareas", el comportamiento de siempre — el
 *   profesor gestiona cada tarea a mano (nombre, puntos, vencimiento).
 */
export interface GradeCategory {
  id: string;
  subjectId: string;
  name: string;
  /** 0-100. */
  weight: number;
  hasMultipleTasks: boolean;
  /** Orden de visualización dentro de la materia. */
  order: number;
  createdAt: Timestamp;
}

/**
 * Documento en Firestore: grades/{subjectId}_{studentUid}. El id es
 * determinístico (no random) — permite que el propio estudiante resuelva
 * su nota con un `getDoc` directo (sin necesitar permiso de `list`), y que
 * las reglas verifiquen la asignación del profesor con un `exists()` por
 * path conocido.
 */
export interface Grade {
  id: string;
  subjectId: string;
  studentUid: string;
  /**
   * assignmentId -> puntos obtenidos (0 a Assignment.pointsPossible; null =
   * todavía sin calificar esa tarea). Ver grades.util.ts::computeFinalGrade
   * para cómo esto se agrega en nota de categoría y nota final.
   */
  scores: Record<string, number | null>;
  updatedAt: Timestamp;
}
