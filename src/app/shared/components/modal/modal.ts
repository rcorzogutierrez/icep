import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { IconX } from '../../icons/icons';

let nextModalId = 0;

/**
 * Modal centrado simple: sin CDK Overlay (no hace falta anclarlo a un
 * trigger como el Select, siempre va centrado) — un `<div>` fixed con
 * backdrop alcanza. Cierra con click en el backdrop, Escape, o la ✕.
 * `cdkTrapFocus`/`cdkTrapFocusAutoCapture` (sí es CDK, aunque el panel en
 * sí no lo sea) atan el foco de teclado adentro mientras está abierto y lo
 * devuelven a quien lo abrió al cerrarse — gratis vía el ciclo de vida del
 * `@if` del template, sin lógica manual de captura/restauración.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CdkTrapFocus, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  templateUrl: './modal.html',
})
export class Modal {
  protected readonly titleId = `modal-title-${nextModalId++}`;

  readonly open = input(false);
  readonly title = input<string | undefined>(undefined);

  readonly closed = output<void>();

  protected readonly i18n = inject(I18nService);

  protected onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
