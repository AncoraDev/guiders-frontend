import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ToastHostComponent } from '@guiders-frontend/shared/ui/toast';
import { SETTINGS_CLOSE_ROUTE, UserService } from '@guiders-frontend/auth/data-access/session';

export { SETTINGS_CLOSE_ROUTE };

interface SettingsNavGroup {
  readonly label: string;
  readonly items: readonly SettingsNavItem[];
}

interface SettingsNavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
}

@Component({
  selector: 'lib-settings-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-layout.html',
  styleUrl: './settings-layout.scss',
})
export class SettingsLayoutComponent {
  private readonly router = inject(Router);
  private readonly closeRoute = inject(SETTINGS_CLOSE_ROUTE);
  private readonly userService = inject(UserService);

  readonly navGroups = computed<readonly SettingsNavGroup[]>(() => {
    const workspaceItems: SettingsNavItem[] = [
      { id: 'appearance', label: 'Apariencia', route: 'appearance' },
      { id: 'replies', label: 'Frases rápidas', route: 'replies' },
    ];
    if (this.userService.hasRole('admin')) {
      workspaceItems.push({
        id: 'contact-form',
        label: 'Formulario de contacto',
        route: 'contact-form',
      });
    }
    return [
      {
        label: 'Cuenta',
        items: [
          { id: 'profile', label: 'Perfil', route: 'profile' },
          { id: 'notifications', label: 'Notificaciones', route: 'notifications' },
        ],
      },
      {
        label: 'Espacio de trabajo',
        items: workspaceItems,
      },
      {
        label: 'Seguridad',
        items: [{ id: 'privacy', label: 'Privacidad', route: 'privacy' }],
      },
    ];
  });

  onNavClose(): void {
    this.router.navigate([this.closeRoute]);
  }
}

