import { Listbox, Option } from '@angular/aria/listbox';
import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { IconCheck, IconChevronDown } from '../../icons/icons';

export interface SelectOption<V> {
  value: V;
  label: string;
  disabled?: boolean;
}

let nextSelectId = 0;

/**
 * Select accesible construido sobre el patrón Listbox de Angular Aria
 * (`ngListbox` / `ngOption` maneja teclado, foco y ARIA de la lista) más un
 * botón trigger propio y un overlay posicionado con `@angular/cdk/overlay`
 * (peer dependency de @angular/aria, sin estilos visuales propios — solo
 * posicionamiento). El estilo es 100% Tailwind sobre los tokens de la app;
 * no se usa Angular Material ni ningún kit visual.
 *
 * `selectionMode="explicit"` en el `ngListbox` es deliberado: por defecto
 * el patrón Listbox de Angular Aria selecciona automáticamente el ítem que
 * recibe foco ("follow"), lo cual dispararía `valueChange` (y cerraría el
 * panel) apenas se abre y el primer ítem recibe foco. En modo "explicit"
 * la selección solo ocurre con click / Enter / Space del usuario, que es
 * el comportamiento esperado de un Select.
 */
@Component({
  selector: 'app-select',
  standalone: true,
  imports: [Listbox, Option, IconCheck, IconChevronDown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1">
      @if (label(); as labelText) {
        <label [for]="triggerId" class="text-sm font-medium text-text">{{ labelText }}</label>
      }

      <button
        #trigger
        type="button"
        [id]="triggerId"
        class="flex h-10 w-full items-center justify-between rounded-xl border bg-surface px-3 text-sm text-text shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50"
        [class.border-border]="!invalid()"
        [class.border-status-expired]="invalid()"
        [disabled]="disabled()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listboxId : null"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <span class="truncate" [class.text-text-muted]="!selectedOption()">
          {{ selectedOption()?.label ?? placeholder() }}
        </span>
        <svg
          lucideChevronDown
          [size]="16"
          class="shrink-0 text-text-muted transition-transform"
          [class.rotate-180]="open()"
          aria-hidden="true"
        ></svg>
      </button>

      @if (invalid() && errorMessage(); as message) {
        <p class="text-sm text-status-expired">{{ message }}</p>
      }
    </div>

    <ng-template #panel>
      <ul
        ngListbox
        selectionMode="explicit"
        [id]="listboxId"
        [value]="selectedArray()"
        (valueChange)="onListboxValueChange($event)"
        [style.width.px]="panelWidth()"
        class="max-h-60 overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg focus:outline-none"
      >
        @for (option of options(); track option.value) {
          <li
            ngOption
            [value]="option.value"
            [label]="option.label"
            [disabled]="!!option.disabled"
            class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-text hover:bg-slate-50 aria-selected:bg-brand-50 aria-selected:text-brand-700 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <span class="truncate">{{ option.label }}</span>
            @if (isSelected(option.value)) {
              <svg lucideCheck [size]="16" class="shrink-0 text-brand-600" aria-hidden="true"></svg>
            }
          </li>
        }
      </ul>
    </ng-template>
  `,
})
export class Select<V> {
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelTpl = viewChild.required<TemplateRef<unknown>>('panel');

  private overlayRef: OverlayRef | null = null;

  readonly options = input.required<SelectOption<V>[]>();
  readonly placeholder = input('Seleccionar…');
  readonly label = input<string | undefined>(undefined);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly errorMessage = input<string | undefined>(undefined);

  /** Valor seleccionado, bindeable con `[(value)]`. */
  readonly value = model<V | undefined>(undefined);

  protected readonly open = signal(false);
  protected readonly panelWidth = signal(0);
  protected readonly triggerId = `app-select-trigger-${nextSelectId}`;
  protected readonly listboxId = `app-select-listbox-${nextSelectId++}`;

  protected readonly selectedOption = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  protected readonly selectedArray = computed(() => {
    const current = this.value();
    return current === undefined ? [] : [current];
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.overlayRef?.dispose());
  }

  protected isSelected(value: V): boolean {
    return this.value() === value;
  }

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    if (this.open()) {
      this.closePanel(false);
    } else {
      this.openPanel();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      if (!this.open()) {
        this.openPanel();
      }
    } else if (event.key === 'Escape' && this.open()) {
      this.closePanel(true);
    }
  }

  protected onListboxValueChange(values: V[]): void {
    const next = values[0];
    // Angular Aria emite un valueChange "de sincronización" (con el mismo
    // valor que ya tenía) al inicializar el listbox dentro del overlay.
    // Solo tratamos como elección real del usuario un valor definido y
    // distinto del actual; si no, no hay nada que hacer.
    if (next === undefined || next === this.value()) {
      return;
    }
    this.value.set(next);
    this.closePanel(true);
  }

  protected closePanel(restoreFocus: boolean): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.open.set(false);
    if (restoreFocus) {
      this.triggerRef().nativeElement.focus();
    }
  }

  private openPanel(): void {
    const trigger = this.triggerRef().nativeElement;
    const width = trigger.getBoundingClientRect().width;
    this.panelWidth.set(width);

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(trigger)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
      ])
      .withFlexibleDimensions(false)
      .withPush(false);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      width,
    });

    this.overlayRef.backdropClick().subscribe(() => this.closePanel(false));
    this.overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        this.closePanel(true);
      }
    });

    this.overlayRef.attach(new TemplatePortal(this.panelTpl(), this.viewContainerRef));
    this.open.set(true);

    queueMicrotask(() => {
      this.overlayRef?.overlayElement.querySelector<HTMLElement>('ul[ngListbox]')?.focus();
    });
  }
}
