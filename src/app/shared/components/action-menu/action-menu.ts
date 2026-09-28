import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IconEllipsisVertical } from '../../icons/icons';

let nextActionMenuId = 0;

/**
 * Menú "kebab" (tres puntos) para las acciones secundarias de una fila de
 * tabla — mismo patrón de overlay que `Select` (posicionado con
 * `@angular/cdk/overlay`, cierra con click afuera o Escape), pero el
 * contenido es libre vía `<ng-content>`: normalmente uno o más `app-button`
 * (`variant="ghost"`/`"warning"`/etc., `size="sm"`, `[fullWidth]="true"`),
 * uno por acción. Pensado para sacar acciones poco frecuentes de una fila
 * sin que su altura crezca con la cantidad de botones — ver Invitaciones,
 * donde una fila "pendiente" tenía 4 botones apilados contra 1 sola en el
 * resto. Cualquier click adentro del panel lo cierra (cada acción acá es de
 * un solo paso, no un toggle que deba quedar abierto).
 */
@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [IconEllipsisVertical],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-menu.html',
})
export class ActionMenu {
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelTpl = viewChild.required<TemplateRef<unknown>>('panel');

  private overlayRef: OverlayRef | null = null;

  readonly label = input('Más acciones');

  protected readonly open = signal(false);
  protected readonly triggerId = `app-action-menu-trigger-${nextActionMenuId++}`;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.overlayRef?.dispose());
  }

  protected toggle(): void {
    if (this.open()) {
      this.closePanel(false);
    } else {
      this.openPanel();
    }
  }

  /** Cualquier click adentro del panel es una acción de un solo paso -> cerrar. */
  protected onPanelClick(): void {
    this.closePanel(false);
  }

  private closePanel(restoreFocus: boolean): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.open.set(false);
    if (restoreFocus) {
      this.triggerRef().nativeElement.focus();
    }
  }

  private openPanel(): void {
    const trigger = this.triggerRef().nativeElement;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(trigger)
      .withPositions([
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
      ])
      .withFlexibleDimensions(false)
      .withPush(false);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    this.overlayRef.backdropClick().subscribe(() => this.closePanel(false));
    this.overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        this.closePanel(true);
      }
    });

    this.overlayRef.attach(new TemplatePortal(this.panelTpl(), this.viewContainerRef));
    this.open.set(true);
  }
}
