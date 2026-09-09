import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  output,
} from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { IconX } from '../../icons/icons';

/**
 * Panel lateral anclado a la derecha, alto completo — mismo patrón de
 * cierre que Modal (click en backdrop, Escape, ✕) y mismo motivo para no
 * usar CDK Overlay (no hace falta anclarlo a un trigger). Se diferencia de
 * Modal en el layout (lateral en vez de centrado) para contenido de
 * detalle/edición más largo que un diálogo puntual.
 */
@Component({
  selector: 'app-drawer',
  standalone: true,
  imports: [IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drawer.html',
})
export class Drawer {
  readonly open = input(false);
  readonly title = input<string | undefined>(undefined);
  readonly subtitle = input<string | undefined>(undefined);
  readonly avatarInitial = input<string | undefined>(undefined);

  readonly closed = output<void>();

  protected readonly i18n = inject(I18nService);

  @HostListener('document:keydown.escape')
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
