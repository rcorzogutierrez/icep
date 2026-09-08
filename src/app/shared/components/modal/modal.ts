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
 * Modal centrado simple: sin CDK Overlay (no hace falta anclarlo a un
 * trigger como el Select, siempre va centrado) — un `<div>` fixed con
 * backdrop alcanza. Cierra con click en el backdrop, Escape, o la ✕.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.html',
})
export class Modal {
  readonly open = input(false);
  readonly title = input<string | undefined>(undefined);

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
