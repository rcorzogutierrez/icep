import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { SelectOption } from '../select/select';
import { Button } from '../button/button';
import { IconArrowLeft, IconArrowRight } from '../../icons/icons';

/**
 * Selector de dos columnas ("Disponibles" / "Seleccionadas") para mover
 * varios ítems de una lista a la otra a la vez — con checkbox de
 * "seleccionar todas" en cada columna. Emite `add`/`remove` con los values
 * movidos; quien lo usa decide qué hacer con eso (acá: llamar a assign/
 * unassign de a uno). No commitea nada por sí solo.
 */
@Component({
  selector: 'app-transfer-list',
  standalone: true,
  imports: [Button, IconArrowLeft, IconArrowRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-list.html',
})
export class TransferList {
  readonly availableItems = input.required<SelectOption<string>[]>();
  readonly selectedItems = input.required<SelectOption<string>[]>();
  readonly availableLabel = input('Disponibles');
  readonly selectedLabel = input('Seleccionadas');

  readonly add = output<string[]>();
  readonly remove = output<string[]>();

  protected readonly checkedAvailable = signal<Set<string>>(new Set());
  protected readonly checkedSelected = signal<Set<string>>(new Set());

  protected readonly allAvailableChecked = computed(
    () =>
      this.availableItems().length > 0 &&
      this.availableItems().every((item) => this.checkedAvailable().has(item.value)),
  );
  protected readonly allSelectedChecked = computed(
    () =>
      this.selectedItems().length > 0 &&
      this.selectedItems().every((item) => this.checkedSelected().has(item.value)),
  );

  protected toggleAvailable(value: string): void {
    this.checkedAvailable.update((current) => toggled(current, value));
  }

  protected toggleSelected(value: string): void {
    this.checkedSelected.update((current) => toggled(current, value));
  }

  protected toggleAllAvailable(): void {
    this.checkedAvailable.set(
      this.allAvailableChecked() ? new Set() : new Set(this.availableItems().map((i) => i.value)),
    );
  }

  protected toggleAllSelected(): void {
    this.checkedSelected.set(
      this.allSelectedChecked() ? new Set() : new Set(this.selectedItems().map((i) => i.value)),
    );
  }

  protected moveToSelected(): void {
    const values = [...this.checkedAvailable()];
    if (values.length === 0) {
      return;
    }
    this.add.emit(values);
    this.checkedAvailable.set(new Set());
  }

  protected moveToAvailable(): void {
    const values = [...this.checkedSelected()];
    if (values.length === 0) {
      return;
    }
    this.remove.emit(values);
    this.checkedSelected.set(new Set());
  }

  protected moveOneToSelected(value: string): void {
    this.add.emit([value]);
  }

  protected moveOneToAvailable(value: string): void {
    this.remove.emit([value]);
  }
}

function toggled(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
