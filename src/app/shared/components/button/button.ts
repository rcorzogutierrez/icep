import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconLoaderCircle } from '../../icons/icons';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500',
  secondary:
    'bg-surface text-text border border-border shadow-sm hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-brand-500',
  danger:
    'bg-status-expired text-white shadow-sm hover:brightness-90 active:brightness-75 focus-visible:ring-status-expired',
  ghost:
    'bg-transparent text-text hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-brand-500',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

const ICON_SIZE: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

/**
 * Botón base de la app. Estilo 100% Tailwind sobre los tokens de marca; no
 * hay comportamiento ARIA especial que resolver porque `<button>` nativo ya
 * es accesible por sí mismo (Angular Aria se reserva para widgets
 * compuestos como Select, Modal o Tabs).
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [IconLoaderCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [class]="hostClass()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="handleClick($event)"
    >
      @if (loading()) {
        <svg lucideLoaderCircle class="animate-spin" [size]="iconSize()" aria-hidden="true"></svg>
      }
      <ng-content />
    </button>
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly fullWidth = input(false);

  readonly pressed = output<MouseEvent>();

  protected readonly hostClass = computed(
    () =>
      `${BASE_CLASSES} ${VARIANT_CLASSES[this.variant()]} ${SIZE_CLASSES[this.size()]} ${this.fullWidth() ? 'w-full' : ''}`,
  );
  protected readonly iconSize = computed(() => ICON_SIZE[this.size()]);

  protected handleClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      return;
    }
    this.pressed.emit(event);
  }
}
