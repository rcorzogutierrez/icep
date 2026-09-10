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
  /**
   * `null` solo en cursos creados antes de que estas fechas existieran; el
   * formulario las pide siempre para cursos nuevos (son tentativas, se
   * pueden editar después).
   */
  startDate: Timestamp | null;
  endDate: Timestamp | null;
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

/**
 * Documento en Firestore: courseTeachers/{courseId}_{teacherId}. Qué
 * profesores participan de un curso (un profesor puede participar de
 * varios cursos). Este es el paso 1: "quién participa"; ver
 * CourseSubjectTeacher para el paso 2, "quién dicta cada materia".
 */
export interface CourseTeacher {
  id: string;
  courseId: string;
  teacherId: string;
  teacherName: string;
  createdAt: Timestamp;
}

/**
 * Documento en Firestore: courseSubjectTeachers/{courseId}_{subjectId}. De
 * los profesores ya asignados al curso (CourseTeacher), cuál dicta cada
 * materia del curso — a lo sumo UN profesor por materia dentro de un mismo
 * curso (el mismo profesor puede dictar varias materias del curso, pero
 * una materia no puede tener dos profesores calificándola en el mismo
 * curso). Id determinístico sin el teacherId a propósito: asignar un
 * profesor distinto reemplaza (update) la asignación anterior en vez de
 * agregar otra fila. Crear/borrar/reemplazar esto mantiene
 * `subjectAssignments` (materia -> profesor, global, lo único que leen las
 * reglas de grades/gradeCategories/assignments y subjectAccessGuard) como
 * tabla derivada — ver CourseSubjectTeachersService.
 */
export interface CourseSubjectTeacher {
  id: string;
  courseId: string;
  subjectId: string;
  teacherId: string;
  teacherName: string;
  createdAt: Timestamp;
}
