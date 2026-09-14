import type { Assignment } from './assignments.model';
import type { GradeCategory, Grade } from './grades.model';

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type GradeCreditStatus = 'unfinished' | 'passed' | 'failed';

/**
 * Escala de letras del instituto (ver la conversación que motivó esto):
 * A 94-100, B 86-93, C 78-85, D 70-77, F 69 o menos. Para acreditar la
 * materia hace falta C o mejor — por debajo de eso es "Desaprobado" aunque
 * la nota ya esté completa.
 */
const PASSING_MIN_PERCENT = 78;

/** Cuántos días antes de que un curso termine se empieza a avisar de una materia sin nota final. */
const COURSE_ENDING_SOON_DAYS = 7;

export function gradeLetter(percent: number): GradeLetter {
  if (percent >= 94) {
    return 'A';
  }
  if (percent >= 86) {
    return 'B';
  }
  if (percent >= 78) {
    return 'C';
  }
  if (percent >= 70) {
    return 'D';
  }
  return 'F';
}

/**
 * true solo si TODAS las tareas de TODAS las categorías de la materia ya
 * tienen nota cargada — no alcanza con que `computeFinalGrade` devuelva un
 * número: esa función recalcula el % solo sobre lo ya calificado (ver su
 * doc), así que un estudiante con únicamente "Asistencia" cargada ya
 * muestra un %, pero su nota NO está terminada todavía.
 */
export function isFullyGraded(
  categories: GradeCategory[],
  assignments: Assignment[],
  scores: Grade['scores'] | undefined,
): boolean {
  if (categories.length === 0 || assignments.length === 0) {
    return false;
  }
  return assignments.every((a) => scores?.[a.id] != null);
}

/** Días entre ahora y `date` (positivo = todavía falta, negativo = ya pasó), redondeado hacia arriba. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isCourseEndingSoon(endDate: Date | null, now: Date = new Date()): boolean {
  return endDate !== null && daysUntil(endDate, now) <= COURSE_ENDING_SOON_DAYS;
}

/**
 * Estado de acreditación de una materia para un estudiante puntual.
 * Deliberadamente `null` (no "unfinished") mientras el curso todavía tiene
 * tiempo por delante: una materia sin nota final en la semana 2 de 16 es
 * normal, no una alerta — "unfinished" ("No Terminado") recién aplica
 * cuando el curso está por vencer (o ya venció) y la nota sigue sin
 * cerrarse. Ver `isCourseEndingSoon`.
 */
export function gradeCreditStatus(
  fullyGraded: boolean,
  finalGrade: number | null,
  courseEndingSoon: boolean,
): GradeCreditStatus | null {
  if (fullyGraded && finalGrade !== null) {
    return finalGrade >= PASSING_MIN_PERCENT ? 'passed' : 'failed';
  }
  return courseEndingSoon ? 'unfinished' : null;
}

/** Rango de color para una nota o porcentaje (materia, categoría) — mismo criterio visual en cualquier pantalla que muestre notas. */
export type GradeBand = 'active' | 'paused' | 'expired' | 'muted';

export function gradeBand(grade: number | null): GradeBand {
  if (grade === null) {
    return 'muted';
  }
  if (grade >= 90) {
    return 'active';
  }
  if (grade >= 70) {
    return 'paused';
  }
  return 'expired';
}

/**
 * % de una categoría: suma de puntos obtenidos / suma de puntos posibles,
 * contando SOLO las tareas que ya tienen nota cargada (mismo criterio de
 * "nota actual" que `computeFinalGrade` — no arranca en 0% antes de que el
 * profesor haya cargado nada). Devuelve null si ninguna tarea de la
 * categoría tiene nota todavía.
 */
export function computeCategoryPercent(
  categoryAssignments: Assignment[],
  scores: Grade['scores'] | undefined,
): number | null {
  if (!scores) {
    return null;
  }

  let earned = 0;
  let possible = 0;

  for (const assignment of categoryAssignments) {
    const score = scores[assignment.id];
    if (score == null) {
      continue;
    }
    earned += score;
    possible += assignment.pointsPossible;
  }

  return possible > 0 ? (earned / possible) * 100 : null;
}

/**
 * Nota final ponderada de una materia. Solo promedia las categorías que ya
 * tienen alguna tarea calificada, re-escalando el peso sobre esas — así se
 * ve como "nota actual según lo calificado hasta ahora" en vez de arrancar
 * en 0% (mismo criterio que Google Classroom/Canvas). Devuelve null si
 * ninguna categoría tiene nota todavía.
 */
export function computeFinalGrade(
  categories: GradeCategory[],
  assignments: Assignment[],
  scores: Grade['scores'] | undefined,
): number | null {
  let weightedSum = 0;
  let weightWithData = 0;

  for (const category of categories) {
    const categoryAssignments = assignments.filter((a) => a.categoryId === category.id);
    const percent = computeCategoryPercent(categoryAssignments, scores);
    if (percent == null) {
      continue;
    }
    weightedSum += percent * category.weight;
    weightWithData += category.weight;
  }

  return weightWithData > 0 ? weightedSum / weightWithData : null;
}
