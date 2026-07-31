import { Component, signal, inject, computed, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Sidebar, SidebarItem, SidebarConfig } from '@guiders-frontend/sidebar';
import {
  UserService,
  ENVIRONMENT_TOKEN,
} from '@guiders-frontend/auth/data-access/session';
import { RedirectConfirm } from '@guiders-frontend/redirect-confirm';
import { TourService } from '@guiders-frontend/shared/util/tour';
import { EmbedModeService } from '@guiders-frontend/embed';

@Component({
  imports: [RouterModule, Sidebar, RedirectConfirm],
  selector: 'admin-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly tourService = inject(TourService);
  private readonly embedMode = inject(EmbedModeService);

  protected title = 'admin';

  readonly currentUser = this.userService.currentUser;
  readonly appVersion: string = this.environment.version ?? '';

  /** Story 3.2: embed mode detection (iframe OR ?embed=true). */
  readonly isEmbedMode = (): boolean => this.embedMode.isEmbed();

  private _tourStartedForUser: string | null = null;

  constructor() {
    // Auto-start tour on first login.
    // The TourService itself tracks which (tourId, userId) pairs have already
    // been started in this session, so re-emissions of currentUser (e.g. due
    // to authGuard re-calling ensureSession$ on every navigation) are harmless.
    effect(() => {
      const user = this.currentUser();
      if (!user?.sub) return;
      if (this.tourService.isRunning) return;
      if (this.tourService.hasStartedFor('admin', user.sub)) return;
      if (this.tourService.isCompleted('admin', user.sub)) return;

      this._tourStartedForUser = user.sub;
      this.tourService.startTour('admin', user.sub);
    });
  }

  // App Switcher - solo visible para admins
  readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes('admin') ?? false
  );
  readonly consoleUrl = this.environment.consoleUrl ?? '';

  readonly sidebarConfig = signal<SidebarConfig>({
    collapsed: false,
    showToggle: true,
    theme: 'dark',
    width: '280px',
    collapsedWidth: '64px',
  });

  readonly sidebarItems = signal<SidebarItem[]>([
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'bar-chart',
      route: '/dashboard',
    },
    {
      id: 'users',
      label: 'Usuarios',
      icon: 'users',
      route: '/users',
    },
    {
      id: 'integrations',
      label: 'Integraciones',
      icon: 'lock',
      route: '/integrations',
      children: [
        {
          id: 'api-keys',
          label: 'API Keys',
          icon: 'lock',
          route: '/integrations/api-keys',
        },
        {
          id: 'sites',
          label: 'Sitios',
          icon: 'globe',
          route: '/integrations/sites',
        },
        {
          id: 'lead-cars',
          label: 'Lead Cars',
          icon: 'leadcars',
          route: '/integrations/leadcars',
        },
      ],
    },
    {
      id: 'leads',
      label: 'Leads',
      icon: 'users',
      route: '/leads',
      children: [
        {
          id: 'leads-list',
          label: 'Lista de Leads',
          icon: 'users',
          route: '/leads/list',
        },
        {
          id: 'sync-records',
          label: 'Sincronizaciones',
          icon: 'activity',
          route: '/leads/sync-records',
        },
      ],
    },
    {
      id: 'branding',
      label: 'Marca Blanca',
      icon: 'layers',
      route: '/branding',
    },
  ]);

  onSidebarItemClick(item: SidebarItem): void {
    console.log('Admin sidebar item clicked:', item);
  }

  onRestartTour(): void {
    const user = this.currentUser();
    if (user?.sub) {
      this._tourStartedForUser = null;
      this.tourService.resetTour('admin', user.sub);
      this.tourService.startTour('admin', user.sub);
    }
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
