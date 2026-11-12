import type { Timestamp } from 'firebase/firestore';

/**
 * Un curso cuenta como vigente si no tiene fecha de fin, o si todavía no
 * llegó — mismo criterio "fail-open" que el resto de la app (ver
 * grades.util.ts::isCourseEndingSoon y MyStudents).
 */
export function isCourseActive(endDate: Timestamp | null, now: Date = new Date()): boolean {
  return !endDate || endDate.toMillis() > now.getTime();
}
