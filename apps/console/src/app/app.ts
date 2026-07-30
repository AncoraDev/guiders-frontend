import { Component, signal, inject, computed, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Sidebar, SidebarItem, SidebarConfig } from '@guiders-frontend/sidebar';
import { UserService, ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { ChatWidgetComponent } from '@guiders-frontend/chat/ui/chat-widget';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { EscalationService } from '@guiders-frontend/escalation-service';
import { TourService } from '@guiders-frontend/shared/util/tour';
import { TourId } from '@guiders-frontend/shared/util/tour';

@Component({
  imports: [RouterModule, Sidebar, ChatWidgetComponent],
  selector: 'console-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly escalationService = inject(EscalationService);
  private readonly tourService = inject(TourService);

  protected title = 'console';

  // App version from build-time injection, with safe fallback
  readonly appVersion: string = this.environment.version ?? '';

  // Usuario actual desde el servicio
  readonly currentUser = this.userService.currentUser;

  constructor() {
    // Auto-start tour on first login.
    effect(() => {
      const user = this.currentUser();
      if (!user?.sub) return;
      if (this.tourService.isRunning) return;
      if (this.tourService.hasStartedFor('console', user.sub)) return;
      if (this.tourService.isCompleted('console', user.sub)) return;

      this.tourService.startTour('console', user.sub);
    });
  }

  // App Switcher - solo visible para admins
  readonly isAdmin = computed(() =>
    this.currentUser()?.roles?.includes('admin') ?? false
  );
  readonly adminUrl = this.environment.adminUrl ?? '';

  // Configuración del sidebar para console
  readonly sidebarConfig = signal<SidebarConfig>({
    collapsed: true,
    showToggle: true,
    theme: 'dark',
    width: '280px',
    collapsedWidth: '64px'
  });

  // Items de navegación específicos para console (usuario final)
  readonly sidebarItems = computed<SidebarItem[]>(() => {
    const totalUnread = this.unreadMessagesService.totalUnreadCount();
    const escalationCount = this.escalationService.escalationCount();

    return [
      {
        id: 'atencion',
        label: 'Atención',
        icon: 'message-circle',
        route: '/atencion',
        ...(totalUnread > 0 && {
          badge: {
            text: totalUnread > 99 ? '99+' : totalUnread.toString(),
            variant: 'danger' as const
          }
        })
      },
      {
        id: 'visitors',
        label: 'Visitantes',
        icon: 'users',
        route: '/visitors',
        badge: {
          text: 'Borrador',
          variant: 'warning' as const,
        },
      },
      {
        id: 'escalations',
        label: 'Escalaciones',
        icon: 'alert-triangle',
        route: '/escalations',
        ...(escalationCount > 0 && {
          badge: {
            text: escalationCount.toString(),
            variant: 'danger' as const
          }
        })
      },
    ];
  });

  onSidebarItemClick(item: SidebarItem): void {
    console.log('Console sidebar item clicked:', item);
  }

  onStartTour(tourId: string): void {
    const user = this.currentUser();
    if (!user?.sub) return;
    this.tourService.restartTour(tourId as TourId, user.sub);
  }

  onSidebarToggle(collapsed: boolean): void {
    this.sidebarConfig.update(config => ({
      ...config,
      collapsed
    }));
  }

  onLogout(): void {
    console.log('Cerrando sesión...');
    this.userService.clearUser();
    this.router.navigate(['/login']);
  }

  onConfigureAccount(): void {
    this.router.navigate(['/settings/profile']);
  }
}
