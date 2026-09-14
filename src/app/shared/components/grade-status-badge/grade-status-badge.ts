import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GradeCreditStatus, GradeLetter } from '../../../core/grades/grades.util';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Mismo patrón de "chip relleno" (fondo + texto) que ya usan los estados de usuario/invitación. */
const STATUS_CLASS: Record<GradeCreditStatus, string> = {
  passed: 'bg-green-50 text-status-active',
  failed: 'bg-red-50 text-status-expired',
  unfinished: 'bg-amber-50 text-status-paused',
};

/**
 * Chip de acreditación de una materia (ver `gradeCreditStatus` en
 * grades.util.ts) — "Aprobado"/"Desaprobado" (con la letra, si se pasó) o
 * "No Terminado". No renderiza nada si `status` es `null` (materia sin
 * nota final pero el curso todavía tiene tiempo — no hay nada que avisar).
 */
@Component({
  selector: 'app-grade-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status(); as s) {
      <span
        class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
        [class]="statusClass[s]"
      >
        @if (letter(); as l) {
          {{ l }} ·
        }
        {{ label() }}
      </span>
    }
  `,
})
export class GradeStatusBadge {
  private readonly i18n = inject(I18nService);

  readonly status = input<GradeCreditStatus | null>(null);
  readonly letter = input<GradeLetter | null>(null);

  protected readonly statusClass = STATUS_CLASS;

  protected readonly label = computed(() => {
    switch (this.status()) {
      case 'passed':
        return this.i18n.t('common', 'gradeStatusPassed');
      case 'failed':
        return this.i18n.t('common', 'gradeStatusFailed');
      case 'unfinished':
        return this.i18n.t('common', 'gradeStatusUnfinished');
      default:
        return '';
    }
  });
}
