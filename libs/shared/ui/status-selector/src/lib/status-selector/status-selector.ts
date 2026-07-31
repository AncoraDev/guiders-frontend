import {
  Component,
  signal,
  inject,
  computed,
  input,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CommercialPresenceService,
  ConnectionStatus,
} from '@guiders-frontend/commercial-presence';
import { ProfileService } from '@guiders-frontend/profile-service';
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
  private readonly profileService = inject(ProfileService);
  private readonly destroyRef = inject(DestroyRef);

  /** Avatar opcional; si no se pasa, se intenta cargar del perfil del usuario. */
  readonly avatarUrl = input<string | null>(null);

  readonly currentStatus = signal<ConnectionStatus>('offline');
  readonly isUpdating = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  private readonly loadedAvatarUrl = signal<string | null>(null);

  readonly isOnline = computed(() => this.currentStatus() === 'online');
  readonly label = computed(() =>
    this.isOnline() ? 'Conectado' : 'Desconectado'
  );
  readonly resolvedAvatarUrl = computed(
    () => this.avatarUrl() || this.loadedAvatarUrl()
  );

  constructor() {
    this.presenceService.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        this.currentStatus.set(status === 'online' ? 'online' : 'offline');
      });

    this.profileService
      .getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.loadedAvatarUrl.set(profile.avatarUrl || null);
        },
        error: () => {
          // Sin avatar: se mantiene el punto de estado habitual
        },
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
