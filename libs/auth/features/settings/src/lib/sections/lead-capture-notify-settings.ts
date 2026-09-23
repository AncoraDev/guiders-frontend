import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '@guiders-frontend/profile-service';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';
import { SettingsRowComponent } from '../components/settings-row';

@Component({
  selector: 'lib-lead-capture-notify-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SettingsSectionHeaderComponent,
    SettingsRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-capture-notify-settings.html',
  styleUrl: './lead-capture-notify-settings.scss',
})
export class LeadCaptureNotifySettingsComponent {
  private readonly profileService = inject(ProfileService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isAdmin = this.userService.hasRole('admin');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly savedEmail = signal('');
  readonly email = signal('');

  readonly isDirty = computed(
    () => this.email().trim() !== this.savedEmail().trim(),
  );

  constructor() {
    if (!this.isAdmin) {
      this.isLoading.set(false);
      return;
    }

    this.profileService
      .getLeadCaptureNotify()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.savedEmail.set(settings.email ?? '');
          this.email.set(settings.email ?? '');
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.toast.error(err?.message ?? 'No se pudo cargar el email de avisos');
        },
      });
  }

  save(): void {
    if (!this.isAdmin || this.isSaving() || !this.isDirty()) return;

    this.isSaving.set(true);
    this.profileService
      .updateLeadCaptureNotify({ email: this.email().trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.savedEmail.set(settings.email ?? '');
          this.email.set(settings.email ?? '');
          this.isSaving.set(false);
          this.toast.success('Email de avisos guardado');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.message ?? 'No se pudo guardar el email');
        },
      });
  }
}
