import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const DEFAULT_BRAND = 'Guiders';

/**
 * Nombre de producto que ve el comercial en Console.
 * Vacío o ausente sigue siendo Guiders.
 */
@Injectable({ providedIn: 'root' })
export class ProductBrandService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _name = signal(DEFAULT_BRAND);

  readonly name = this._name.asReadonly();

  setName(raw: string | null | undefined): void {
    const name = raw?.trim() || DEFAULT_BRAND;
    this._name.set(name);
    if (!this.isBrowser) return;
    this.document.title = `${name} Console`;
  }
}
