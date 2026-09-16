import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RedirectConfirmService } from '../redirect-confirm.service';

@Component({
  selector: 'guiders-redirect-confirm',
  imports: [],
  templateUrl: './redirect-confirm.html',
  styleUrl: './redirect-confirm.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RedirectConfirm {
  protected readonly redirectService = inject(RedirectConfirmService);

  onBackdropClick(event: Event): void {
    // No cerrar: "Cerrar sesión" hace logout real; el backdrop no debe saltárselo.
    event.stopPropagation();
  }

  onConfirm(): void {
    this.redirectService.confirm();
  }

  onCancel(): void {
    this.redirectService.cancel();
  }
}
