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
import {
  UserService,
  type CannedReply,
  type UserProfile,
} from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';
import { SettingsRowComponent } from '../components/settings-row';
import { CannedRepliesEditorComponent } from '../components/canned-replies-editor';

const DEFAULT_GREETING = '¡Hola! ¿En qué puedo ayudarte?';
const GREETING_MAX = 500;

@Component({
  selector: 'lib-replies-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SettingsSectionHeaderComponent,
    SettingsRowComponent,
    CannedRepliesEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './replies-settings.html',
  styleUrl: './replies-settings.scss',
})
export class RepliesSettingsComponent {
  private readonly profileService = inject(ProfileService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly greetingMax = GREETING_MAX;
  readonly greetingPlaceholder = DEFAULT_GREETING;
  readonly personalMax = 15;
  readonly teamMax = 20;

  readonly profile = signal<UserProfile | null>(null);
  readonly greetingDraft = signal('');
  readonly isSavingGreeting = signal(false);
  readonly greetingDirty = computed(() => {
    const saved = this.profile()?.greetingMessage ?? '';
    return this.greetingDraft().trim() !== saved.trim();
  });
  readonly greetingCount = computed(() => this.greetingDraft().length);

  readonly personalDraft = signal<CannedReply[]>([]);
  readonly isSavingPersonal = signal(false);

  readonly isAdmin = signal(this.userService.hasRole('admin'));
  readonly teamDraft = signal<CannedReply[]>([]);
  readonly teamSaved = signal<CannedReply[]>([]);
  readonly isSavingTeam = signal(false);

  constructor() {
    this.profileService
      .getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.greetingDraft.set(profile.greetingMessage ?? '');
          this.personalDraft.set([...(profile.cannedReplies ?? [])]);
        },
        error: (err) => {
          this.toast.error(err?.message ?? 'No se pudo cargar tu perfil');
        },
      });

    this.profileService
      .getTeamCannedReplies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.teamSaved.set(items);
          this.teamDraft.set([...items]);
        },
        error: (err) => {
          this.toast.error(err?.message ?? 'No se pudieron cargar las frases del equipo');
        },
      });
  }

  onGreetingInput(value: string): void {
    this.greetingDraft.set(value.slice(0, GREETING_MAX));
  }

  saveGreeting(): void {
    if (this.isSavingGreeting()) return;
    const message = this.greetingDraft().trim() || null;
    this.isSavingGreeting.set(true);
    this.profileService
      .updateGreetingMessage(message)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.profile.update((p) =>
            p ? { ...p, greetingMessage: res.greetingMessage } : p,
          );
          this.greetingDraft.set(res.greetingMessage ?? '');
          this.isSavingGreeting.set(false);
          this.toast.success('Mensaje de saludo guardado');
        },
        error: (err) => {
          this.isSavingGreeting.set(false);
          this.toast.error(err?.message ?? 'No se pudo guardar el saludo');
        },
      });
  }

  savePersonal(items: CannedReply[]): void {
    if (this.isSavingPersonal()) return;
    const previous = [...(this.profile()?.cannedReplies ?? [])];
    this.isSavingPersonal.set(true);
    this.profileService
      .updateCannedReplies(this.normalize(items))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.profile.update((p) =>
            p ? { ...p, cannedReplies: res.cannedReplies } : p,
          );
          this.personalDraft.set([...(res.cannedReplies ?? [])]);
          this.isSavingPersonal.set(false);
          this.toast.success('Cambios guardados');
        },
        error: (err) => {
          this.personalDraft.set(previous);
          this.isSavingPersonal.set(false);
          this.toast.error(err?.message ?? 'No se pudieron guardar tus frases');
        },
      });
  }

  saveTeam(items: CannedReply[]): void {
    if (!this.isAdmin() || this.isSavingTeam()) return;
    const previous = [...this.teamSaved()];
    this.isSavingTeam.set(true);
    this.profileService
      .updateTeamCannedReplies(this.normalize(items))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.teamSaved.set(saved);
          this.teamDraft.set([...saved]);
          this.isSavingTeam.set(false);
          this.toast.success('Cambios guardados');
        },
        error: (err) => {
          this.teamDraft.set(previous);
          this.isSavingTeam.set(false);
          this.toast.error(err?.message ?? 'No se pudieron guardar las frases del equipo');
        },
      });
  }

  private normalize(items: CannedReply[]): CannedReply[] {
    return items
      .map((item) => ({
        ...item,
        title: item.title.trim(),
        body: item.body.trim(),
      }))
      .filter((item) => item.title && item.body);
  }
}
