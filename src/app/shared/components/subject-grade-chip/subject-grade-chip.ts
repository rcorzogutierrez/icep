import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { gradeBand, type GradeCreditStatus, type GradeLetter } from '../../../core/grades/grades.util';
import { GradeStatusBadge } from '../grade-status-badge/grade-status-badge';

/**
 * Chip "código de materia + nota final + acreditación" — antes
 * copy-pasteado idéntico en Mis estudiantes y Mis cursos/detalle (misma
 * tabla, mismo estudiante-por-materia). El caller resuelve `creditStatus`/
 * `creditLetter` (dependen de si hay o no un curso por vencer, que varía
 * por feature — ver `gradeCreditStatus` en grades.util.ts) y solo pasa el
 * resultado.
 */
@Component({
  selector: 'app-subject-grade-chip',
  standalone: true,
  imports: [DecimalPipe, GradeStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subject-grade-chip.html',
})
export class SubjectGradeChip {
  readonly subjectCode = input.required<string>();
  readonly finalGrade = input.required<number | null>();
  readonly creditStatus = input<GradeCreditStatus | null>(null);
  readonly creditLetter = input<GradeLetter | null>(null);

  protected readonly gradeBand = gradeBand;
}
