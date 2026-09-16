import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { ProfileService } from '@guiders-frontend/profile-service';
import { UserProfile } from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { getAvatarColor } from '@guiders-frontend/avatar-colors';
import { SettingsRowComponent } from '../components/settings-row';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';

@Component({
  selector: 'lib-profile-settings',
  standalone: true,
  imports: [CommonModule, SettingsRowComponent, SettingsSectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Triggers avatar upload; switchMap cancels in-flight requests on rapid re-selection. */
  private readonly uploadTrigger$ = new Subject<File>();

  readonly profile = signal<UserProfile | null>(null);
  readonly isUploading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly userName = computed(() => {
    const p = this.profile();
    return p?.name || p?.email?.split('@')[0] || 'Usuario';
  });

  readonly userInitials = computed(() => {
    return this.userName()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  });

  readonly avatarBg = computed(() => getAvatarColor(this.userInitials()));

  readonly avatarUrl = computed(() => this.profile()?.avatarUrl ?? null);

  constructor() {
    this.loadProfile();
    this.setupAvatarUpload();
  }

  private loadProfile(): void {
    this.profileService.getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          this.profile.set(profile);
        },
        error: err => {
          console.error('[ProfileSettings] load error', err);
          this.errorMessage.set('No se pudo cargar tu perfil');
        },
      });
  }

  private setupAvatarUpload(): void {
    this.uploadTrigger$.pipe(
      switchMap(file => {
        const profile = this.profile();
        if (!profile?.keycloakId) {
          this.toast.error('No se pudo obtener el perfil. Recarga la página.');
          return EMPTY;
        }
        this.isUploading.set(true);
        return this.profileService.uploadAvatar(profile.keycloakId, file).pipe(
          catchError(err => {
            // Isolate upload errors so the outer stream stays alive for future uploads.
            console.error('[ProfileSettings] upload error', err);
            this.isUploading.set(false);
            this.toast.error(err?.message ?? 'Error al subir la foto');
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: response => {
        this.profile.update(p => p ? { ...p, avatarUrl: response.avatarUrl } : p);
        this.isUploading.set(false);
        this.toast.success('Foto actualizada');
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      this.toast.error('Formato no válido. Usa PNG o JPG.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('El archivo supera los 5MB.');
      input.value = '';
      return;
    }

    this.uploadTrigger$.next(file);
    input.value = '';
  }
}

