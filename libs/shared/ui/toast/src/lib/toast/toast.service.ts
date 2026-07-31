import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly variant: ToastVariant;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private nextId = 1;

  show(text: string, variant: ToastVariant = 'success', durationMs = 2000): void {
    const id = this.nextId++;
    const toast: ToastMessage = { id, text, variant };
    this._toasts.update(list => [...list, toast]);

    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  success(text: string, durationMs = 2000): void {
    this.show(text, 'success', durationMs);
  }

  error(text: string, durationMs = 2000): void {
    this.show(text, 'error', durationMs);
  }

  info(text: string, durationMs = 4000): void {
    this.show(text, 'info', durationMs);
  }

  dismiss(id: number): void {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }
}
