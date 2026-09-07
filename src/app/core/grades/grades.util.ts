import type { GradeCategory, Grade } from './grades.model';

/**
 * Nota final ponderada de una materia. Solo promedia las categorías que ya
 * tienen nota cargada, re-escalando el peso sobre esas — así se ve como
 * "nota actual según lo calificado hasta ahora" en vez de arrancar en 0%
 * antes de que el profesor haya cargado nada (mismo criterio que Google
 * Classroom/Canvas). Devuelve null si ninguna categoría tiene nota todavía.
 */
export function computeFinalGrade(
  categories: GradeCategory[],
  scores: Grade['scores'] | undefined,
): number | null {
  if (!scores) {
    return null;
  }

  let weightedSum = 0;
  let weightWithData = 0;

  for (const category of categories) {
    const score = scores[category.id];
    if (score == null) {
      continue;
    }
    weightedSum += score * category.weight;
    weightWithData += category.weight;
  }

  return weightWithData > 0 ? weightedSum / weightWithData : null;
}
