import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { IconX } from '../../icons/icons';

let nextDrawerId = 0;

/**
 * Panel lateral anclado a la derecha, alto completo — mismo patrón de
 * cierre que Modal (click en backdrop, Escape, ✕) y mismo motivo para no
 * usar CDK Overlay (no hace falta anclarlo a un trigger). Se diferencia de
 * Modal en el layout (lateral en vez de centrado) para contenido de
 * detalle/edición más largo que un diálogo puntual. `cdkTrapFocus`/
 * `cdkTrapFocusAutoCapture` atan y devuelven el foco igual que en Modal
 * (ver ese comentario).
 */
@Component({
  selector: 'app-drawer',
  standalone: true,
  imports: [CdkTrapFocus, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  templateUrl: './drawer.html',
})
export class Drawer {
  protected readonly titleId = `drawer-title-${nextDrawerId++}`;

  readonly open = input(false);
  readonly title = input<string | undefined>(undefined);
  readonly subtitle = input<string | undefined>(undefined);
  readonly avatarInitial = input<string | undefined>(undefined);

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
