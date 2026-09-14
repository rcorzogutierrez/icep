import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bloque gris pulsante (`animate-pulse` de Tailwind) — la pieza base para
 * armar placeholders con la silueta del contenido real mientras carga
 * (ej. una tarjeta de materia con sus líneas de texto), en vez de un
 * spinner genérico sin relación con lo que va a aparecer. `styleClass`
 * fija ancho/alto/forma por instancia (ej. `"h-4 w-2/3"`).
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="animate-pulse rounded-md bg-slate-200 {{ styleClass() }}"></div> `,
})
export class Skeleton {
  readonly styleClass = input('h-4 w-full');
}
