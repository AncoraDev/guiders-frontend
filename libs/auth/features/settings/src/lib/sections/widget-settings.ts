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
  type WidgetConfigSettings,
  type WidgetPositionPreset,
} from '@guiders-frontend/profile-service';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';
import { SettingsRowComponent } from '../components/settings-row';

const DEFAULT_WIDGET: WidgetConfigSettings = {
  chatEnabled: true,
  autoOpenChatOnMessage: true,
  colorScheme: 'system',
  theme: 'default',
  position: {
    desktop: 'bottom-right',
    mobileEnabled: false,
    mobile: 'bottom-right',
  },
};

const POSITION_OPTIONS: { id: WidgetPositionPreset; label: string }[] = [
  { id: 'bottom-right', label: 'Abajo derecha' },
  { id: 'bottom-left', label: 'Abajo izquierda' },
  { id: 'top-right', label: 'Arriba derecha' },
  { id: 'top-left', label: 'Arriba izquierda' },
];

@Component({
  selector: 'lib-widget-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SettingsSectionHeaderComponent,
    SettingsRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-settings.html',
  styleUrl: './widget-settings.scss',
})
export class WidgetSettingsComponent {
  private readonly profileService = inject(ProfileService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isAdmin = this.userService.hasRole('admin');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly saved = signal<WidgetConfigSettings | null>(null);
  readonly positionOptions = POSITION_OPTIONS;

  readonly chatEnabled = signal(true);
  readonly autoOpenChatOnMessage = signal(true);
  readonly colorScheme = signal<WidgetConfigSettings['colorScheme']>('system');
  readonly theme = signal<WidgetConfigSettings['theme']>('default');
  readonly desktopPosition = signal<WidgetPositionPreset>('bottom-right');
  readonly mobileEnabled = signal(false);
  readonly mobilePosition = signal<WidgetPositionPreset>('bottom-right');

  readonly isDirty = computed(() => {
    const current = this.saved();
    if (!current) return false;
    const draft = this.draft();
    return JSON.stringify(draft) !== JSON.stringify(current);
  });

  constructor() {
    if (!this.isAdmin) {
      this.isLoading.set(false);
      return;
    }

    this.profileService
      .getWidgetConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.applyConfig(config);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.toast.error(err?.message ?? 'No se pudo cargar el chat web');
        },
      });
  }

  save(): void {
    if (!this.isAdmin || this.isSaving() || !this.isDirty()) return;
    this.isSaving.set(true);
    this.profileService
      .updateWidgetConfig(this.draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.applyConfig(config);
          this.isSaving.set(false);
          this.toast.success('Chat web guardado');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.message ?? 'No se pudo guardar el chat web');
        },
      });
  }

  private draft(): WidgetConfigSettings {
    return {
      chatEnabled: this.chatEnabled(),
      autoOpenChatOnMessage: this.autoOpenChatOnMessage(),
      colorScheme: this.colorScheme(),
      theme: this.theme(),
      position: {
        desktop: this.desktopPosition(),
        mobileEnabled: this.mobileEnabled(),
        mobile: this.mobilePosition(),
      },
    };
  }

  private applyConfig(config: WidgetConfigSettings): void {
    const merged: WidgetConfigSettings = {
      ...DEFAULT_WIDGET,
      ...config,
      position: {
        ...DEFAULT_WIDGET.position,
        ...(config.position ?? {}),
      },
    };
    this.saved.set(merged);
    this.chatEnabled.set(merged.chatEnabled);
    this.autoOpenChatOnMessage.set(merged.autoOpenChatOnMessage);
    this.colorScheme.set(merged.colorScheme);
    this.theme.set(merged.theme);
    this.desktopPosition.set(merged.position.desktop);
    this.mobileEnabled.set(merged.position.mobileEnabled);
    this.mobilePosition.set(merged.position.mobile);
  }
}
