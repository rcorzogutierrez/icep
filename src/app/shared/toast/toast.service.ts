import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

/** Notificaciones efímeras (toasts) para confirmar o reportar el resultado de una acción. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  private nextId = 0;

  readonly toasts = this._toasts.asReadonly();

  success(message: string): void {
    this.push(message, 'success', DEFAULT_DURATION_MS);
  }

  error(message: string): void {
    this.push(message, 'error', ERROR_DURATION_MS);
  }

  info(message: string): void {
    this.push(message, 'info', DEFAULT_DURATION_MS);
  }

  dismiss(id: number): void {
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private push(message: string, variant: ToastVariant, durationMs: number): void {
    const id = this.nextId++;
    this._toasts.update((toasts) => [...toasts, { id, message, variant }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }
}
