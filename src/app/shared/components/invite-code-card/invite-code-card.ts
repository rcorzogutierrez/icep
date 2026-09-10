import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { generateQrDataUrl } from '../../utils/qr-code';
import { Button } from '../button/button';
import { Modal } from '../modal/modal';

/**
 * Tarjeta de un código de invitación (individual o de curso): link + QR,
 * con copiar/descargar, y clic en el QR para verlo grande en un modal (para
 * proyectarlo o mostrarlo en el celular). Genera su propio QR a partir del
 * código — el padre no necesita manejar ese estado. `label` es opcional
 * (ej. el nombre del curso, para no confundir cuál código es cuál si hay
 * varios); lo que se proyecte con `<ng-content>` aparece debajo del link
 * (ej. contador de usos, botón de revocar).
 */
@Component({
  selector: 'app-invite-code-card',
  standalone: true,
  imports: [Button, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './invite-code-card.html',
})
export class InviteCodeCard {
  readonly code = input.required<string>();
  readonly label = input<string | undefined>(undefined);

  protected readonly i18n = inject(I18nService);
  protected readonly copied = signal(false);
  protected readonly zoomed = signal(false);
  protected readonly qrDataUrl = signal<string | null>(null);

  protected readonly link = computed(() => `${location.origin}/invite/${this.code()}`);
  protected readonly downloadName = computed(() => `invitacion-${this.code()}.png`);

  constructor() {
    effect(() => {
      generateQrDataUrl(this.link()).then((url) => this.qrDataUrl.set(url));
    });
  }

  protected async onCopy(): Promise<void> {
    await navigator.clipboard.writeText(this.link());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
