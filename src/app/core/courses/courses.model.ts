import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: courses/{id}. Agrupa estudiantes por énfasis/año
 * (ej. "Interpretación Bíblica"). Reemplaza la asignación manual de
 * materias: un estudiante ve las materias de los cursos en los que está
 * matriculado (ver course-students.service.ts / course-subjects.service.ts),
 * no una lista suelta.
 */
export interface Course {
  id: string;
  name: string;
  createdAt: Timestamp;
}

/**
 * Documento en Firestore: courseSubjects/{courseId}_{subjectId}. Une un
 * curso con una de sus materias (relación muchos a muchos: una materia
 * puede estar en varios cursos). Id determinístico, mismo motivo que
 * subjectAssignments.
 */
export interface CourseSubject {
  id: string;
  courseId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  createdAt: Timestamp;
}

/**
 * Documento en Firestore: courseStudents/{courseId}_{studentUid}. Une un
 * curso con uno de sus estudiantes (un estudiante puede estar en varios
 * cursos el mismo año). Id determinístico.
 */
export interface CourseStudent {
  id: string;
  courseId: string;
  studentUid: string;
  studentName: string;
  createdAt: Timestamp;
}
