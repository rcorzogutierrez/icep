import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Contenedor único de ancho/espaciado para el contenido de una página de
 * ruta (todo lo que va dentro del <router-outlet> de AppShell). Antes cada
 * feature repetía su propio `mx-auto max-w-*` y terminaron divergiendo en 4
 * anchos distintos; este componente fija un solo valor para que navegar
 * entre páginas no cambie el ancho del contenido.
 */
@Component({
  selector: 'app-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ng-content />
    </div>
  `,
})
export class Page {}
