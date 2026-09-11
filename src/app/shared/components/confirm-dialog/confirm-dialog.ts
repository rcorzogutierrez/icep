import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { Button, type ButtonVariant } from '../button/button';
import { Modal } from '../modal/modal';

/**
 * Diálogo de "¿estás seguro?" genérico para acciones destructivas o
 * difíciles de deshacer — envuelve Modal con un mensaje y dos botones
 * (Cancelar / la acción misma, con su propio label y color). El caller es
 * dueño del signal que decide cuándo se abre (`open`); `confirmed` dispara
 * la acción real, `cancelled` solo cierra. No maneja loading propio: el
 * botón de la fila que abrió el diálogo ya tiene su signal de loading de
 * siempre, y acá alcanza con cerrar apenas se confirma.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [Modal, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  readonly open = input(false);
  /** Identifica QUÉ se va a borrar (ej. el nombre del curso) — el mensaje explica las consecuencias. */
  readonly title = input<string | undefined>(undefined);
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly variant = input<ButtonVariant>('danger');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly i18n = inject(I18nService);
}
