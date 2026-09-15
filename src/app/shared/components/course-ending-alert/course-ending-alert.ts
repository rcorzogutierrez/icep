import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { IconCircleAlert } from '../../icons/icons';

/**
 * Banner "curso por vencer" — antes copy-pasteado idéntico en Gradebook y
 * Mis cursos/detalle, solo variando qué se cuenta (estudiantes vs. materias
 * sin nota final, de ahí `unfinishedLabelKey`). El caller decide `show`
 * (ver `courseEndingSoon`/`unfinishedCount` en cada feature) en vez de que
 * este componente reciba el curso entero, para no acoplarlo a un modelo.
 */
@Component({
  selector: 'app-course-ending-alert',
  standalone: true,
  imports: [IconCircleAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-ending-alert.html',
})
export class CourseEndingAlert {
  readonly show = input.required<boolean>();
  readonly daysUntilCourseEnd = input.required<number | null>();
  readonly unfinishedCount = input.required<number>();
  readonly unfinishedLabelKey = input.required<'unfinishedStudentsCount' | 'unfinishedGradesCount'>();

  protected readonly i18n = inject(I18nService);
}
