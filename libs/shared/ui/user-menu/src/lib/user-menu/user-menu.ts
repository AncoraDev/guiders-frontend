import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
  effect,
  inject,
} from '@angular/core';
import { getAvatarColor } from '@guiders-frontend/avatar-colors';
import { CommercialStatusService } from '@guiders-frontend/commercial-status';
import { ThemeService } from '@guiders-frontend/shared/data-access/theme';

@Component({
  selector: 'guiders-user-menu',
  imports: [],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenu {
  private readonly themeService = inject(ThemeService);
  readonly statusService = inject(CommercialStatusService);

  // Use ThemeService signal directly for reactivity
  readonly currentTheme = this.themeService.theme;

  // Inputs
  userEmail = input.required<string>();
  userName = input<string | null>(null);
  avatarUrl = input<string | null>(null);
  compact = input<boolean>(false); // Modo compacto para sidebar colapsado

  // App Switcher inputs
  showAppSwitcher = input<boolean>(false);
  appSwitcherLabel = input<string>('');
  appSwitcherUrl = input<string>('');

  // Outputs
  logout = output<void>();
  configureAccount = output<void>();
  switchApp = output<void>();

  // Estado local
  isDropdownOpen = signal(false);
  dropdownPosition = signal<{ bottom: number; left: number } | null>(null);

  // ViewChild para obtener la referencia del elemento
  private readonly menuElement =
    viewChild<ElementRef<HTMLDivElement>>('menuElement');

  constructor() {
    // Effect para calcular la posición cuando se abre el dropdown
    effect(() => {
      if (this.isDropdownOpen()) {
        this.calculateDropdownPosition();
      }
    });
  }

  toggleDropdown(): void {
    this.isDropdownOpen.update((value) => !value);
  }

  closeDropdown(): void {
    this.isDropdownOpen.set(false);
  }

  private calculateDropdownPosition(): void {
    const element = this.menuElement()?.nativeElement;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const padding = 10; // Espaciado desde el botón
    const marginLeft = 8; // Margen desde el borde izquierdo

    // Calcular posición
    const bottom = window.innerHeight - rect.top + padding;

    // Siempre alinear con el borde del contenedor padre + margen
    const parent = element.parentElement;
    let left = rect.left;

    if (parent) {
      const parentRect = parent.getBoundingClientRect();
      // Usar el borde izquierdo del padre (footer) + margen
      left = parentRect.left + marginLeft;
    }

    this.dropdownPosition.set({ bottom, left });
  }

  onLogout(): void {
    this.closeDropdown();
    // El padre (console/admin) ejecuta el logout BFF vía (userLogout)
    this.logout.emit();
  }

  onConfigureAccount(): void {
    this.closeDropdown();
    this.configureAccount.emit();
  }

  onSwitchApp(): void {
    this.closeDropdown();
    this.switchApp.emit();
    const url = this.appSwitcherUrl();
    if (url) {
      window.location.href = url;
    }
  }

  // Obtener las iniciales del usuario para el avatar
  getUserInitials(): string {
    const name = this.userName();
    if (name) {
      return name
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    }

    const email = this.userEmail();
    return email ? email.charAt(0).toUpperCase() : 'U';
  }

  // Obtener el color de fondo basado en las iniciales
  getAvatarBackgroundColor(): string {
    const initials = this.getUserInitials();
    return getAvatarColor(initials);
  }
}
