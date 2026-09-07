import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: subjects/{id}. Solo el admin crea/edita/borra
 * materias (ver firestore.rules). Quién la enseña vive aparte, en
 * subjectAssignments/{id} (ver subject-assignments.model.ts) — una materia
 * puede tener cero, uno o varios profesores.
 */
export interface Subject {
  id: string;
  name: string;
  code: string;
  createdAt: Timestamp;
}
