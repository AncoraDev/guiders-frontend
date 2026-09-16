import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'guiders-toast-host',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host" role="status" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast--' + toast.variant">
          <span class="toast__icon" aria-hidden="true">
            @switch (toast.variant) {
              @case ('success') { ✓ }
              @case ('error') { ✕ }
              @default { ! }
            }
          </span>
          <span class="toast__text">{{ toast.text }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './toast-host.scss',
})
export class ToastHostComponent {
  readonly toastService = inject(ToastService);
}
