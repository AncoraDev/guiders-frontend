import { Component, input, output, computed } from '@angular/core';
import { VisitorSearchFilters } from '@guiders-frontend/shared/types';

export interface ActiveFilterChip {
  key: string;
  label: string;
  value: string;
}

@Component({
  selector: 'guiders-visitors-active-filters',
  imports: [],
  templateUrl: './visitors-active-filters.html',
  styleUrl: './visitors-active-filters.scss',
})
export class VisitorsActiveFilters {
  /** Filtros activos */
  filters = input.required<VisitorSearchFilters>();

  /** Si false, oculta el botón (p. ej. cuando el padre lo coloca en la toolbar) */
  showAdvancedButton = input(true);

  /** Emite cuando se elimina un filtro específico */
  removeFilter = output<string>();

  /** Emite cuando se eliminan todos los filtros */
  clearAll = output<void>();

  /** Emite cuando se quiere abrir el panel de filtros avanzados */
  openAdvanced = output<void>();

  /** Convierte los filtros en chips para mostrar */
  filterChips = computed<ActiveFilterChip[]>(() => {
    const filters = this.filters();
    const chips: ActiveFilterChip[] = [];

    if (filters.lifecycle?.length) {
      chips.push({
        key: 'lifecycle',
        label: 'Ciclo de vida',
        value: filters.lifecycle.join(', ')
      });
    }

    if (filters.connectionStatus?.length) {
      chips.push({
        key: 'connectionStatus',
        label: 'Estado',
        value: this.formatConnectionStatus(filters.connectionStatus)
      });
    }

    if (filters.hasAcceptedPrivacyPolicy !== undefined) {
      chips.push({
        key: 'hasAcceptedPrivacyPolicy',
        label: 'Privacidad',
        value: filters.hasAcceptedPrivacyPolicy ? 'Aceptada' : 'No aceptada'
      });
    }

    if (filters.hasPendingChats !== undefined) {
      chips.push({
        key: 'hasPendingChats',
        label: 'Chats pendientes',
        value: filters.hasPendingChats ? 'Con pendientes' : 'Sin pendientes'
      });
    }

    if (filters.createdFrom || filters.createdTo) {
      chips.push({
        key: 'created',
        label: 'Creación',
        value: this.formatDateRange(filters.createdFrom, filters.createdTo)
      });
    }

    if (filters.lastActivityFrom || filters.lastActivityTo) {
      chips.push({
        key: 'lastActivity',
        label: 'Última actividad',
        value: this.formatDateRange(filters.lastActivityFrom, filters.lastActivityTo)
      });
    }

    if (filters.siteIds?.length) {
      chips.push({
        key: 'siteIds',
        label: 'Sitios',
        value: `${filters.siteIds.length} seleccionado(s)`
      });
    }

    if (filters.currentUrlContains) {
      chips.push({
        key: 'currentUrlContains',
        label: 'URL contiene',
        value: filters.currentUrlContains
      });
    }

    if (filters.ipAddress) {
      chips.push({
        key: 'ipAddress',
        label: 'Dirección IP',
        value: filters.ipAddress
      });
    }

    if (filters.hasActiveSessions !== undefined) {
      chips.push({
        key: 'hasActiveSessions',
        label: 'Sesiones activas',
        value: filters.hasActiveSessions ? 'Sí' : 'No'
      });
    }

    if (filters.isInternal !== undefined) {
      chips.push({
        key: 'isInternal',
        label: 'Visitantes internos',
        value: filters.isInternal ? 'Solo internos' : 'Solo externos'
      });
    }

    if (filters.minTotalSessionsCount !== undefined) {
      chips.push({
        key: 'minTotalSessionsCount',
        label: 'Sesiones',
        value: `≥ ${filters.minTotalSessionsCount}`
      });
    }

    if (filters.maxTotalSessionsCount !== undefined) {
      chips.push({
        key: 'maxTotalSessionsCount',
        label: 'Sesiones',
        value: `≤ ${filters.maxTotalSessionsCount}`
      });
    }

    return chips;
  });

  hasFilters = computed(() => this.filterChips().length > 0);

  onRemoveFilter(key: string): void {
    this.removeFilter.emit(key);
  }

  onClearAll(): void {
    this.clearAll.emit();
  }

  onOpenAdvanced(): void {
    this.openAdvanced.emit();
  }

  private formatConnectionStatus(statuses: string[]): string {
    const labels: Record<string, string> = {
      'online': 'En línea',
      'away': 'Ausente',
      'chatting': 'Chateando',
      'offline': 'Desconectado'
    };
    return statuses.map(s => labels[s] || s).join(', ');
  }

  private formatDateRange(from?: string, to?: string): string {
    if (from && to) {
      return `${this.formatDate(from)} - ${this.formatDate(to)}`;
    }
    if (from) {
      return `Desde ${this.formatDate(from)}`;
    }
    if (to) {
      return `Hasta ${this.formatDate(to)}`;
    }
    return '';
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }
}
