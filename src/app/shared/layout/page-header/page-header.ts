import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconArrowLeft } from '../../icons/icons';

/**
 * Header estándar de página: back-button opcional + título + subtítulo
 * opcional. El título se proyecta (atributo `pageTitle`) en vez de recibirse
 * como `@Input` de texto plano porque varias páginas necesitan markup
 * dentro del <h1> (p. ej. código + nombre de materia).
 *
 * El "volver" siempre navega vía `(back)` en vez de `routerLink`: algunas
 * páginas vuelven a una ruta fija y otras a `location.back()` o una ruta con
 * parámetros dinámicos, así que delegar al componente evita tener dos
 * mecanismos distintos de volver conviviendo en la misma UI.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [IconArrowLeft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.html',
})
export class PageHeader {
  readonly subtitle = input<string | undefined>(undefined);
  readonly backLabel = input<string | undefined>(undefined);

  readonly back = output<void>();
}
