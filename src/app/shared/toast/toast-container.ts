import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { IconCircleAlert, IconCircleCheck, IconInfo, IconX } from '../icons/icons';
import { ToastService } from './toast.service';

/** Contenedor fijo que renderiza los toasts activos; se monta una sola vez en el root de la app. */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [IconCircleAlert, IconCircleCheck, IconInfo, IconX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-container.html',
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
  protected readonly i18n = inject(I18nService);
}
