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
  readonly isTesting = signal(false);
  readonly savedEmail = signal('');
  readonly savedFrom = signal('');
  readonly apiKeyConfigured = signal(false);
  readonly apiKeyLast4 = signal<string | null>(null);
  readonly email = signal('');
  readonly from = signal('');
  readonly apiKey = signal('');

  readonly apiKeyHint = computed(() => {
    const last4 = this.apiKeyLast4();
    if (this.isMaskedApiKey()) {
      return `Clave guardada (termina en ${last4}). Pulsa el campo para pegar otra.`;
    }
    if (this.apiKeyConfigured() && last4) {
      return `Había una clave que termina en ${last4}. Pega la nueva o deja el campo para no cambiarla.`;
    }
    return 'Pega la API key de Resend (re_…). Tras guardar solo se ven los últimos 4.';
  });

  readonly isDirty = computed(
    () =>
      this.email().trim() !== this.savedEmail().trim() ||
      this.from().trim() !== this.savedFrom().trim() ||
      this.incomingApiKey().length > 0,
  );

  readonly canTest = computed(
    () =>
      this.email().trim().length > 0 &&
      this.from().trim().length > 0 &&
      (this.incomingApiKey().length > 0 || this.apiKeyConfigured()),
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
          this.applySaved(settings);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.toast.error(
            err?.message ?? 'No se pudo cargar la configuración de avisos',
          );
        },
      });
  }

  testConnection(): void {
    if (!this.isAdmin || this.isTesting() || this.isSaving()) return;

    const email = this.email().trim();
    const apiKey = this.incomingApiKey();
    if (!email || (!apiKey && !this.apiKeyConfigured())) {
      this.toast.error(
        'Indica un email de destino y la API key de Resend para probar la conexión',
      );
      return;
    }

    this.isTesting.set(true);
    this.profileService
      .testLeadCaptureNotify({
        email,
        from: this.from().trim(),
        apiKey,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isTesting.set(false);
          this.toast.success(`Email de prueba enviado a ${email}`);
        },
        error: (err) => {
          this.isTesting.set(false);
          this.toast.error(err?.message ?? 'No se pudo enviar el email de prueba');
        },
      });
  }

  save(): void {
    if (!this.isAdmin || this.isSaving() || this.isTesting() || !this.isDirty())
      return;

    if (
      (this.incomingApiKey() || this.apiKeyConfigured()) &&
      !this.email().trim()
    ) {
      this.toast.error(
        'Indica un email de destino además de la API key de Resend',
      );
      return;
    }

    this.isSaving.set(true);
    this.profileService
      .updateLeadCaptureNotify({
        email: this.email().trim(),
        from: this.from().trim(),
        apiKey: this.incomingApiKey(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.applySaved(settings);
          this.isSaving.set(false);
          this.toast.success('Avisos de captación guardados');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.message ?? 'No se pudo guardar la configuración');
        },
      });
  }

  private applySaved(settings: {
    email?: string;
    from?: string;
    apiKeyConfigured?: boolean;
    apiKeyLast4?: string | null;
  }): void {
    this.savedEmail.set(settings.email ?? '');
    this.savedFrom.set(settings.from ?? '');
    this.email.set(settings.email ?? '');
    this.from.set(settings.from ?? '');
    this.apiKeyConfigured.set(!!settings.apiKeyConfigured);
    this.apiKeyLast4.set(settings.apiKeyLast4 ?? null);
    this.apiKey.set(this.maskApiKey(settings.apiKeyLast4 ?? null));
  }

  onApiKeyFocus(): void {
    if (this.isMaskedApiKey()) {
      this.apiKey.set('');
    }
  }

  private incomingApiKey(): string {
    if (this.isMaskedApiKey()) {
      return '';
    }
    return this.apiKey().trim();
  }

  isMaskedApiKey(): boolean {
    const last4 = this.apiKeyLast4();
    return !!last4 && this.apiKey() === this.maskApiKey(last4);
  }

  private maskApiKey(last4: string | null): string {
    if (!last4) {
      return '';
    }
    return `re_••••••••${last4}`;
  }
}
