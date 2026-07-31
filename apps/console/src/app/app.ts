import { Component, signal, inject, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Sidebar, SidebarItem, SidebarConfig } from '@guiders-frontend/sidebar';
import { UserService, ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { ProfileService } from '@guiders-frontend/profile-service';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';
import { ChatWidgetComponent } from '@guiders-frontend/chat/ui/chat-widget';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { ToastHostComponent } from '@guiders-frontend/shared/ui/toast';
import { TransferNotificationService } from './transfer-notification.service';

@Component({
  imports: [RouterModule, Sidebar, ChatWidgetComponent, ToastHostComponent],
  selector: 'console-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly userService = inject(UserService);
  private readonly presenceService = inject(CommercialPresenceService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transferNotifications = inject(TransferNotificationService);

  protected title = 'console';

  // App version from build-time injection, with safe fallback
  readonly appVersion: string = this.environment.version ?? '';

  // Usuario actual desde el servicio
  readonly currentUser = this.userService.currentUser;
  readonly userName = signal<string | null>(null);
  readonly avatarUrl = signal<string | null>(null);

  constructor() {
    // Toast global de transferencias (cualquier ruta de Console)
    this.transferNotifications.start();

    this.profileService
      .getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.userName.set(profile.name || null);
          this.avatarUrl.set(profile.avatarUrl || null);
        },
        error: (err) => {
          console.warn('[Console] No se pudo cargar el perfil para el avatar', err);
        },
      });
  }

  readonly isAdmin = computed(() =>
    this.currentUser()?.roles?.includes('admin') ?? false
  );

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
      },
      {
        id: 'conexiones',
        label: 'Conexiones',
        icon: 'wifi',
        route: '/conexiones',
      },
      ...(this.isAdmin()
        ? [
            {
              id: 'usuarios',
              label: 'Usuarios',
              icon: 'user' as const,
              route: '/usuarios',
            },
          ]
        : []),
    ];
  });

  onSidebarItemClick(item: SidebarItem): void {
    console.log('Console sidebar item clicked:', item);
  }

  onSidebarToggle(collapsed: boolean): void {
    this.sidebarConfig.update(config => ({
      ...config,
      collapsed
    }));
  }

  onLogout(): void {
    // Desconectar presencia antes del redirect BFF (fire-and-forget con timeout).
    const disconnect$ = firstValueFrom(
      this.presenceService.disconnect({ reason: 'logout' })
    );
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 800));
    void Promise.race([disconnect$.then(() => undefined), timeout]).finally(
      () => {
        this.userService.logout();
      }
    );
  }

  onConfigureAccount(): void {
    this.router.navigate(['/settings/profile']);
  }
}
