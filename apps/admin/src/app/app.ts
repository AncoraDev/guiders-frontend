import { Component, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { Sidebar, SidebarItem, SidebarConfig } from '@guiders-frontend/sidebar';
import {
  UserService,
  ENVIRONMENT_TOKEN,
} from '@guiders-frontend/auth/data-access/session';
import { ProfileService } from '@guiders-frontend/profile-service';
import { RedirectConfirm } from '@guiders-frontend/redirect-confirm';
import { EmbedModeService } from '@guiders-frontend/embed';

@Component({
  imports: [RouterModule, Sidebar, RedirectConfirm],
  selector: 'admin-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly userService = inject(UserService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly embedMode = inject(EmbedModeService);
  private readonly destroyRef = inject(DestroyRef);

  protected title = 'admin';

  readonly currentUser = this.userService.currentUser;
  readonly userName = signal<string | null>(null);
  readonly avatarUrl = signal<string | null>(null);
  readonly appVersion: string = this.environment.version ?? '';

  constructor() {
    this.profileService
      .getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.userName.set(profile.name || null);
          this.avatarUrl.set(profile.avatarUrl || null);
        },
        error: (err) => {
          console.warn('[Admin] No se pudo cargar el perfil para el avatar', err);
        },
      });
  }

  /** Story 3.2: embed mode detection (iframe OR ?embed=true). */
  readonly isEmbedMode = (): boolean => this.embedMode.isEmbed();

  readonly sidebarConfig = signal<SidebarConfig>({
    collapsed: false,
    showToggle: true,
    theme: 'dark',
    width: '280px',
    collapsedWidth: '64px',
  });

  readonly sidebarItems = signal<SidebarItem[]>([
    {
      id: 'clients',
      label: 'Clientes',
      icon: 'building',
      route: '/clients',
    },
    {
      id: 'users',
      label: 'Usuarios',
      icon: 'users',
      route: '/users',
    },
  ]);

  onSidebarItemClick(item: SidebarItem): void {
    console.log('Admin sidebar item clicked:', item);
  }

  onSidebarToggle(collapsed: boolean): void {
    this.sidebarConfig.update((config) => ({
      ...config,
      collapsed,
    }));
  }

  onLogout(): void {
    // Logout real via BFF (limpia cookies + SSO). No navegar a /login en SPA:
    // eso dejaba las cookies intactas y la sesión seguía activa.
    this.userService.logout();
  }

  onConfigureAccount(): void {
    this.router.navigate(['/settings/profile']);
  }
}
