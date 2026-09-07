import { effect, type Signal } from '@angular/core';

/**
 * Puente signal -> Promise sin RxJS: resuelve la primera vez que
 * `predicate(source())` da true, vía un `effect()` que se autodestruye
 * apenas se cumple. Debe llamarse desde un contexto de inyección activo
 * (mismo requisito que `effect()`/`inject()` — los guards funcionales del
 * router ya lo son).
 */
export function waitForSignal<T>(source: Signal<T>, predicate: (value: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const ref = effect(() => {
      const value = source();
      if (predicate(value)) {
        resolve(value);
        ref.destroy();
      }
    });
  });
}
