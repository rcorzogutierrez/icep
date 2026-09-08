import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: gradeCategories/{id}. La rúbrica de una materia:
 * varias categorías con peso (ej. "Asistencia" 10%, "Tareas (4)" 40%). La
 * suma de los pesos de una materia debe dar 100 — validado en el cliente,
 * ver GradeCategoriesService, no en las reglas (no hay agregación entre
 * documentos sin Cloud Functions).
 */
export interface GradeCategory {
  id: string;
  subjectId: string;
  name: string;
  /** 0-100. */
  weight: number;
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
