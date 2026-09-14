import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconLoaderCircle } from '../../icons/icons';

/**
 * Indicador de carga reutilizable — mismo spinner que ya usa Button
 * (`IconLoaderCircle` + `animate-spin`), para que "cargando" se vea igual
 * en toda la app en vez de que cada página reinvente su propio "…" de
 * texto suelto. Por defecto es un bloque centrado con padding, pensado
 * para el `@empty` de una tabla o el gate de una página completa;
 * `inline` lo achica para meterlo en línea dentro de un elemento más
 * chico (ej. el valor de una tarjeta de estadística).
 */
@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [IconLoaderCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="containerClass()">
      <svg lucideLoaderCircle [size]="iconSize()" class="animate-spin" aria-hidden="true"></svg>
      @if (label(); as l) {
        <span>{{ l }}</span>
      }
    </span>
  `,
})
export class Loading {
  readonly label = input<string | undefined>(undefined);
  readonly inline = input(false);

  protected readonly containerClass = computed(() =>
    this.inline()
      ? 'inline-flex items-center gap-1.5 text-text-muted'
      : 'flex items-center justify-center gap-2 py-6 text-sm text-text-muted',
  );
  protected readonly iconSize = computed(() => (this.inline() ? 14 : 18));
}
