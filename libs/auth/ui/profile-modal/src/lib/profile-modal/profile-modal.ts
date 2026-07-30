import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Button } from '@guiders-frontend/button';
import { ButtonPrimaryComponent } from '@guiders-frontend/button-primary';
import { ButtonSecondaryComponent } from '@guiders-frontend/button-secondary';
import { ButtonTertiaryComponent } from '@guiders-frontend/button-tertiary';
import { UserProfile, SessionService } from '@guiders-frontend/auth/data-access/session';
import { getAvatarColor } from '@guiders-frontend/avatar-colors';
import { CommercialFingerprintService } from '@guiders-frontend/commercial-fingerprint-service';
import { ThemeService, THEME_OPTIONS, ThemeOption } from '@guiders-frontend/shared/data-access/theme';
import { firstValueFrom } from 'rxjs';
import {
  AllSettings,
  AvatarUpdateRequest,
  SettingsSection,
  SettingsSectionConfig,
  SettingsUpdateRequest,
  UserStatus,
  FontSize,
  Language
} from './settings.types';

@Component({
  selector: 'lib-profile-modal',
  imports: [CommonModule, FormsModule, Button, ButtonPrimaryComponent, ButtonSecondaryComponent, ButtonTertiaryComponent],
  standalone: true,
  templateUrl: './profile-modal.html',
  styleUrl: './profile-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileModalComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly commercialFingerprintService = inject(CommercialFingerprintService);
  private readonly sessionService = inject(SessionService);
  readonly themeService = inject(ThemeService);

  /** Expose theme options to the template */
  readonly themeOptions: ThemeOption[] = THEME_OPTIONS;

  readonly darkThemes = THEME_OPTIONS.filter((t) => t.group === 'dark');
  readonly lightThemes = THEME_OPTIONS.filter((t) => t.group === 'light');
  readonly companyThemes = THEME_OPTIONS.filter((t) => t.group === 'company');

  // Inputs
  readonly currentUser = input.required<UserProfile>();
  readonly isOpen = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly currentSettings = input<Partial<AllSettings>>({});

  // Outputs
  readonly modalClose = output<void>();
  readonly avatarUpdate = output<AvatarUpdateRequest>();
  readonly settingsUpdate = output<SettingsUpdateRequest>();

  // Navigation state
  readonly activeSection = signal<SettingsSection>('profile');

  // Sections configuration
  readonly sections = computed<SettingsSectionConfig[]>(() => [
    {
      id: 'profile',
      label: 'Perfil',
      svg: this.sanitizer.bypassSecurityTrustHtml('<svg width="24px" height="24px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor"><path d="M5 20V19C5 15.134 8.13401 12 12 12V12C15.866 12 19 15.134 19 19V20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>')
    },
    {
      id: 'notifications',
      label: 'Notificaciones',
      svg: this.sanitizer.bypassSecurityTrustHtml('<svg width="24px" height="24px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor"><path d="M18 8.4C18 6.70261 17.3679 5.07475 16.2426 3.87452C15.1174 2.67428 13.5913 2 12 2C10.4087 2 8.88258 2.67428 7.75736 3.87452C6.63214 5.07475 6 6.70261 6 8.4C6 15.8667 3 18 3 18H21C21 18 18 15.8667 18 8.4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>')
    },
    {
      id: 'appearance',
      label: 'Apariencia',
      svg: this.sanitizer.bypassSecurityTrustHtml('<svg width="24px" height="24px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor"><path d="M20.5096 9.54C20.4243 9.77932 20.2918 9.99909 20.12 10.1863C19.9483 10.3735 19.7407 10.5244 19.5096 10.63C18.2796 11.1806 17.2346 12.0745 16.5002 13.2045C15.7659 14.3345 15.3733 15.6524 15.3696 17C15.3711 17.4701 15.418 17.9389 15.5096 18.4C15.5707 18.6818 15.5747 18.973 15.5215 19.2564C15.4682 19.5397 15.3588 19.8096 15.1996 20.05C15.0649 20.2604 14.8877 20.4403 14.6793 20.5781C14.4709 20.7158 14.2359 20.8085 13.9896 20.85C13.4554 20.9504 12.9131 21.0006 12.3696 21C11.1638 21.0006 9.97011 20.7588 8.85952 20.2891C7.74893 19.8194 6.74405 19.1314 5.90455 18.2657C5.06506 17.4001 4.40807 16.3747 3.97261 15.2502C3.53714 14.1257 3.33208 12.9252 3.36959 11.72C3.4472 9.47279 4.3586 7.33495 5.92622 5.72296C7.49385 4.11097 9.60542 3.14028 11.8496 3H12.3596C14.0353 3.00042 15.6777 3.46869 17.1017 4.35207C18.5257 5.23544 19.6748 6.49885 20.4196 8C20.6488 8.47498 20.6812 9.02129 20.5096 9.52V9.54Z" stroke="currentColor" stroke-width="1.5"></path><path d="M8 16.01L8.01 15.9989" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 12.01L6.01 11.9989" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8 8.01L8.01 7.99889" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 6.01L12.01 5.99889" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M16 8.01L16.01 7.99889" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>')
    },
    {
      id: 'chat',
      label: 'Chat',
      svg: this.sanitizer.bypassSecurityTrustHtml('<svg width="24px" height="24px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor"><path d="M7.5 22C10.5376 22 13 19.5376 13 16.5C13 13.4624 10.5376 11 7.5 11C4.46243 11 2 13.4624 2 16.5C2 17.5018 2.26783 18.441 2.7358 19.25L2.275 21.725L4.75 21.2642C5.55898 21.7322 6.49821 22 7.5 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M15.2824 17.8978C16.2587 17.7405 17.1758 17.4065 18 16.9297L21.6 17.6L20.9297 14C21.6104 12.8233 22 11.4571 22 10C22 5.58172 18.4183 2 14 2C9.97262 2 6.64032 4.97598 6.08221 8.84884" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>')
    },
    {
      id: 'privacy',
      label: 'Privacidad',
      svg: this.sanitizer.bypassSecurityTrustHtml('<svg width="24px" height="24px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="currentColor"><path d="M16 12H17.4C17.7314 12 18 12.2686 18 12.6V19.4C18 19.7314 17.7314 20 17.4 20H6.6C6.26863 20 6 19.7314 6 19.4V12.6C6 12.2686 6.26863 12 6.6 12H8M16 12V8C16 6.66667 15.2 4 12 4C8.8 4 8 6.66667 8 8V12M16 12H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>')
    }
  ]);

  // Avatar state (for profile section)
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly isDraggingOver = signal<boolean>(false);

  // Form state for each section
  readonly profileForm = signal({
    fullName: ''
  });

  // Fingerprint registration state
  readonly fingerprintInput = signal<string>('');
  readonly isRegisteringFingerprint = signal<boolean>(false);
  readonly fingerprintRegistered = signal<boolean>(false);
  readonly fingerprintError = signal<string | null>(null);

  // Computed values
  readonly userName = computed(() => {
    const user = this.currentUser();
    return user.name || user.email.split('@')[0] || 'Usuario';
  });

  readonly userEmail = computed(() => {
    return this.currentUser().email;
  });

  readonly userInitials = computed(() => {
    const name = this.userName();
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  });

  readonly avatarBackgroundColor = computed(() => {
    const initials = this.userInitials();
    return getAvatarColor(initials);
  });

  readonly hasAvatarChanges = computed(() => {
    return this.selectedFile() !== null;
  });

  readonly hasFormChanges = computed(() => {
    // TODO: Comparar con currentSettings para detectar cambios
    return this.hasAvatarChanges();
  });

  readonly canSubmit = computed(() => {
    return this.hasFormChanges() && !this.loading();
  });

  readonly displayAvatarUrl = computed(() => {
    return this.previewUrl() ?? this.currentUser().avatarUrl ?? null;
  });

  readonly showAvatarImage = computed(() => {
    return this.displayAvatarUrl() !== null;
  });

  constructor() {
    // Effect para limpiar estado cuando se cierra el modal
    effect(() => {
      const isOpen = this.isOpen();
      if (!isOpen) {
        this.resetState();
      }
    });

    // Effect para inicializar el formulario con los datos del usuario
    effect(() => {
      const user = this.currentUser();
      if (user?.name) {
        this.profileForm.update(form => ({
          ...form,
          fullName: user.name
        }));
      }
    });
  }

  // Navigation
  onSectionClick(sectionId: SettingsSection): void {
    this.activeSection.set(sectionId);
    this.errorMessage.set(null);
  }

  // Event handlers
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  onCancel(): void {
    this.resetState();
    this.modalClose.emit();
  }

  // Avatar handlers
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.validateAndSetFile(file);
  }

  onRemoveSelectedFile(): void {
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.errorMessage.set(null);

    const fileInput = document.getElementById('avatar-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  // Drag and drop handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    this.validateAndSetFile(file);
  }

  private validateAndSetFile(file: File): void {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      this.errorMessage.set('Formato de archivo no válido. Solo se permiten PNG y JPG.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.errorMessage.set('El archivo es demasiado grande. Tamaño máximo: 5MB.');
      return;
    }

    this.errorMessage.set(null);
    this.selectedFile.set(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      this.previewUrl.set(result);
    };
    reader.readAsDataURL(file);
  }

  onSubmit(): void {
    if (!this.canSubmit()) {
      return;
    }

    // Si hay cambios en avatar, emitir avatar update
    const file = this.selectedFile();
    if (file) {
      const user = this.currentUser();
      this.avatarUpdate.emit({
        userId: user.keycloakId,
        file: file
      });
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onCancel();
    }
  }

  async onRegisterFingerprint(): Promise<void> {
    const fingerprint = this.fingerprintInput().trim();

    if (!fingerprint) {
      this.fingerprintError.set('Por favor ingresa un fingerprint válido');
      return;
    }

    this.isRegisteringFingerprint.set(true);
    this.fingerprintError.set(null);
    this.fingerprintRegistered.set(false);

    try {
      const user = await firstValueFrom(this.sessionService.ensureSession$());
      await firstValueFrom(
        this.commercialFingerprintService.registerFingerprint(user.sub, fingerprint)
      );

      this.fingerprintRegistered.set(true);
      this.fingerprintInput.set('');

      // Limpiar el mensaje de éxito después de 3 segundos
      setTimeout(() => {
        this.fingerprintRegistered.set(false);
      }, 3000);
    } catch (error) {
      console.error('Error registering fingerprint:', error);
      this.fingerprintError.set('Error al registrar el fingerprint. Por favor intenta nuevamente.');
    } finally {
      this.isRegisteringFingerprint.set(false);
    }
  }

  private resetState(): void {
    this.activeSection.set('profile');
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.errorMessage.set(null);

    const fileInput = document.getElementById('avatar-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  // Helper methods
  getFileSizeDisplay(): string {
    const file = this.selectedFile();
    if (!file) return '';

    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB < 1) {
      const sizeInKB = file.size / 1024;
      return `${sizeInKB.toFixed(1)} KB`;
    }
    return `${sizeInMB.toFixed(2)} MB`;
  }
}
