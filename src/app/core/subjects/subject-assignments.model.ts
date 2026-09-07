import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: subjectAssignments/{id}. Une una materia con UNO
 * de sus profesores (relación muchos a muchos: una materia puede tener
 * varios profesores, y un profesor puede estar en varias materias). Cada
 * profesor asignado es un doc aparte, no un array en Subject, para poder
 * agregar/quitar uno sin reescribir toda la materia.
 * `teacherName` queda denormalizado para no requerir permiso de leer
 * perfiles ajenos desde el dashboard del estudiante.
 */
export interface SubjectAssignment {
  id: string;
  subjectId: string;
  teacherId: string;
  teacherName: string;
  createdAt: Timestamp;
}
