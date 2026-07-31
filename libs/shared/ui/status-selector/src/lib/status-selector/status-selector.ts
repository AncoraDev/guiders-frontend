import {
  Component,
  signal,
  inject,
  computed,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CommercialPresenceService,
  ConnectionStatus,
} from '@guiders-frontend/commercial-presence';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, timeout, catchError } from 'rxjs';

/**
 * Toggle binario Conectado / Desconectado (presencia manual del comercial).
 * La UI es optimista: no espera al HTTP (evita quedarse bloqueada si el backend tarda).
 */
@Component({
  selector: 'guiders-status-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-selector.html',
  styleUrl: './status-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusSelector {
  private readonly presenceService = inject(CommercialPresenceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentStatus = signal<ConnectionStatus>('offline');
  readonly isUpdating = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  readonly isOnline = computed(() => this.currentStatus() === 'online');
  readonly label = computed(() =>
    this.isOnline() ? 'Conectado' : 'Desconectado'
  );

  constructor() {
    this.presenceService.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        this.currentStatus.set(status === 'online' ? 'online' : 'offline');
      });
  }

  togglePresence(): void {
    if (this.isUpdating()) return;

    this.error.set(null);
    const goingOnline = !this.isOnline();

    // Feedback inmediato — el botón no se queda en "…"
    this.currentStatus.set(goingOnline ? 'online' : 'offline');
    this.isUpdating.set(true);

    const request$: Observable<unknown> = goingOnline
      ? this.presenceService.connect()
      : this.presenceService.disconnect({ reason: 'manual' });

    // Desbloquear UI enseguida (el HTTP sigue en background)
    window.setTimeout(() => this.isUpdating.set(false), 400);

    request$
      .pipe(
        timeout({ first: 10_000 }),
        catchError((err: Error) => {
          console.warn('[StatusSelector] presencia (timeout/error):', err);
          this.error.set(
            goingOnline
              ? 'Error al conectar (revisa red/backend)'
              : 'Error al desconectar (estado local ya offline)',
          );
          if (goingOnline) {
            this.currentStatus.set('offline');
          }
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
