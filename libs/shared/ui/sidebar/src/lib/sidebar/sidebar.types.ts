import { IconName } from '@guiders-frontend/icon';
import { BadgeVariant } from '@guiders-frontend/badge';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: IconName; // Ahora usa iconos tipados del sistema
  route?: string;
  children?: SidebarItem[];
  isActive?: boolean;
  isExpanded?: boolean;
  permission?: string;
  badge?: {
    text: string;
    variant?: BadgeVariant;
  };
}

export interface SidebarConfig {
  collapsed: boolean;
  showToggle: boolean;
  theme: 'light' | 'dark';
  width: string;
  collapsedWidth: string;
  ariaLabel?: string; // Para accesibilidad
  density?: 'comfortable' | 'compact'; // Soporte para densidades según guía B2B
  /** Cerrar al clic fuera del menú (escritorio). En overlay se cierra siempre. */
  collapseOnOutsideClick?: boolean;
}