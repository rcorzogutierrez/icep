import type { Timestamp } from 'firebase/firestore';

/**
 * Documento en Firestore: subjects/{id}. Solo el admin crea/edita materias
 * (ver firestore.rules); `teacherName` queda denormalizado al crearla para
 * no tener que leer el perfil del profesor desde el dashboard del
 * estudiante (que no tiene permiso de leer perfiles ajenos).
 */
export interface Subject {
  id: string;
  name: string;
  code: string;
  teacherId: string | null;
  teacherName: string | null;
  createdAt: Timestamp;
}
