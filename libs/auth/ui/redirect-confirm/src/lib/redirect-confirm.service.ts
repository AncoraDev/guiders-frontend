import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface RedirectConfirmData {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  redirectUrl: string;
}

@Injectable({ providedIn: 'root' })
export class RedirectConfirmService {
  private readonly _isOpen = signal<boolean>(false);
  private readonly _data = signal<RedirectConfirmData | null>(null);
  private readonly _confirmed = new Subject<boolean>();
  private pending: Promise<boolean> | null = null;

  readonly isOpen = this._isOpen.asReadonly();
  readonly data = this._data.asReadonly();

  show(data: RedirectConfirmData): Promise<boolean> {
    if (this.pending) {
      return this.pending;
    }

    this._data.set(data);
    this._isOpen.set(true);

    this.pending = new Promise((resolve) => {
      const subscription = this._confirmed.subscribe((confirmed) => {
        subscription.unsubscribe();
        this.pending = null;
        resolve(confirmed);
      });
    });

    return this.pending;
  }

  confirm(): void {
    const data = this._data();
    if (data?.redirectUrl) {
      window.location.replace(data.redirectUrl);
    }
    this._isOpen.set(false);
    this._data.set(null);
    this._confirmed.next(true);
  }

  cancel(): void {
    this._isOpen.set(false);
    this._data.set(null);
    this._confirmed.next(false);
  }
}
