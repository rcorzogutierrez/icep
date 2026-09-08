import type { Assignment } from './assignments.model';
import type { GradeCategory, Grade } from './grades.model';

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
