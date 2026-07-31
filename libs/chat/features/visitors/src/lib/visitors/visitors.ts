import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  untracked,
  ElementRef,
  ViewChild,
  DestroyRef,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  catchError,
  finalize,
  of,
  Subject,
  switchMap,
  takeUntil,
  interval,
} from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { USE_MOCK_DATA } from '@guiders-frontend/shared/config';
import { ChatWidgetService } from '@guiders-frontend/chat/data-access/chat-widget-service';
import { PresenceService } from '@guiders-frontend/presence-service';
import { ChatService } from '@guiders-frontend/chat-service';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
// Importar componentes UI y servicios
import { VisitorsListComponent } from '@guiders-frontend/visitors-list';
import { VisitorsDataService } from '@guiders-frontend/visitors-data-service';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { VisitorsQuickFilters } from '@guiders-frontend/visitors-quick-filters';
import { VisitorsActiveFilters } from '@guiders-frontend/visitors-active-filters';
import { VisitorsAdvancedFilters } from '@guiders-frontend/visitors-advanced-filters';
import {
  SaveFilterDialog,
  SaveFilterData,
} from '@guiders-frontend/save-filter-dialog';
import {
  Visitor,
  VisitorFilters,
  VisitorSort,
  CreateChatWithVisitorRequest,
  VisitorState,
  VisitorStats,
  ConnectionStatus,
  QuickFilter,
  SavedFilter,
  VisitorSearchFilters,
  VisitorSearchSort,
  VisitorSearchResult,
  VisitorSearchRequest,
  VisitorSortField,
  SortDirection,
  Chat,
} from '@guiders-frontend/shared/types';
import { PresenceChangedEvent } from '@guiders-frontend/shared/types';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import {
  getContactDisplayName,
  getVisitorDisplayName,
} from '@guiders-frontend/visitor-display-name';
import {
  getMockVisitorsResponse,
  getMockVisitorStats,
} from './visitors-mock-data';

// Tipo parcial para respuestas de asignación de chat
// El backend puede devolver distintas formas; declaramos los campos que nos interesan
type AssignChatResponse = {
  success?: boolean;
  assignedAt?: string;
  id?: string;
  status?: string;
  assignedCommercialId?: string;
  [key: string]: unknown;
};

@Component({
  selector: 'lib-visitors',
  standalone: true,
  imports: [
    CommonModule,
    VisitorsListComponent,
    VisitorsQuickFilters,
    VisitorsActiveFilters,
    VisitorsAdvancedFilters,
    SaveFilterDialog,
  ],
  templateUrl: './visitors.html',
  styleUrls: ['./visitors.scss'],
})
export class VisitorsComponent implements OnInit, OnDestroy {
  private readonly visitorsService = inject(VisitorsDataService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly elementRef = inject(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly useMockData = inject(USE_MOCK_DATA);
  private readonly chatWidgetService = inject(ChatWidgetService);
  private readonly presenceService = inject(PresenceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatService = inject(ChatService);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly leadContactService = inject(LeadContactService);
  private readonly destroy$ = new Subject<void>();

  // Referencia al componente hijo de la lista de visitantes
  @ViewChild(VisitorsListComponent)
  visitorsListComponent?: VisitorsListComponent;

  // Variable para guardar la posición del scroll
  private savedScrollPosition = 0;

  // Flag para indicar si debe hacer scroll al top después de cargar
  private shouldScrollToTop = false;

  // Keys para localStorage
  private readonly STORAGE_KEY_PAGE_SIZE = 'visitors_page_size';

  // ID de la empresa resuelto dinámicamente
  readonly companyId = signal<string | null>(null);

  // Flag para indicar cuando se está refrescando (sin loader)
  readonly isRefreshing = signal<boolean>(false);

  // Timestamp de la última carga de datos
  readonly lastRefreshTime = signal<Date | null>(null);

  // Tick cada segundo usando toSignal(interval()) — se gestiona fuera del ciclo
  // principal de change detection, evitando que el timer dispare un CD completo
  // cada segundo (como hacía el setInterval manual anterior).
  private readonly _tick = toSignal(interval(1000), { initialValue: 0 });

  // Computed signal para el tiempo transcurrido desde la última actualización
  readonly timeSinceLastRefresh = computed(() => {
    // Leer el tick para que el computed se recalcule cada segundo
    this._tick();

    const lastRefresh = this.lastRefreshTime();
    if (!lastRefresh) return '';

    const now = new Date();
    const diffMs = now.getTime() - lastRefresh.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffSeconds < 60) {
      return `hace ${diffSeconds} seg`;
    } else if (diffMinutes < 60) {
      return `hace ${diffMinutes} min`;
    } else if (diffHours < 24) {
      return `hace ${diffHours} h`;
    } else {
      return `hace ${diffDays} días`;
    }
  });

  // Intervalo de auto-refresh eliminado — el botón manual hace reset completo.

  // Estado reactivo del componente
  readonly state = signal<VisitorState>({
    visitors: [],
    selectedVisitor: null,
    filters: {
      includeOffline: true,
      hasActiveChat: false,
    },
    sort: { field: 'firstVisit', direction: 'desc' }, // Cambiar a firstVisit (createdAt) descendente
    pagination: {
      limit: this.loadPageSize(),
      offset: 0,
      totalCount: 0,
      currentPage: 1,
    },
    loading: false,
    error: null,
    stats: null,
    searchQuery: '',
  });

  // Filtros predefinidos para diferentes vistas
  readonly filterPresets = signal([
    {
      id: 'unassigned',
      label: 'Sin Asignar',
      icon: '👥',
      description: 'Visitantes sin chat activo',
      filters: { hasActiveChat: false, includeOffline: true } as VisitorFilters,
      count: 0,
    },
    {
      id: 'online',
      label: 'En Línea',
      icon: '🟢',
      description: 'Visitantes conectados actualmente',
      filters: { status: ['online'], includeOffline: false } as VisitorFilters,
      count: 0,
    },
    {
      id: 'active-chats',
      label: 'Con Chat Activo',
      icon: '💬',
      description: 'Visitantes con conversación en curso',
      filters: { hasActiveChat: true } as VisitorFilters,
      count: 0,
    },
    {
      id: 'leads',
      label: 'Leads',
      icon: '📧',
      description: 'Visitantes que han proporcionado información',
      filters: { lifecycle: ['LEAD', 'CONVERTED'] } as VisitorFilters,
      count: 0,
    },
    {
      id: 'mine',
      label: 'Mis Visitantes',
      icon: '👤',
      description: 'Visitantes asignados a mi usuario',
      filters: { hasActiveChat: true, includeOffline: true } as VisitorFilters,
      count: 0,
    },
    {
      id: 'queue',
      label: 'En Cola',
      icon: '⏳',
      description: 'Visitantes esperando atención prioritaria',
      filters: {
        hasActiveChat: false,
        status: ['online'],
        includeOffline: false,
      } as VisitorFilters,
      count: 0,
    },
    {
      id: 'all',
      label: 'Todos',
      icon: '📊',
      description: 'Todos los visitantes del sitio',
      filters: { includeOffline: true } as VisitorFilters,
      count: 0,
    },
  ]);

  readonly selectedFilterId = signal<string>('unassigned');

  // === INFINITE SCROLL STATE ===
  readonly batchSize = 25;
  readonly isLoadingMore = signal<boolean>(false);
  readonly hasMore = signal<boolean>(true);
  readonly lastBatchStartIndex = signal<number>(0);
  /** Current offset for the next loadMore call */
  private infiniteOffset = 0;
  /** Emits when a new search/reset starts, cancelling any in-flight loadMore */
  private readonly _cancelLoadMore$ = new Subject<void>();
  /** True while resetAndLoad/searchVisitorsWithFilters is pending — guards onLoadMore from applying stale results */
  private isResetting = false;

  // Estado para filtros complejos (nueva API)
  readonly quickFilters = signal<QuickFilter[]>([]);
  readonly savedFilters = signal<SavedFilter[]>([]);
  readonly selectedSavedFilterId = signal<string | null>(null);
  readonly activeSearchFilters = signal<VisitorSearchFilters>({});
  readonly activeSearchSort = signal<VisitorSearchSort>({
    field: 'lastActivity',
    direction: 'DESC',
  });
  readonly advancedFiltersOpen = signal<boolean>(false);
  readonly saveDialogOpen = signal<boolean>(false);
  readonly pendingFilterToSave = signal<{
    filters: VisitorSearchFilters;
    sort?: VisitorSearchSort;
  } | null>(null);
  readonly useNewFiltersApi = signal<boolean>(true); // Flag para usar nueva API

  // Computed values
  readonly currentFilter = computed(() => {
    const filterId = this.selectedFilterId();
    return (
      this.filterPresets().find((f) => f.id === filterId) ||
      this.filterPresets()[0]
    );
  });

  readonly filteredVisitors = computed(() => {
    const state = this.state();
    const currentFilter = this.currentFilter();

    let visitors = state.visitors;
    const filters = { ...currentFilter.filters, ...state.filters };

    // Aplicar filtros
    if (filters.status?.length) {
      visitors = visitors.filter(
        (v) => filters.status?.includes(v.status) ?? false
      );
    }

    if (filters.lifecycle?.length) {
      const wanted = filters.lifecycle.map((l) => String(l).toUpperCase());
      visitors = visitors.filter((v) =>
        wanted.includes(String(v.lifecycle).toUpperCase()),
      );
    }

    if (filters.hasActiveChat !== undefined) {
      visitors = visitors.filter(
        (v) => v.hasActiveChat === filters.hasActiveChat
      );
    }

    if (filters.includeOffline === false) {
      visitors = visitors.filter((v) => v.status !== 'offline');
    }

    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      visitors = visitors.filter(
        (v) =>
          v.name?.toLowerCase().includes(query) ||
          v.email?.toLowerCase().includes(query) ||
          v.domain.toLowerCase().includes(query)
      );
    }

    return visitors;
  });

  readonly visitorStats = computed(() => {
    const visitors = this.state().visitors;
    const online = visitors.filter((v) => v.status === 'online').length;
    const withChat = visitors.filter((v) => v.hasActiveChat).length;
    const newVisitors = visitors.filter((v) => v.isNewVisitor).length;

    return {
      total: visitors.length,
      online,
      withActiveChat: withChat,
      newVisitors,
      leads: visitors.filter((v) =>
        ['LEAD', 'CONVERTED'].includes(String(v.lifecycle).toUpperCase()),
      ).length,
    };
  });

  // Configuración para el componente de lista
  readonly listConfig = computed(() => ({
    showSearch: true,
    showFilters: true,
    showActions: true,
    allowMultiSelect: this.selectedFilterId() === 'unassigned',
    showStats: true,
    pageSize: this.state().pagination.limit,
  }));

  constructor() {
    // Effect para actualizar contadores de filtros evitando ciclo reactivo
    effect(() => {
      const visitors = this.state().visitors; // dependencia rastreada
      untracked(() => {
        this.filterPresets.update((presets) => {
          const updated = presets.map((preset) => ({
            ...preset,
            count: this.getFilterCount(visitors, preset.filters),
          }));

          // Solo actualizar si cambian los counts para no crear bucles innecesarios
          const changed = updated.some((p, i) => p.count !== presets[i].count);
          return changed ? updated : presets;
        });
      });
    });
  }

  /** Handle for the aria announcement reset timeout, to allow cleanup on destroy. */
  private _ariaResetTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Announcement text for screen readers after each silent refresh. */
  readonly ariaAnnouncement = signal<string>('');

  ngOnInit(): void {
    // Clean up stale ?page= param from URL on load (infinite scroll doesn't use page in URL)
    const snapshot = this.route.snapshot;
    if (snapshot.queryParams['page'] !== undefined) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    // Leer query parameters de la URL
    this.route.queryParams.subscribe((params) => {
      // Solo cambiar filtro si es diferente al actual (evita doble carga)
      if (params['filter'] && params['filter'] !== this.selectedFilterId()) {
        this.onFilterPresetChange(params['filter']);
      }
    });

    // Obtener sitios de la empresa usando el endpoint correcto /api/companies/{companyId}/sites
    this.visitorsService
      .getCompanySites()
      .pipe(
        catchError((error: Error) => {
          console.error('Error obteniendo sitios de la empresa:', error);

          // No usar fallback con método deprecated - manejar error directamente
          this.updateState({
            error: 'No se pudieron obtener los sitios de la empresa.',
          });
          return of(null);
        })
      )
      .subscribe(
        (
          response: {
            sites: Array<{
              siteId: string;
              companyId: string;
              siteName: string;
              domain: string;
              isActive: boolean;
            }>;
            companyId: string;
            companyName: string;
            totalSites: number;
          } | null
        ) => {
          if (!response) {
            return; // Error ya manejado en catchError
          }

          // La respuesta viene de getCompanySites() que tiene el formato { sites: [], companyId: "", ... }
          if (!response.sites || !response.sites.length) {
            this.updateState({
              error: 'No se encontraron sitios activos para esta empresa.',
            });
            return;
          }

          // Buscar el sitio que coincida con el hostname actual o usar el primero activo
          const hostname = this.document.location.hostname;
          let selectedSite = response.sites.find(
            (site) =>
              site.domain.toLowerCase() === hostname.toLowerCase() ||
              site.domain.toLowerCase().includes(hostname.toLowerCase())
          );

          // Si no se encuentra coincidencia por dominio, usar el primer sitio activo
          if (!selectedSite) {
            selectedSite = response.sites.find((site) => site.isActive);
          }

          if (!selectedSite) {
            this.updateState({
              error: 'No se encontró un sitio activo disponible.',
            });
            return;
          }

          console.log(
            `[Visitors] Usando sitio: ${selectedSite.siteName} (${selectedSite.companyId}) de la empresa: ${response.companyName}`
          );
          this.companyId.set(selectedSite.companyId);

          this.loadVisitors();
          this.loadStats();

          // Cargar filtros para el nuevo sistema
          this.loadQuickFilters();
          this.loadSavedFilters();

          // Cargar chats del comercial para badges de mensajes no leídos
          this.loadCommercialChatsForBadges();
        }
      );

    // 🔥 NUEVO: Suscribirse a cambios de presencia en tiempo real vía WebSocket
    this.setupPresenceListener();

    // Refrescar lista cuando el widget asigna un chat pendiente a un comercial
    this.chatWidgetService.chatAssigned$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ chatId, visitorId }) => {
        console.log(
          '[Visitors] 🔄 Chat asignado — refrescando lista:',
          chatId,
          'visitante:',
          visitorId
        );
        this.refreshVisitorsSilently();
      });
  }

  /**
   * Configura listener para eventos de presencia en tiempo real
   * Actualiza el estado de conexión de los visitantes sin necesidad de polling
   */
  private setupPresenceListener(): void {
    this.presenceService.presenceChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: PresenceChangedEvent) => {
        console.log(
          '[Visitors] 🔔 Evento de presencia recibido en tiempo real:',
          {
            userId: event.userId,
            userType: event.userType,
            status: event.status,
            previousStatus: event.previousStatus,
            timestamp: event.timestamp,
          }
        );

        // Solo procesar eventos de visitantes
        if (event.userType !== 'visitor') {
          return;
        }

        // Actualizar el estado del visitante en la lista actual
        const currentState = this.state();
        const visitors = currentState.visitors;

        const visitorIndex = visitors.findIndex((v) => v.id === event.userId);

        if (visitorIndex === -1) {
          console.log(
            '[Visitors] ⚠️ Visitante no encontrado en la lista actual, omitiendo actualización'
          );
          return;
        }

        // Crear nuevo array con el visitante actualizado
        const updatedVisitors = [...visitors];
        updatedVisitors[visitorIndex] = {
          ...updatedVisitors[visitorIndex],
          connectionStatus: event.status as ConnectionStatus,
        };

        console.log(
          '[Visitors] ✅ Estado del visitante actualizado en tiempo real:',
          {
            visitorId: event.userId,
            previousStatus: event.previousStatus,
            newStatus: event.status,
          }
        );

        // Actualizar el estado con los visitantes modificados
        this.updateState({
          visitors: updatedVisitors,
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this._cancelLoadMore$.next();
    this._cancelLoadMore$.complete();
    if (this._ariaResetTimeout !== null) {
      clearTimeout(this._ariaResetTimeout);
    }
    // _tick (toSignal) polling unsubscribes automatically via takeUntilDestroyed.
  }

  // Métodos para cargar configuraciones desde localStorage
  private loadPageSize(): number {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_PAGE_SIZE);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        // Validar que sea un valor razonable (10, 20, 50, 100)
        if (!isNaN(parsed) && [10, 20, 50, 100].includes(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Error loading page size from localStorage:', error);
    }
    return 10; // Default: 10
  }

  // Métodos para guardar configuraciones en localStorage
  private savePageSize(pageSize: number): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_PAGE_SIZE, pageSize.toString());
    } catch (error) {
      console.error('Error saving page size to localStorage:', error);
    }
  }

  private getFilterCount(visitors: Visitor[], filters: VisitorFilters): number {
    let filtered = visitors;

    if (filters.status?.length) {
      filtered = filtered.filter(
        (v) => filters.status?.includes(v.status) ?? false
      );
    }

    if (filters.lifecycle?.length) {
      const wanted = filters.lifecycle.map((l) => String(l).toUpperCase());
      filtered = filtered.filter((v) =>
        wanted.includes(String(v.lifecycle).toUpperCase()),
      );
    }

    if (filters.hasActiveChat !== undefined) {
      filtered = filtered.filter(
        (v) => v.hasActiveChat === filters.hasActiveChat
      );
    }

    if (filters.includeOffline === false) {
      filtered = filtered.filter((v) => v.status !== 'offline');
    }

    return filtered.length;
  }

  // Métodos para cargar datos
  loadVisitors(options: { scrollToTop?: boolean } = {}): void {
    // Aún no hay companyId resuelto
    const companyId = this.companyId();
    if (!companyId) {
      return;
    }

    this.updateState({ loading: true, error: null });

    const currentState = this.state();

    // Decidir si usar mock o servicio real basado en el token
    if (this.useMockData) {
      // USAR MOCK
      setTimeout(() => {
        const mockResponse = getMockVisitorsResponse(this.batchSize, 0);

        this.hasMore.set(mockResponse.visitors.length < mockResponse.total);
        this.updateState({
          visitors: mockResponse.visitors,
          error: null,
          pagination: {
            ...currentState.pagination,
            totalCount: mockResponse.total,
          },
          loading: false,
        });

        // Actualizar timestamp de última carga
        this.lastRefreshTime.set(new Date());
      }, 500); // Simular latencia de red
    } else {
      // USAR SERVICIO REAL - Usando searchVisitors como endpoint único
      const currentSort = currentState.sort;

      // Mapear los campos de sort internos a los del backend
      const sortFieldMap: Record<string, VisitorSortField> = {
        firstVisit: 'createdAt',
        lastVisit: 'lastActivity',
      };

      // Usar filtros activos del sistema de búsqueda
      const searchFilters: VisitorSearchFilters = {
        ...this.activeSearchFilters(),
      };

      // Mantener compatibilidad con búsqueda del sistema antiguo
      if (currentState.searchQuery && !searchFilters.currentUrlContains) {
        searchFilters.currentUrlContains = currentState.searchQuery;
      }

      const request: VisitorSearchRequest = {
        filters: searchFilters,
        sort: {
          field: sortFieldMap[currentSort.field] || 'createdAt',
          direction: currentSort.direction.toUpperCase() as SortDirection,
        },
        page: 1,
        limit: this.batchSize,
      };

      this.visitorsService
        .searchVisitors(companyId, request)
        .pipe(
          catchError((error: Error) => {
            console.error('Error loading visitors:', error);
            return of({
              visitors: [],
              pagination: {
                total: 0,
                page: 1,
                limit: this.batchSize,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
              },
            });
          }),
          finalize(() => {
            this.isResetting = false;
            this.updateState({ loading: false });
          })
        )
        .subscribe((response) => {
          const mappedVisitors: Visitor[] = this.mapSearchResultsToVisitors(
            response.visitors
          );

          this.hasMore.set(response.pagination.hasNextPage);
          this.updateState({
            visitors: mappedVisitors,
            error: null,
            pagination: {
              ...currentState.pagination,
              totalCount: response.pagination.total,
            },
          });
          this.lastRefreshTime.set(new Date());
          this.enrichVisitorsWithContacts(mappedVisitors);
        });
    }
  }

  private loadStats(): void {
    const companyId = this.companyId();
    if (!companyId) return;

    if (this.useMockData) {
      setTimeout(() => {
        const mockStats = getMockVisitorStats();
        this.updateState({ stats: mockStats });
      }, 300);
    } else {
      this.visitorsService
        .getVisitorStats(companyId)
        .pipe(
          catchError((error: Error) => {
            console.error('Error loading visitor stats:', error);
            return of(null);
          })
        )
        .subscribe((stats: VisitorStats | null) => {
          if (stats) {
            this.updateState({ stats });
          } else {
            const localStats = this.computeLocalStats();
            if (localStats.totalVisitors > 0) {
              this.updateState({ stats: localStats });
            }
          }
        });
    }
  }

  private computeLocalStats(): VisitorStats {
    const visitors = this.state().visitors;
    return {
      totalVisitors: visitors.length,
      onlineVisitors: visitors.filter((v) => v.status === 'online').length,
      newVisitors: visitors.filter((v) => v.isNewVisitor).length,
      returningVisitors: visitors.filter((v) => !v.isNewVisitor).length,
      withPendingChats: visitors.filter((v) => v.hasActiveChat).length,
      averageSessionDuration: 0,
      bounceRate: 0,
      conversionRate: 0,
      topPages: [],
      topSources: [],
    };
  }

  // Refresh: reset to page 1 with batchSize and reload from scratch.
  refreshVisitorsSilently(): void {
    if (!this.companyId()) return;

    this.isRefreshing.set(true);
    this.resetAndLoad();

    // Update timestamp and announce to screen readers once loading settles.
    // We watch the loading signal once it goes back to false after resetAndLoad.
    const checkDone = setInterval(() => {
      if (!this.state().loading) {
        clearInterval(checkDone);
        this.lastRefreshTime.set(new Date());
        const total = this.state().pagination.totalCount;
        this.ariaAnnouncement.set(`Lista actualizada. ${total} visitantes activos.`);
        if (this._ariaResetTimeout !== null) clearTimeout(this._ariaResetTimeout);
        this._ariaResetTimeout = setTimeout(() => { this.ariaAnnouncement.set(''); this._ariaResetTimeout = null; }, 3000);
        this.isRefreshing.set(false);
      }
    }, 100);
  }

  // ============================================
  // Métodos para Sistema de Filtros Complejos
  // ============================================

  /** Cargar filtros rápidos desde la API */
  loadQuickFilters(): void {
    const companyId = this.companyId();
    if (!companyId) return;

    this.visitorsService
      .getQuickFilters(companyId)
      .pipe(catchError(() => of({ filters: [] })))
      .subscribe((response) => {
        this.quickFilters.set(response.filters);
      });
  }

  /** Cargar filtros guardados desde la API */
  loadSavedFilters(): void {
    const companyId = this.companyId();
    if (!companyId) return;

    this.visitorsService
      .getSavedFilters(companyId)
      .pipe(catchError(() => of({ filters: [], total: 0 })))
      .subscribe((response) => {
        this.savedFilters.set(response.filters);
      });
  }

  /** Manejar selección de filtro rápido */
  onQuickFilterSelect(filterId: string): void {
    // Toggle: si el filtro ya está activo, deseleccionarlo
    if (this.selectedFilterId() === filterId) {
      this.selectedFilterId.set('');
      this.selectedSavedFilterId.set(null);
      this.updateState({
        pagination: {
          ...this.state().pagination,
          currentPage: 1,
          offset: 0,
        },
      });
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: null },
        queryParamsHandling: 'merge',
      });
      return;
    }

    // Buscar el filtro rápido seleccionado
    const filter = this.quickFilters().find((f) => f.id === filterId);
    if (!filter) return;

    // Actualizar el filtro seleccionado para mostrar estado activo en UI
    this.selectedFilterId.set(filterId);

    // Limpiar selección de filtro guardado
    this.selectedSavedFilterId.set(null);

    // Resetear paginación a la página 1
    const currentState = this.state();
    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: 1,
        offset: 0,
      },
    });

    // Actualizar la URL para reflejar la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    // Aplicar filtro según el ID (mapear a filtros de búsqueda)
    const filterMapping: Record<string, VisitorSearchFilters> = {
      online: { connectionStatus: ['online', 'chatting'] },
      leads: { lifecycle: ['LEAD', 'CONVERTED'] },
      today: {
        lastActivityFrom:
          new Date().toISOString().split('T')[0] + 'T00:00:00.000Z',
      },
      this_week: { lastActivityFrom: this.getStartOfWeek().toISOString() },
      active: { hasActiveSessions: true },
      high_intent: { lifecycle: ['LEAD', 'CONVERTED'] },
      new_visitors: { maxTotalSessionsCount: 1 }, // Nuevos = 1 sesión
      returning: { minTotalSessionsCount: 2 }, // Recurrentes = más de 1 sesión
    };

    const searchFilters = filterMapping[filterId] || {};
    this.activeSearchFilters.set(searchFilters);
    this.searchVisitorsWithFilters();
  }

  /** Manejar selección de filtro guardado */
  onSavedFilterSelect(filter: SavedFilter): void {
    // Marcar el filtro guardado como activo
    this.selectedSavedFilterId.set(filter.id);
    // Limpiar selección de filtro rápido
    this.selectedFilterId.set('');

    // Resetear paginación a la página 1
    const currentState = this.state();
    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: 1,
        offset: 0,
      },
    });

    // Actualizar la URL para reflejar la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    // Aplicar los filtros y ordenamiento del filtro guardado
    this.activeSearchFilters.set(filter.filters);
    if (filter.sort) {
      this.activeSearchSort.set(filter.sort);
    }

    this.searchVisitorsWithFilters();
  }

  /** Manejar eliminación de filtro guardado */
  onSavedFilterDelete(filterId: string): void {
    const companyId = this.companyId();
    if (!companyId) return;

    this.visitorsService
      .deleteFilter(companyId, filterId)
      .pipe(
        catchError((error) => {
          console.error('Error al eliminar filtro:', error);
          throw error;
        })
      )
      .subscribe({
        next: () => {
          // Si el filtro eliminado estaba seleccionado, limpiar selección
          if (this.selectedSavedFilterId() === filterId) {
            this.selectedSavedFilterId.set(null);
            this.activeSearchFilters.set({});
            this.searchVisitorsWithFilters();
          }
          // Recargar lista de filtros guardados
          this.loadSavedFilters();
        },
        error: (error) => {
          console.error('Error al eliminar filtro:', error);
        },
      });
  }

  /** Aplicar filtros avanzados */
  onAdvancedFiltersApply(event: {
    filters: VisitorSearchFilters;
    sort?: VisitorSearchSort;
  }): void {
    // Resetear paginación a la página 1
    const currentState = this.state();
    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: 1,
        offset: 0,
      },
    });

    // Actualizar la URL para reflejar la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    this.activeSearchFilters.set(event.filters);
    if (event.sort) {
      this.activeSearchSort.set(event.sort);
    }
    this.advancedFiltersOpen.set(false);
    this.searchVisitorsWithFilters();
  }

  /** Eliminar un filtro específico */
  onFilterRemove(filterKey: string): void {
    const currentFilters = this.activeSearchFilters();
    const updatedFilters = { ...currentFilters };

    // Mapeo de claves de filtro a IDs de filtros rápidos que las usan
    const filterKeyToQuickFilterIds: Record<string, string[]> = {
      connectionStatus: ['online'],
      lifecycle: ['leads', 'high_intent'],
      lastActivity: ['today', 'this_week'],
      hasActiveSessions: ['active'],
      maxTotalSessionsCount: ['new_visitors'],
      minTotalSessionsCount: ['returning'],
      sessionCount: ['new_visitors', 'returning'],
    };

    // Si el filtro eliminado corresponde a un filtro rápido seleccionado, deseleccionarlo
    const currentQuickFilterId = this.selectedFilterId();
    const affectedQuickFilters = filterKeyToQuickFilterIds[filterKey] || [];
    if (affectedQuickFilters.includes(currentQuickFilterId)) {
      this.selectedFilterId.set('');
    }

    // Si hay un filtro guardado seleccionado, deseleccionarlo también
    // (ya que el usuario está modificando los filtros manualmente)
    if (this.selectedSavedFilterId()) {
      this.selectedSavedFilterId.set(null);
    }

    // Eliminar el filtro según su clave
    switch (filterKey) {
      case 'lifecycle':
        delete updatedFilters.lifecycle;
        break;
      case 'connectionStatus':
        delete updatedFilters.connectionStatus;
        break;
      case 'hasAcceptedPrivacyPolicy':
        delete updatedFilters.hasAcceptedPrivacyPolicy;
        break;
      case 'hasPendingChats':
        delete updatedFilters.hasPendingChats;
        break;
      case 'created':
        delete updatedFilters.createdFrom;
        delete updatedFilters.createdTo;
        break;
      case 'lastActivity':
        delete updatedFilters.lastActivityFrom;
        delete updatedFilters.lastActivityTo;
        break;
      case 'siteIds':
        delete updatedFilters.siteIds;
        break;
      case 'currentUrlContains':
        delete updatedFilters.currentUrlContains;
        break;
      case 'ipAddress':
        delete updatedFilters.ipAddress;
        break;
      case 'hasActiveSessions':
        delete updatedFilters.hasActiveSessions;
        break;
      case 'minTotalSessionsCount':
        delete updatedFilters.minTotalSessionsCount;
        break;
      case 'maxTotalSessionsCount':
        delete updatedFilters.maxTotalSessionsCount;
        break;
      case 'isInternal':
        delete updatedFilters.isInternal;
        break;
      case 'sessionCount':
        // Para eliminar filtros combinados de sesiones (ej: chip de "Nuevos" o "Recurrentes")
        delete updatedFilters.minTotalSessionsCount;
        delete updatedFilters.maxTotalSessionsCount;
        break;
    }

    // Resetear paginación a la página 1
    const currentState = this.state();
    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: 1,
        offset: 0,
      },
    });

    // Actualizar la URL para reflejar la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    this.activeSearchFilters.set(updatedFilters);
    this.searchVisitorsWithFilters();
  }

  /** Limpiar todos los filtros */
  onFiltersClearAll(): void {
    // Limpiar filtro rápido y filtro guardado seleccionados
    this.selectedFilterId.set('');
    this.selectedSavedFilterId.set(null);

    // Resetear paginación a la página 1
    const currentState = this.state();
    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: 1,
        offset: 0,
      },
    });

    // Actualizar la URL para reflejar la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    this.activeSearchFilters.set({});
    this.searchVisitorsWithFilters();
  }

  /** Abrir panel de filtros avanzados */
  onOpenAdvancedFilters(): void {
    this.advancedFiltersOpen.set(true);
  }

  /** Cerrar panel de filtros avanzados */
  onCloseAdvancedFilters(): void {
    this.advancedFiltersOpen.set(false);
  }

  /** Solicitar guardar filtro (abre diálogo) */
  onRequestSaveFilter(event: {
    filters: VisitorSearchFilters;
    sort?: VisitorSearchSort;
  }): void {
    // Guardar filtros pendientes sin aplicarlos todavía
    this.pendingFilterToSave.set(event);
    this.advancedFiltersOpen.set(false);
    this.saveDialogOpen.set(true);
  }

  /** Guardar filtro personalizado */
  onSaveFilter(data: SaveFilterData): void {
    const companyId = this.companyId();
    const pending = this.pendingFilterToSave();
    if (!companyId || !pending) return;

    const request = {
      name: data.name,
      description: data.description,
      filters: pending.filters,
      sort: pending.sort || this.activeSearchSort(),
    };

    this.visitorsService
      .saveFilter(companyId, request)
      .pipe(
        catchError((error) => {
          console.error('Error saving filter:', error);
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.saveDialogOpen.set(false);
          this.pendingFilterToSave.set(null);
          this.loadSavedFilters(); // Recargar lista de filtros guardados
        }
      });
  }

  /** Cancelar diálogo de guardar */
  onCancelSaveDialog(): void {
    this.saveDialogOpen.set(false);
    this.pendingFilterToSave.set(null);
  }

  /** Buscar visitantes usando la nueva API de filtros */
  private searchVisitorsWithFilters(): void {
    // Cancel any in-flight loadMore requests
    this._cancelLoadMore$.next();
    this.isResetting = true;

    // Reset infinite scroll and delegate to loadVisitors
    this.infiniteOffset = 0;
    this.hasMore.set(true);
    this.lastBatchStartIndex.set(0);
    this.updateState({ visitors: [], loading: true, error: null });

    const companyId = this.companyId();
    if (!companyId) return;

    const currentState = this.state();
    const request = {
      filters: this.activeSearchFilters(),
      sort: this.activeSearchSort(),
      page: 1,
      limit: this.batchSize,
    };

    this.visitorsService
      .searchVisitors(companyId, request)
      .pipe(
        catchError((error) => {
          console.error('Error searching visitors:', error);
          return of({
            visitors: [],
            pagination: {
              total: 0,
              page: 1,
              limit: this.batchSize,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          });
        }),
        finalize(() => {
          this.isResetting = false;
          this.updateState({ loading: false });
        })
      )
      .subscribe((response) => {
        const mappedVisitors: Visitor[] = this.mapSearchResultsToVisitors(
          response.visitors
        );

        this.hasMore.set(response.pagination.hasNextPage);
        this.updateState({
          visitors: mappedVisitors,
          pagination: {
            ...currentState.pagination,
            totalCount: response.pagination.total,
          },
        });

        this.lastRefreshTime.set(new Date());
        this.loadQuickFilters(); // Actualizar contadores
        this.enrichVisitorsWithContacts(mappedVisitors);
      });
  }

  /**
   * Enriquece la lista con alias/nombre vía caché compartida (misma que Atención).
   */
  private enrichVisitorsWithContacts(visitors: Visitor[]): void {
    if (!visitors.length) return;

    this.leadContactService
      .ensureContacts(visitors.map((v) => v.id))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.reapplyContactNamesToVisitors(),
        error: (err) =>
          console.warn('[Visitors] No se pudieron enriquecer contactos', err),
      });
  }

  /** Reaplica alias/nombre de contacto sobre los visitantes ya cargados */
  private reapplyContactNamesToVisitors(): void {
    const current = this.state().visitors;
    if (!current.length) return;

    const enriched = current.map((visitor) => this.applyContactToVisitor(visitor));
    const changed = enriched.some(
      (v, i) =>
        v.name !== current[i]?.name ||
        v.email !== current[i]?.email ||
        v.phone !== current[i]?.phone
    );
    if (!changed) return;

    this.updateState({ visitors: enriched });
  }

  private applyContactToVisitor(visitor: Visitor): Visitor {
    const contact = this.leadContactService.peekCache(visitor.id);
    if (!contact) return visitor;

    const contactName = getContactDisplayName(contact);
    if (!contactName) return visitor;

    return {
      ...visitor,
      name: contactName,
      email: contact.email || visitor.email,
      phone: contact.telefono || visitor.phone,
    };
  }

  /** Mapear array de resultados de búsqueda a Visitors */
  private mapSearchResultsToVisitors(
    results: VisitorSearchResult[]
  ): Visitor[] {
    return results.map((result) => this.mapSearchResultToVisitor(result));
  }


  /** Mapear resultado de búsqueda a Visitor */
  private mapSearchResultToVisitor(result: VisitorSearchResult): Visitor {
    const status =
      result.connectionStatus === 'online' ||
      result.connectionStatus === 'chatting'
        ? ('online' as const)
        : result.connectionStatus === 'away'
        ? ('idle' as const)
        : ('offline' as const);

    // Debug: verificar isMe
    if (result.isMe) {
      console.log('🔍 Visitante isMe detectado:', {
        id: result.id,
        isMe: result.isMe,
        fingerprint: result.fingerprint,
      });
    }

    const contact = this.leadContactService.peekCache(result.id);
    const contactName = getContactDisplayName(contact);
    const displayName =
      contactName ||
      getVisitorDisplayName({
        id: result.id,
        name: result.name,
        email: result.email || contact?.email,
        alias: contact?.alias,
      });

    return {
      id: result.id,
      fingerprint: result.fingerprint || '',
      // Backend persiste lifecycle en minúsculas; la UI filtra en mayúsculas (LEAD, ANON…)
      lifecycle: (result.lifecycle?.toUpperCase?.() ??
        result.lifecycle) as typeof result.lifecycle,
      isNewVisitor: result.totalSessionsCount === 1,
      status,
      connectionStatus: result.connectionStatus,
      currentUrl: result.currentUrl,
      // Search no garantiza contacto; enriquecemos vía LeadContactService.ensureContacts
      name: displayName,
      email: contact?.email || result.email,
      phone: contact?.telefono,
      domain: result.domain ?? '',
      siteId: result.siteId,
      companyId: result.tenantId,
      ipAddress: result.lastIpAddress,
      userAgent: result.lastUserAgent,
      firstVisit: new Date(result.createdAt),
      lastVisit: new Date(result.updatedAt),
      totalSessions: result.totalSessionsCount,
      totalPageViews: 0,
      averageSessionDuration: 0,
      totalSessionDuration: result.totalSessionDuration || 0,
      hasActiveChat: result.activeSessionsCount > 0,
      totalChats: result.totalChatsCount || 0,
      pendingChatIds: result.pendingChatIds || [],
      isMe: result.isMe,
      isInternal: result.isInternal,
      assignedCommercialId: result.assignedCommercialId,
      assignedCommercial: result.assignedCommercial,
    };
  }

  /** Obtener inicio de la semana actual */
  private getStartOfWeek(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return new Date(now.setDate(diff));
  }

  // Métodos auxiliares para mantener la posición del scroll
  private saveScrollPosition(): void {
    // Buscar el contenedor con scroll (ya no es :host, es .visitors-panel__list-container)
    const scrollContainer = this.elementRef.nativeElement.querySelector(
      '.visitors-panel__list-container'
    ) as HTMLElement;
    if (scrollContainer) {
      this.savedScrollPosition = scrollContainer.scrollTop;
    }
  }

  private restoreScrollPosition(): void {
    // Buscar el contenedor con scroll (ya no es :host, es .visitors-panel__list-container)
    const scrollContainer = this.elementRef.nativeElement.querySelector(
      '.visitors-panel__list-container'
    ) as HTMLElement;
    if (scrollContainer) {
      // Usar requestAnimationFrame para asegurar que el DOM se haya renderizado completamente
      requestAnimationFrame(() => {
        if (this.shouldScrollToTop) {
          scrollContainer.scrollTop = 0;
          this.shouldScrollToTop = false;
        } else {
          scrollContainer.scrollTop = this.savedScrollPosition;
        }
      });
    }
  }

  private scrollToTop(): void {
    // Hacer scroll al top del contenedor de la lista
    const scrollContainer = this.elementRef.nativeElement.querySelector(
      '.visitors-panel__list-container'
    ) as HTMLElement;
    if (scrollContainer) {
      setTimeout(() => {
        scrollContainer.scrollTop = 0;
      }, 0);
    }
  }

  private updateState(updates: Partial<VisitorState>): void {
    this.state.update((current) => ({ ...current, ...updates }));
  }

  // Event handlers del UI

  /**
   * Resets the visitor list and loads the first batch (used when filters/sort change).
   */
  resetAndLoad(): void {
    // Cancel any in-flight loadMore requests
    this._cancelLoadMore$.next();
    this.isResetting = true;

    this.infiniteOffset = 0;
    this.hasMore.set(true);
    this.lastBatchStartIndex.set(0);
    this.updateState({ visitors: [] });
    this.loadVisitors();
  }

  /**
   * Loads the next batch and appends it to the existing list (infinite scroll).
   */
  onLoadMore(): void {
    if (this.isResetting || this.isLoadingMore() || !this.hasMore() || this.state().loading) return;

    const companyId = this.companyId();
    if (!companyId) return;

    const currentVisitors = this.state().visitors;
    const batchStart = currentVisitors.length;
    this.infiniteOffset = batchStart;
    this.isLoadingMore.set(true);

    const currentState = this.state();
    const currentSort = currentState.sort;
    const sortFieldMap: Record<string, VisitorSortField> = {
      firstVisit: 'createdAt',
      lastVisit: 'lastActivity',
    };

    const searchFilters: VisitorSearchFilters = { ...this.activeSearchFilters() };
    if (currentState.searchQuery && !searchFilters.currentUrlContains) {
      searchFilters.currentUrlContains = currentState.searchQuery;
    }

    const page = Math.floor(this.infiniteOffset / this.batchSize) + 1;

    const request: VisitorSearchRequest = {
      filters: searchFilters,
      sort: {
        field: sortFieldMap[currentSort.field] || 'createdAt',
        direction: currentSort.direction.toUpperCase() as SortDirection,
      },
      page,
      limit: this.batchSize,
    };

    if (this.useMockData) {
      setTimeout(() => {
        if (this.isResetting) return; // Discard if reset happened during mock delay
        const mockResponse = getMockVisitorsResponse(this.batchSize, this.infiniteOffset);
        const newVisitors = this.mapSearchResultsToVisitors(mockResponse.visitors as unknown as VisitorSearchResult[]);
        const merged = [...currentVisitors, ...newVisitors];
        this.lastBatchStartIndex.set(batchStart);
        this.hasMore.set(merged.length < mockResponse.total);
        this.updateState({ visitors: merged });
        this.isLoadingMore.set(false);
      }, 400);
      return;
    }

    this.visitorsService
      .searchVisitors(companyId, request)
      .pipe(
        takeUntil(this._cancelLoadMore$),
        catchError(() =>
          of({
            visitors: [],
            pagination: {
              total: 0,
              page: 1,
              limit: this.batchSize,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          })
        ),
        finalize(() => this.isLoadingMore.set(false))
      )
      .subscribe((response) => {
        if (this.isResetting) return; // Discard stale results
        const newVisitors = this.mapSearchResultsToVisitors(response.visitors);
        const merged = [...currentVisitors, ...newVisitors];
        this.lastBatchStartIndex.set(batchStart);
        this.hasMore.set(response.pagination.hasNextPage);
        this.updateState({
          visitors: merged,
          pagination: {
            ...currentState.pagination,
            totalCount: response.pagination.total,
          },
        });
        this.lastRefreshTime.set(new Date());
        this.enrichVisitorsWithContacts(newVisitors);
      });
  }

  onFilterPresetChange(filterId: string): void {
    this.selectedFilterId.set(filterId);
    this.resetAndLoad();
  }

  onVisitorClick(visitor: Visitor): void {
    this.updateState({ selectedVisitor: visitor });
    // Navegar a vista de detalle del visitante (futuro)
    // this.router.navigate(['/visitors', visitor.id]);
  }

  onVisitorSelect(visitors: Visitor[]): void {
    console.log('Visitors selected:', visitors.length);
    // Manejar selección múltiple para acciones en lote
  }

  onCreateChat(request: CreateChatWithVisitorRequest): void {
    console.log('[Visitors] Creando chat con visitante:', request.visitorId);

    // Buscar el visitante en el estado actual
    const visitor = this.state().visitors.find(
      (v) => v.id === request.visitorId
    );
    if (!visitor) {
      console.error('Visitor not found:', request.visitorId);
      return;
    }

    this.visitorsService
      .createChatWithVisitor(request)
      .pipe(
        catchError((error: Error) => {
          console.error('Error creating chat:', error);
          return of(null);
        })
      )
      .subscribe((response: { chatId: string } | null) => {
        if (response) {
          console.log('Chat created successfully:', response.chatId);

          // Abrir el chat en el widget
          this.chatWidgetService.openWithChat(response.chatId, visitor);

          // Refrescar la lista de visitantes SIN loading
          this.refreshVisitorsSilently();
        }
      });
  }

  onSearchChange(query: string): void {
    this.updateState({ searchQuery: query });
  }

  onFilterChange(filters: VisitorFilters): void {
    this.updateState({ filters: { ...this.state().filters, ...filters } });
    this.resetAndLoad();
  }

  onSortChange(sort: VisitorSort): void {
    this.updateState({ sort });
    this.resetAndLoad();
  }

  // Métodos de paginación
  onPageChange(page: number): void {
    const currentState = this.state();
    const offset = (page - 1) * currentState.pagination.limit;

    this.updateState({
      pagination: {
        ...currentState.pagination,
        currentPage: page,
        offset,
      },
    });

    this.loadVisitors({ scrollToTop: true });
  }

  onPageSizeChange(pageSize: number): void {
    // Al cambiar el tamaño de página, volver a la primera página
    this.updateState({
      pagination: {
        limit: pageSize,
        offset: 0,
        currentPage: 1,
        totalCount: this.state().pagination.totalCount,
      },
    });

    // Guardar en localStorage
    this.savePageSize(pageSize);

    // Actualizar la URL para reflejar que estamos en la página 1
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: null },
      queryParamsHandling: 'merge',
    });

    this.loadVisitors({ scrollToTop: true });
  }

  firstPage(): void {
    this.onPageChange(1);
  }

  previousPage(): void {
    const currentPage = this.state().pagination.currentPage || 1;
    if (currentPage > 1) {
      this.onPageChange(currentPage - 1);
    }
  }

  nextPage(): void {
    const currentState = this.state();
    const currentPage = currentState.pagination.currentPage || 1;
    const totalPages = Math.ceil(
      (currentState.pagination.totalCount || 0) / currentState.pagination.limit
    );

    if (currentPage < totalPages) {
      this.onPageChange(currentPage + 1);
    }
  }

  lastPage(): void {
    const currentState = this.state();
    const totalPages = Math.ceil(
      (currentState.pagination.totalCount || 0) / currentState.pagination.limit
    );
    this.onPageChange(totalPages);
  }

  // Métodos de utilidad
  getFilterIcon(filterId: string): string {
    const filter = this.filterPresets().find((f) => f.id === filterId);
    return filter?.icon || '📊';
  }

  getFilterDescription(filterId: string): string {
    const filter = this.filterPresets().find((f) => f.id === filterId);
    return filter?.description || '';
  }

  // Pending chats handler - abre el primer chat pendiente en modo preview (sin asignar)
  onViewPendingChats(data: {
    visitor: Visitor;
    pendingChatIds: string[];
  }): void {
    console.log(
      '[Visitors] Ver chats pendientes para visitante:',
      data.visitor.id,
      'chats:',
      data.pendingChatIds
    );

    if (data.pendingChatIds.length === 0) {
      console.log('[Visitors] No hay chats pendientes para este visitante');
      return;
    }

    // Abrir el primer chat pendiente en modo preview (isPending: true)
    // El chat se asignará al comercial cuando envíe su primer mensaje
    const firstChatId = data.pendingChatIds[0];
    this.chatWidgetService.openPendingChat(firstChatId, data.visitor);

    // Log si hay más chats pendientes
    if (data.pendingChatIds.length > 1) {
      console.log(
        `[Visitors] Mostrando 1 de ${data.pendingChatIds.length} chats pendientes`
      );
    }
  }

  onTakePendingChatAutomatically(data: {
    visitor: Visitor;
    chatId: string;
  }): void {
    console.log(
      '👁️ Abriendo chat pendiente para previsualización:',
      data.chatId,
      'visitante:',
      data.visitor.id
    );
    console.log(
      '📌 El chat se asignará cuando el comercial envíe su primer mensaje'
    );

    // 🎯 Solo abrir el widget en modo pendiente (sin asignar)
    // El chat se asignará automáticamente cuando el comercial envíe su primer mensaje
    this.chatWidgetService.openPendingChat(data.chatId, data.visitor);

    // Limpiar estado de procesamiento
    this.visitorsListComponent?.markAsCompleted(data.visitor.id);
  }

  // Método para limpiar el estado de procesamiento cuando una operación termina
  onOperationCompleted(visitorId: string): void {
    console.log('Operation completed for visitor:', visitorId);
    this.visitorsListComponent?.markAsCompleted(visitorId);
  }

  onTakePendingChat(chatId: string): void {
    console.log('Taking pending chat:', chatId);

    // NO activar loading - operación silenciosa
    // this.updateState({ loading: true });

    // Primero obtener el usuario actual de la sesión
    this.sessionService
      .ensureSession$()
      .pipe(
        switchMap((user) => {
          if (!user?.sub) {
            throw new Error('No se pudo obtener el ID del usuario actual');
          }

          console.log('Assigning chat', chatId, 'to user', user.sub);

          // Usar el método del servicio para asignar el chat al comercial actual
          return this.visitorsService.assignChatToCommercial(chatId, user.sub);
        }),
        catchError((error: Error) => {
          console.error('Error al tomar el chat:', error);
          this.updateState({
            error: 'Error al tomar el chat. Inténtalo de nuevo.',
          });
          return of(null);
        })
      )
      .subscribe(
        (response: { success: boolean; assignedAt: string } | null) => {
          if (response?.success) {
            console.log('Chat asignado exitosamente:', response);

            // 🔥 BUGFIX: Unirse a la sala de WebSocket para recibir notificaciones
            // Cuando el agente toma un chat pendiente, debemos suscribirnos
            // a su sala de WebSocket para recibir mensajes nuevos del visitante
            console.log(
              '[Visitors] 🔌 Uniéndose a sala de WebSocket para notificaciones:',
              chatId
            );
            this.chatService.webSocketService.joinRoom(chatId);

            // Mostrar mensaje de éxito (opcional)
            // this.updateState({ successMessage: 'Chat asignado exitosamente' });

            // Refrescar la lista de visitantes SIN loading
            this.refreshVisitorsSilently();

            // Opcionalmente, navegar al chat asignado
            // this.router.navigate(['/chat', chatId]);
          }
        }
      );
  }

  onTransferPendingChat(data: { chatId: string; targetUserId: string }): void {
    console.log(
      'Transferring pending chat:',
      data.chatId,
      'to user:',
      data.targetUserId
    );

    // NO activar loading - operación silenciosa
    // this.updateState({ loading: true });

    this.visitorsService
      .assignChatToCommercial(data.chatId, data.targetUserId)
      .pipe(
        catchError((error: Error) => {
          console.error('Error al transferir el chat:', error);
          this.updateState({
            error: 'Error al transferir el chat. Inténtalo de nuevo.',
          });
          return of(null);
        })
      )
      .subscribe(
        (response: { success: boolean; assignedAt: string } | null) => {
          if (response?.success) {
            console.log('Chat transferido exitosamente:', response);

            // Refrescar la lista de visitantes SIN loading
            this.refreshVisitorsSilently();
          }
        }
      );
  }

  /**
   * Carga los chats del comercial actual y registra las relaciones chat-visitor
   * para que el badge de mensajes no leídos funcione correctamente en la tabla.
   * Este método se debe llamar al inicializar la página de visitantes.
   */
  private loadCommercialChatsForBadges(): void {
    console.log(
      '[Visitors] 🔄 Cargando chats del comercial para badges de mensajes no leídos...'
    );

    this.sessionService
      .ensureSession$()
      .pipe(
        switchMap((user) => {
          if (!user?.sub) {
            console.warn(
              '[Visitors] ⚠️ No se pudo obtener el ID del comercial actual'
            );
            return of([]);
          }

          console.log('[Visitors] 👤 Comercial ID:', user.sub);
          return this.chatService.getCommercialChats(user.sub);
        }),
        catchError((error: Error) => {
          console.error(
            '[Visitors] ❌ Error al cargar chats del comercial:',
            error
          );
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((chats: Chat[]) => {
        if (chats.length === 0) {
          console.log('[Visitors] 📭 No hay chats para registrar');
          return;
        }

        // Registrar las relaciones chat-visitor para el servicio de mensajes no leídos
        const chatsToRegister = chats.map((chat) => ({
          chatId: chat.chatId,
          visitorId: chat.visitorId,
        }));

        console.log(
          `[Visitors] 📝 Registrando ${chatsToRegister.length} relaciones chat-visitor para badges`
        );
        this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
        console.log('[Visitors] ✅ Relaciones registradas exitosamente');
      });
  }

  /** Computes the current set of visitor IDs with unread messages and exposes it as a signal */
  readonly unreadVisitorIds = computed<Set<string>>(() => {
    // Track both visitors and unreadCountByVisitor so Angular re-evaluates
    // this computed whenever either changes — no manual refresh needed.
    const visitors = this.state().visitors;
    const unreadByVisitor = this.unreadMessagesService.unreadCountByVisitor();
    const ids = new Set<string>();
    for (const v of visitors) {
      if ((unreadByVisitor[v.id] || 0) > 0) {
        ids.add(v.id);
      }
    }
    return ids;
  });

  /** Asegura nombre de contacto antes de abrir el widget de chat */
  private withContactName(visitor: Visitor): Visitor {
    return this.applyContactToVisitor(visitor);
  }

  /** Handle openChat output from VisitorsListComponent */
  onOpenChat(visitor: Visitor): void {
    this.leadContactService
      .ensureContacts([visitor.id])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const enriched = this.withContactName(visitor);
        this.chatService.getVisitorMyChats(enriched.id).subscribe({
          next: (response: {
            chats: Chat[];
            total: number;
            totalVisitorChats: number;
            hasMore: boolean;
            nextCursor?: string | null;
          }) => {
            const chatsToRegister = response.chats.map((c) => ({
              chatId: c.chatId,
              visitorId: enriched.id,
            }));
            if (chatsToRegister.length) {
              this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
            }
            if (response.chats.length > 1) {
              this.chatWidgetService.openWithTabs(response.chats, enriched, 0);
            } else if (response.chats.length === 1) {
              this.chatWidgetService.openWithChat(
                response.chats[0].chatId,
                enriched
              );
            } else if (enriched.pendingChatIds?.length) {
              this.chatWidgetService.openPendingChat(
                enriched.pendingChatIds[0],
                enriched
              );
            } else {
              this.chatWidgetService.openWidget(enriched);
            }
          },
          error: (error: unknown) =>
            console.error(
              '[Visitors] Error al verificar chats del visitante:',
              error
            ),
        });
      });
  }

  /** Handle openWidget output from VisitorsListComponent */
  onOpenWidget(visitor: Visitor): void {
    this.leadContactService
      .ensureContacts([visitor.id])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const enriched = this.withContactName(visitor);
        this.chatService.getVisitorMyChats(enriched.id).subscribe({
          next: (response: {
            chats: Chat[];
            total: number;
            totalVisitorChats: number;
            hasMore: boolean;
            nextCursor?: string | null;
          }) => {
            const chatsToRegister = response.chats.map((c) => ({
              chatId: c.chatId,
              visitorId: enriched.id,
            }));
            if (chatsToRegister.length) {
              this.unreadMessagesService.registerChatsVisitors(chatsToRegister);
            }
            if (response.chats.length > 1) {
              this.chatWidgetService.openWithTabs(response.chats, enriched, 0);
            } else if (response.chats.length === 1) {
              this.chatWidgetService.openWithChat(
                response.chats[0].chatId,
                enriched
              );
            } else {
              this.chatWidgetService.openWidget(enriched);
            }
          },
          error: (error: unknown) =>
            console.error(
              '[Visitors] Error al obtener chat del visitante:',
              error
            ),
        });
      });
  }

  /** Handle viewDetails output from VisitorsListComponent */
  onViewVisitorDetails(visitor: Visitor): void {
    console.log('[Visitors] Ver detalles del visitante:', visitor.id);
    // Future: navigate to detail page or open modal
  }

  /** Handle registerVisitorChatsEvent output from VisitorsListComponent */
  onRegisterVisitorChats(chats: Array<{ chatId: string; visitorId: string }>): void {
    if (chats.length) {
      this.unreadMessagesService.registerChatsVisitors(chats);
    }
  }
}
