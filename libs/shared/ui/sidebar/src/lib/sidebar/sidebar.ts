import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  effect,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { SidebarItem, SidebarConfig } from './sidebar.types';
import { Button } from '@guiders-frontend/button';
import { IconComponent } from '@guiders-frontend/icon';
import { Badge } from '@guiders-frontend/badge';
import { UserMenu } from '@guiders-frontend/user-menu';
import {
  ThemeService,
  THEME_OPTIONS,
  type NamedTheme,
} from '@guiders-frontend/shared/data-access/theme';

@Component({
  selector: 'guiders-sidebar',
  imports: [CommonModule, Button, IconComponent, Badge, UserMenu],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly router = inject(Router);

  /** URL actual sin query/fragment — reacciona a cada navegación */
  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0].split('#')[0]),
      startWith(this.router.url.split('?')[0].split('#')[0])
    ),
    { initialValue: this.router.url.split('?')[0].split('#')[0] }
  );
  private readonly themeService = inject(ThemeService);

  // Logo y branding configurables via inputs (con valores por defecto)
  readonly logoUrl = input<string | null>(null);
  readonly brandName = input<string>('Guiders');

  // Inputs usando signals API
  readonly items = input.required<SidebarItem[]>();
  readonly config = input<SidebarConfig>({
    collapsed: false,
    showToggle: true,
    theme: 'dark',
    width: '280px',
    collapsedWidth: '64px',
  });

  // Nuevos inputs para el user menu
  readonly userEmail = input<string | null>(null);
  readonly userName = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);

  // App version display
  readonly appVersion = input<string | null>(null);

  // App Switcher inputs
  readonly showAppSwitcher = input<boolean>(false);
  readonly appSwitcherLabel = input<string>('');
  readonly appSwitcherUrl = input<string>('');

  // Tour input
  readonly showTourButton = input<boolean>(false);

  // Outputs usando signals API
  readonly itemClick = output<SidebarItem>();
  readonly toggleSidebar = output<boolean>();
  readonly userLogout = output<void>();
  readonly userConfigureAccount = output<void>();
  readonly appSwitch = output<void>();
  readonly themeChange = output<'light' | 'dark'>();
  readonly userStartTour = output<string>();

  // Estado interno con signals
  readonly isCollapsed = signal(false);
  /** Controls the theme picker dropdown in the sidebar footer */
  readonly isThemePickerOpen = signal(false);
  /** Controls the help menu dropdown in the sidebar footer */
  readonly isHelpOpen = signal(false);
  /** Position of the help dropdown (fixed, calculated from button rect) */
  readonly helpDropdownPos = signal<{ bottom: number; left: number } | null>(null);

  @ViewChild('helpBtn') helpBtnRef?: ElementRef<HTMLButtonElement>;
  // Use ThemeService signal directly for reactivity
  readonly currentTheme = this.themeService.theme;
  readonly currentThemeOption = this.themeService.currentThemeOption;
  /** Exposed to the template for rendering theme swatches */
  readonly themeOptions = THEME_OPTIONS;
  readonly darkThemeOptions = THEME_OPTIONS.filter((t) => t.group === 'dark');
  readonly lightThemeOptions = THEME_OPTIONS.filter((t) => t.group === 'light');
  readonly companyThemeOptions = THEME_OPTIONS.filter(
    (t) => t.group === 'company'
  );
  private readonly expandedItems = signal<Set<string>>(new Set());
  private readonly popoverItem = signal<SidebarItem | null>(null);
  private elementPositions = new Map<string, DOMRect>();
  private currentPopoverItem: SidebarItem | null = null;

  // Computed values
  readonly sidebarWidth = computed(() =>
    this.isCollapsed() ? this.config().collapsedWidth : this.config().width
  );

  readonly sidebarClasses = computed(() => ({
    sidebar: true,
    'sidebar--collapsed': this.isCollapsed(),
    // All named themes are dark variants; keep legacy classes for SCSS compatibility
    'sidebar--dark': true,
    'sidebar--light': false,
  }));

  readonly isDarkTheme = computed(() => true); // All named themes are dark

  constructor() {
    // Respetar el collapsed inicial del config (p. ej. cerrado por defecto en console)
    let collapsedSynced = false;
    effect(() => {
      const collapsed = this.config().collapsed;
      if (!collapsedSynced) {
        this.isCollapsed.set(collapsed);
        collapsedSynced = true;
      }
    });

    // Effect para expandir automáticamente elementos padre cuando sus hijos están activos
    // SOLO se ejecuta en la inicialización, no interfiere con expansiones manuales
    let isInitialized = false;

    effect(() => {
      const items = this.items();

      // Solo auto-expandir en la primera carga o cuando cambian los items
      if (!isInitialized) {
        const expanded = new Set(this.expandedItems());

        items.forEach((item) => {
          if (item.children && item.children.length > 0) {
            const hasActiveChild = item.children.some((child) =>
              this.isItemActive(child)
            );
            if (hasActiveChild) {
              expanded.add(item.id);
            }
          }
        });

        this.expandedItems.set(expanded);
        isInitialized = true;
        console.log('Auto-expansión inicial completada:', Array.from(expanded));
      }
    });
  }

  // Toggle tema — cycles through named themes; emits 'dark' for backwards compatibility
  onToggleTheme(): void {
    this.themeService.cycleTheme();
    this.themeChange.emit('dark'); // all themes are dark variants
  }

  toggleThemePicker(): void {
    this.isThemePickerOpen.update((v) => !v);
  }

  selectTheme(themeId: NamedTheme): void {
    this.themeService.setTheme(themeId);
    this.isThemePickerOpen.set(false);
    this.themeChange.emit('dark');
  }

  closeThemePicker(): void {
    this.isThemePickerOpen.set(false);
  }

  toggleHelpMenu(): void {
    if (!this.isHelpOpen()) {
      const rect = this.helpBtnRef?.nativeElement.getBoundingClientRect();
      if (rect) {
        this.helpDropdownPos.set({
          bottom: window.innerHeight - rect.top + 6,
          left: rect.left,
        });
      }
    }
    this.isHelpOpen.update((v) => !v);
  }

  closeHelpMenu(): void {
    this.isHelpOpen.set(false);
  }

  // Métodos
  onItemClick(item: SidebarItem): void {
    console.log(`Click en item: ${item.label}`, {
      isCollapsed: this.isCollapsed(),
      hasChildren: item.children && item.children.length > 0,
      hasRoute: !!item.route,
      isExpanded: this.isItemExpanded(item.id),
      isActive: this.isItemActive(item),
    });

    this.itemClick.emit(item);

    // Si el sidebar está colapsado y el item tiene hijos, mostrar popover
    if (this.isCollapsed() && item.children && item.children.length > 0) {
      console.log(`Mostrando popover para: ${item.label}`);
      this.currentPopoverItem = item;
      // Capturar posición precisa al momento del clic
      this.captureElementPosition(item);
      this.togglePopover(item);
      return;
    }

    // Si el sidebar no está colapsado, manejar expansión/navegación
    if (item.children && item.children.length > 0) {
      // Si tiene hijos, expandir/contraer SIEMPRE
      console.log(`Toggling expansión para: ${item.label}`);
      this.toggleItemExpansion(item.id);
    } else if (item.route) {
      // Si tiene ruta, navegar
      console.log(`Navegando a: ${item.route}`);
      this.navigateToRoute(item.route);
      this.closePopover(); // Cerrar popover si está abierto
    } else {
      console.log(`Item sin ruta: ${item.label}`);
      this.closePopover(); // Cerrar popover si está abierto
    }
  }

  private captureElementPosition(item: SidebarItem): void {
    setTimeout(() => {
      // Buscar el elemento específico por su posición en la lista
      const itemIndex = this.items().findIndex((i) => i.id === item.id);
      const navItems = document.querySelectorAll('.sidebar__nav-item');

      if (itemIndex >= 0 && navItems[itemIndex]) {
        const navItem = navItems[itemIndex];
        const button = navItem.querySelector('.sidebar__nav-link');

        if (button) {
          const rect = button.getBoundingClientRect();
          this.elementPositions.set(item.id, rect);
          console.log(`Posición capturada para ${item.label}:`, {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            height: rect.height,
          });
        }
      }
    }, 10); // Pequeño delay para asegurar que el DOM esté actualizado
  }

  toggleItemExpansion(itemId: string): void {
    const expanded = this.expandedItems();
    const newExpanded = new Set(expanded);

    const wasExpanded = newExpanded.has(itemId);
    if (wasExpanded) {
      newExpanded.delete(itemId);
      console.log(`Colapsando item: ${itemId}`);
    } else {
      newExpanded.add(itemId);
      console.log(`Expandiendo item: ${itemId}`);
    }

    console.log(`Estado expansión antes:`, Array.from(expanded));
    console.log(`Estado expansión después:`, Array.from(newExpanded));
    this.expandedItems.set(newExpanded);
  }

  isItemExpanded(itemId: string): boolean {
    return this.expandedItems().has(itemId);
  }

  togglePopover(item: SidebarItem): void {
    const currentPopover = this.popoverItem();
    if (currentPopover && currentPopover.id === item.id) {
      // Si el mismo item está abierto, cerrarlo
      this.closePopover();
    } else {
      // Abrir popover para este item
      this.popoverItem.set(item);
    }
  }

  closePopover(): void {
    this.popoverItem.set(null);
    this.currentPopoverItem = null;
    // Limpiar posiciones capturadas después de un tiempo para evitar acumulación
    setTimeout(() => {
      this.elementPositions.clear();
    }, 1000);
  }

  handlePopoverKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closePopover();
    }
  }

  onPopoverItemClick(item: SidebarItem, event?: Event): void {
    console.log(`Click en subelemento: ${item.label}`);

    // Prevenir propagación del evento
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    // Cerrar el popover inmediatamente
    this.closePopover();

    // Ejecutar la lógica del item con un pequeño delay para asegurar que el popover se cierre
    setTimeout(() => {
      this.itemClick.emit(item);

      if (item.route) {
        console.log(`Navegando a: ${item.route}`);
        this.navigateToRoute(item.route);
      } else {
        console.log(`Item sin ruta: ${item.label}`);
      }
    }, 10);
  }

  private navigateToRoute(route: string): void {
    // Parsear la ruta para separar path y query parameters
    const [path, queryString] = route.split('?');

    if (queryString) {
      // Parsear query parameters
      const queryParams: { [key: string]: string } = {};
      queryString.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      });

      console.log('Navegando con queryParams:', { path, queryParams });
      this.router.navigate([path], { queryParams });
    } else {
      console.log('Navegando sin queryParams:', path);
      this.router.navigate([path]);
    }
  }

  isPopoverOpen(item: SidebarItem): boolean {
    const currentPopover = this.popoverItem();
    return currentPopover !== null && currentPopover.id === item.id;
  }

  onToggleSidebar(): void {
    const newCollapsedState = !this.isCollapsed();
    this.isCollapsed.set(newCollapsedState);
    this.toggleSidebar.emit(newCollapsedState);
  }

  isItemActive(item: SidebarItem): boolean {
    if (item.isActive) {
      return true;
    }

    if (item.route) {
      const path = this.currentPath();
      const route = item.route.startsWith('/') ? item.route : `/${item.route}`;
      if (path === route || path.startsWith(`${route}/`)) {
        return true;
      }
    }

    // Si tiene hijos, verificar si alguno de sus hijos está activo
    if (item.children && item.children.length > 0) {
      return item.children.some((child) => this.isItemActive(child));
    }

    return false;
  }

  getItemAriaLabel(item: SidebarItem): string {
    let label = item.label;

    if (item.badge) {
      label += ` (${item.badge.text})`;
    }

    if (item.children && item.children.length > 0) {
      const expandedState = this.isItemExpanded(item.id)
        ? 'expandido'
        : 'contraído';
      label += ` - Submenu ${expandedState}`;
    }

    if (this.isItemActive(item)) {
      label += ' - Página actual';
    }

    return label;
  }

  getPopoverPosition(item: SidebarItem): { top: number } {
    try {
      // Intentar usar la posición capturada del elemento
      const capturedRect = this.elementPositions.get(item.id);
      if (capturedRect) {
        const position = capturedRect.top; // Alinear con el top del elemento
        console.log(`Usando posición capturada para ${item.label}:`, position);
        return { top: position };
      }

      // Fallback: buscar el elemento en tiempo real
      const itemElements = document.querySelectorAll('.sidebar__nav-item');
      const itemIndex = this.items().findIndex((i) => i.id === item.id);

      if (itemIndex >= 0 && itemElements[itemIndex]) {
        const button =
          itemElements[itemIndex].querySelector('.sidebar__nav-link');
        if (button) {
          const rect = button.getBoundingClientRect();
          const position = rect.top; // Alinear con el top del elemento
          console.log(
            `Posición calculada en tiempo real para ${item.label}:`,
            position
          );
          return { top: position };
        }
      }

      // Último fallback: cálculo matemático
      const headerHeight = 88; // Header + padding
      const itemHeight = 52; // Altura estimada por item
      const calculatedTop = headerHeight + itemIndex * itemHeight;

      console.log(
        `Usando cálculo matemático para ${item.label}:`,
        calculatedTop
      );
      return { top: calculatedTop };
    } catch (error) {
      console.error('Error calculating popover position:', error);
      return { top: 120 };
    }
  }

  onUserLogout(): void {
    this.userLogout.emit();
  }

  onUserConfigureAccount(): void {
    this.userConfigureAccount.emit();
  }

  onAppSwitch(): void {
    this.appSwitch.emit();
  }

  onUserStartTour(tourId: string): void {
    this.userStartTour.emit(tourId);
  }
}
