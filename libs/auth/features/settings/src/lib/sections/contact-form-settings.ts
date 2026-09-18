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
import {
  ProfileService,
  type ContactFormLegalSettings,
} from '@guiders-frontend/profile-service';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';
import { SettingsRowComponent } from '../components/settings-row';

const DEFAULT_PRIVACY_LABEL = 'He leído y acepto la política de privacidad';
const DEFAULT_MARKETING_LABEL = 'Acepto recibir comunicaciones';

@Component({
  selector: 'lib-contact-form-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SettingsSectionHeaderComponent,
    SettingsRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-form-settings.html',
  styleUrl: './contact-form-settings.scss',
})
export class ContactFormSettingsComponent {
  private readonly profileService = inject(ProfileService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isAdmin = this.userService.hasRole('admin');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly saved = signal<ContactFormLegalSettings | null>(null);

  readonly privacyPolicyUrl = signal('');
  readonly privacyCheckboxLabel = signal(DEFAULT_PRIVACY_LABEL);
  readonly marketingCheckboxLabel = signal(DEFAULT_MARKETING_LABEL);

  readonly isDirty = computed(() => {
    const current = this.saved();
    if (!current) return false;
    return (
      this.privacyPolicyUrl().trim() !== current.privacyPolicyUrl.trim() ||
      this.privacyCheckboxLabel().trim() !== current.privacyCheckboxLabel.trim() ||
      this.marketingCheckboxLabel().trim() !==
        current.marketingCheckboxLabel.trim()
    );
  });

  constructor() {
    if (!this.isAdmin) {
      this.isLoading.set(false);
      return;
    }

    this.profileService
      .getContactFormLegal()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (legal) => {
          this.applyLegal(legal);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.toast.error(err?.message ?? 'No se pudieron cargar los textos');
        },
      });
  }

  save(): void {
    if (!this.isAdmin || this.isSaving() || !this.isDirty()) return;

    this.isSaving.set(true);
    this.profileService
      .updateContactFormLegal({
        privacyPolicyUrl: this.privacyPolicyUrl().trim(),
        privacyCheckboxLabel:
          this.privacyCheckboxLabel().trim() || DEFAULT_PRIVACY_LABEL,
        marketingCheckboxLabel:
          this.marketingCheckboxLabel().trim() || DEFAULT_MARKETING_LABEL,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (legal) => {
          this.applyLegal(legal);
          this.isSaving.set(false);
          this.toast.success('Textos del formulario guardados');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.message ?? 'No se pudieron guardar los textos');
        },
      });
  }

  private applyLegal(legal: ContactFormLegalSettings): void {
    this.saved.set(legal);
    this.privacyPolicyUrl.set(legal.privacyPolicyUrl ?? '');
    this.privacyCheckboxLabel.set(
      legal.privacyCheckboxLabel || DEFAULT_PRIVACY_LABEL
    );
    this.marketingCheckboxLabel.set(
      legal.marketingCheckboxLabel || DEFAULT_MARKETING_LABEL
    );
  }
}
