import {
  Component,
  input,
  output,
  computed,
  signal,
  HostListener,
  effect,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  OnDestroy,
  ChangeDetectorRef,
  NgZone,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Badge } from '@guiders-frontend/badge';
import { isDemoId } from '@guiders-frontend/tour-sandbox';
import {
  Visitor,
  VisitorFilters,
  VisitorSort,
  CreateChatWithVisitorRequest,
  VisitorSearchSort,
} from '@guiders-frontend/shared/types';
import { getVisitorDisplayName } from '@guiders-frontend/visitor-display-name';

export interface VisitorListConfig {
  showSearch: boolean;
  showFilters: boolean;
  showActions: boolean;
  allowMultiSelect: boolean;
  showStats: boolean;
  pageSize: number;
}

@Component({
  selector: 'lib-visitors-list',
  standalone: true,
  imports: [CommonModule, Badge],
  templateUrl: './visitors-list.html',
  styleUrls: ['./visitors-list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitorsListComponent implements OnDestroy {
  // Inputs
  readonly visitors = input<Visitor[]>([]);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly config = input<VisitorListConfig>({
    showSearch: true,
    showFilters: true,
    showActions: true,
    allowMultiSelect: false,
    showStats: true,
    pageSize: 20,
  });
  readonly selectedVisitorIds = input<string[]>([]);
  readonly externalSort = input<VisitorSearchSort | null>(null);
  /** Set of visitor IDs that have unread messages (provided by container) */
  readonly unreadVisitorIds = input<Set<string>>(new Set());
  /** Whether more visitors are being loaded */
  readonly isLoadingMore = input<boolean>(false);
  /** Whether there are more visitors to load */
  readonly hasMore = input<boolean>(true);
  /** Index where the last batch starts (for row-enter animation) */
  readonly lastBatchStartIndex = input<number>(0);

  // Outputs
  readonly visitorClick = output<Visitor>();
  readonly visitorSelect = output<Visitor[]>();
  readonly createChat = output<CreateChatWithVisitorRequest>();
  readonly filterChange = output<VisitorFilters>();
  readonly sortChange = output<VisitorSort>();
  readonly searchChange = output<string>();
  readonly viewPendingChats = output<{
    visitor: Visitor;
    pendingChatIds: string[];
  }>();
  readonly takePendingChat = output<{ visitor: Visitor; chatId: string }>();
  readonly operationCompleted = output<string>();
  readonly openChat = output<Visitor>();
  readonly openWidget = output<Visitor>();
  readonly viewDetails = output<Visitor>();
  readonly registerVisitorChatsEvent = output<
    Array<{ chatId: string; visitorId: string }>
  >();
  /** Emitted when sentinel becomes visible and more data should be loaded */
  readonly loadMore = output<void>();

  // Scroll sentinel & container refs
  private _tableContainerEl?: HTMLDivElement;
  @ViewChild('tableContainer') set tableContainerRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this._tableContainerEl = ref?.nativeElement;
  }

  @ViewChild('scrollSentinel') set scrollSentinelRef(ref: ElementRef<HTMLDivElement> | undefined) {
    if (ref?.nativeElement) {
      // Disconnect previous observer if any, then reconnect with the new element.
      this.intersectionObserver?.disconnect();
      this.setupIntersectionObserver(ref.nativeElement);
    } else {
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = undefined;
    }
  }

  // Internal state
  readonly searchQuery = signal<string>('');
  readonly currentFilters = signal<VisitorFilters>({});
  readonly currentSort = signal<VisitorSort>({
    field: 'firstVisit',
    direction: 'desc',
  });
  readonly internalSelectedIds = signal<Set<string>>(new Set());
  readonly showDropdown = signal<string | null>(null);
  readonly dropdownPosition = signal<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  readonly processingVisitorIds = signal<Set<string>>(new Set());

  readonly activeDropdownVisitor = computed(() => {
    const id = this.showDropdown();
    if (!id) return null;
    return this.filteredVisitors().find((v) => v.id === id) ?? null;
  });

  private readonly _registeredChatIds = new Set<string>();
  private intersectionObserver?: IntersectionObserver;
  private _destroyed = false;
  private _loadMorePending = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  // Computed values
  readonly filteredVisitors = computed(() => {
    let filtered = this.visitors();
    const query = this.searchQuery().toLowerCase();

    if (query) {
      filtered = filtered.filter(
        (visitor) =>
          visitor.name?.toLowerCase().includes(query) ||
          visitor.email?.toLowerCase().includes(query) ||
          visitor.domain.toLowerCase().includes(query)
      );
    }

    return this.sortVisitors(filtered);
  });

  readonly selectedVisitors = computed(() => {
    const selectedIds = this.internalSelectedIds();
    return this.visitors().filter((visitor) => selectedIds.has(visitor.id));
  });

  readonly stats = computed(() => {
    const visitors = this.visitors();
    const online = visitors.filter((v) => v.status === 'online').length;
    const withActiveChat = visitors.filter((v) => v.hasActiveChat).length;
    const newVisitors = visitors.filter((v) => v.isNewVisitor).length;

    return {
      total: visitors.length,
      online,
      withActiveChat,
      newVisitors,
    };
  });

  readonly sortOptions = [
    { field: 'lastVisit', label: 'Última visita' },
    { field: 'firstVisit', label: 'Primera visita' },
    { field: 'name', label: 'Nombre' },
    { field: 'totalChats', label: 'Total de chats' },
    { field: 'status', label: 'Estado de conexión' },
  ] as const;

  constructor() {
    // Sync external sort with internal sort
    effect(
      () => {
        const external = this.externalSort();
        if (external) {
          const fieldMap: Record<string, VisitorSort['field']> = {
            lastActivity: 'lastVisit',
            createdAt: 'firstVisit',
            updatedAt: 'lastVisit',
            lifecycle: 'lifecycle',
            connectionStatus: 'status',
          };
          const mappedField = fieldMap[external.field] || 'lastVisit';
          const mappedDirection = external.direction.toLowerCase() as
            | 'asc'
            | 'desc';
          this.currentSort.set({
            field: mappedField,
            direction: mappedDirection,
          });
        }
      },
      { allowSignalWrites: true }
    );

    // Emit chat-visitor relationships for unread badges
    effect(() => {
      const visitors = this.visitors();
      const newChats: Array<{ chatId: string; visitorId: string }> = [];
      for (const visitor of visitors) {
        if (
          visitor.lastChatId &&
          !this._registeredChatIds.has(visitor.lastChatId)
        ) {
          newChats.push({ chatId: visitor.lastChatId, visitorId: visitor.id });
          this._registeredChatIds.add(visitor.lastChatId);
        }
        if (visitor.pendingChatIds?.length) {
          for (const chatId of visitor.pendingChatIds) {
            if (!this._registeredChatIds.has(chatId)) {
              newChats.push({ chatId, visitorId: visitor.id });
              this._registeredChatIds.add(chatId);
            }
          }
        }
      }
      if (newChats.length > 0) {
        this.registerVisitorChatsEvent.emit(newChats);
      }
    });
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    this.intersectionObserver?.disconnect();
  }

  private setupIntersectionObserver(sentinelEl: HTMLDivElement): void {
    const root = this._tableContainerEl ?? null;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (this._destroyed) return;
        const entry = entries[0];
        if (entry.isIntersecting && !this.isLoadingMore() && this.hasMore() && !this._loadMorePending) {
          this._loadMorePending = true;
          // Run inside Angular zone so outputs and signal updates are picked up
          this.ngZone.run(() => {
            this.loadMore.emit();
          });
          // Reset the guard after a short debounce to allow subsequent loads
          setTimeout(() => {
            this._loadMorePending = false;
          }, 300);
        }
      },
      {
        root,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0,
      }
    );

    this.intersectionObserver.observe(sentinelEl);
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.searchChange.emit(query);
  }

  onVisitorClick(visitor: Visitor): void {
    this.visitorClick.emit(visitor);
  }

  onVisitorSelect(visitor: Visitor, event: Event): void {
    event.stopPropagation();

    if (!this.config().allowMultiSelect) {
      return;
    }

    const selected = new Set(this.internalSelectedIds());

    if (selected.has(visitor.id)) {
      selected.delete(visitor.id);
    } else {
      selected.add(visitor.id);
    }

    this.internalSelectedIds.set(selected);
    this.visitorSelect.emit(this.selectedVisitors());
  }

  onCreateChat(visitor: Visitor, event: Event): void {
    event.stopPropagation();
    this.openChat.emit(visitor);
  }

  onViewDetails(visitor: Visitor, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.viewDetails.emit(visitor);
  }

  onViewChat(visitor: Visitor, event: Event): void {
    event.stopPropagation();
    this.openWidget.emit(visitor);
  }

  onViewHistory(visitor: Visitor, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    console.log('View history for visitor:', visitor.id);
  }

  onAddTag(visitor: Visitor, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    console.log('Add tag to visitor:', visitor.id);
  }

  onCreateChatFromButton(visitor: Visitor): void {
    this.openChat.emit(visitor);
  }

  onViewChatFromButton(visitor: Visitor): void {
    this.openWidget.emit(visitor);
  }

  onViewPendingChats(visitor: Visitor, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (this.isProcessing(visitor.id)) {
      return;
    }

    const pendingChatIds = visitor.pendingChatIds || [];

    if (pendingChatIds.length === 0) {
      return;
    }

    this.closeDropdown();

    if (pendingChatIds.length > 1) {
      this.viewPendingChats.emit({ visitor, pendingChatIds });
    } else {
      this.takeSinglePendingChat(visitor, pendingChatIds[0]);
    }
  }

  private takeSinglePendingChat(visitor: Visitor, chatId: string): void {
    this.markAsProcessing(visitor.id);
    this.takePendingChat.emit({ visitor, chatId });
  }

  markAsProcessing(visitorId: string): void {
    const processing = new Set(this.processingVisitorIds());
    processing.add(visitorId);
    this.processingVisitorIds.set(processing);
  }

  markAsCompleted(visitorId: string): void {
    const processing = new Set(this.processingVisitorIds());
    processing.delete(visitorId);
    this.processingVisitorIds.set(processing);
  }

  isProcessing(visitorId: string): boolean {
    return this.processingVisitorIds().has(visitorId);
  }

  onRemoveVisitor(visitor: Visitor): void {
    console.log('Remove visitor:', visitor.id);
    this.closeDropdown();
  }

  toggleDropdown(visitorId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    const isCurrentlyOpen = this.showDropdown() === visitorId;

    if (isCurrentlyOpen) {
      this.showDropdown.set(null);
    } else {
      const button = (event.target as HTMLElement).closest('button') as HTMLElement;
      const rect = button.getBoundingClientRect();
      this.dropdownPosition.set({
        top: rect.bottom + 4,
        left: rect.left - 160 + rect.width,
      });
      this.showDropdown.set(visitorId);
    }
  }

  closeDropdown(): void {
    this.showDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const dropdown = target.closest('.dropdown-actions');

    if (!dropdown && this.showDropdown()) {
      this.closeDropdown();
    }
  }

  handleVisitorSelect(event: { visitor: Visitor; selected: boolean }): void {
    const selected = new Set(this.internalSelectedIds());

    if (event.selected) {
      selected.add(event.visitor.id);
    } else {
      selected.delete(event.visitor.id);
    }

    this.internalSelectedIds.set(selected);
    this.visitorSelect.emit(this.selectedVisitors());
  }

  onDeselectAll(): void {
    this.internalSelectedIds.set(new Set());
    this.visitorSelect.emit([]);
  }

  onFilterChange(filterType: keyof VisitorFilters, values: string[]): void {
    const newFilters = { ...this.currentFilters() };

    switch (filterType) {
      case 'status':
        newFilters.status = values as ('online' | 'offline' | 'idle')[];
        break;
      case 'lifecycle':
        newFilters.lifecycle = values as (
          | 'ANON'
          | 'ENGAGED'
          | 'LEAD'
          | 'CONVERTED'
        )[];
        break;
    }

    this.currentFilters.set(newFilters);
    this.filterChange.emit(newFilters);
  }

  onSortChange(field: string, direction: 'asc' | 'desc'): void {
    const newSort: VisitorSort = {
      field: field as VisitorSort['field'],
      direction,
    };
    this.currentSort.set(newSort);
    this.sortChange.emit(newSort);
  }

  toggleSort(field: string): void {
    const currentSort = this.currentSort();
    const sortField = field as VisitorSort['field'];

    let newDirection: 'asc' | 'desc' = 'desc';

    if (currentSort.field === sortField) {
      newDirection = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      newDirection = sortField === 'name' ? 'asc' : 'desc';
    }

    this.onSortChange(sortField, newDirection);
  }

  private sortVisitors(visitors: Visitor[]): Visitor[] {
    const sort = this.currentSort();

    return [...visitors].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sort.field) {
        case 'lastVisit':
          aValue = a.lastVisit;
          bValue = b.lastVisit;
          break;
        case 'firstVisit':
          aValue = a.firstVisit;
          bValue = b.firstVisit;
          break;
        case 'name':
          aValue = a.name || '';
          bValue = b.name || '';
          break;
        case 'totalChats':
          aValue = a.totalChats;
          bValue = b.totalChats;
          break;
        case 'status': {
          const statusToNumber = (status: string): number => {
            switch (status) {
              case 'online':
                return 2;
              case 'idle':
                return 1;
              case 'offline':
                return 0;
              default:
                return -1;
            }
          };
          aValue = statusToNumber(a.status);
          bValue = statusToNumber(b.status);
          break;
        }
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sort.direction === 'asc' ? -1 : 1;
      } else if (aValue > bValue) {
        return sort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  /** Returns true if this row index belongs to the newly appended batch */
  isNewBatchRow(index: number): boolean {
    const batchStart = this.lastBatchStartIndex();
    return batchStart > 0 && index >= batchStart && index < batchStart + 3;
  }

  /** Stagger delay in ms for new-batch rows (max 3 rows × 30ms) */
  getRowAnimationDelay(index: number): number {
    const batchStart = this.lastBatchStartIndex();
    return (index - batchStart) * 30;
  }

  getVisitorStatusIcon(visitor: Visitor): string {
    switch (visitor.status) {
      case 'online':
        return 'status-online';
      case 'offline':
        return 'status-offline';
      case 'idle':
        return 'status-idle';
      default:
        return 'status-offline';
    }
  }

  getLifecycleIcon(lifecycle: string): string {
    switch (lifecycle) {
      case 'ANON':
        return 'lifecycle-anon';
      case 'ENGAGED':
        return 'lifecycle-engaged';
      case 'LEAD':
        return 'lifecycle-lead';
      case 'CONVERTED':
        return 'lifecycle-converted';
      default:
        return 'lifecycle-anon';
    }
  }

  formatLastVisit(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return new Date(date).toLocaleDateString();
  }

  formatCreatedAt(date: Date): { date: string; time: string } {
    if (!date) return { date: '-', time: '' };
    const d = new Date(date);
    return {
      date: d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      time: d.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const names = name.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (
      names[0].charAt(0) + names[names.length - 1].charAt(0)
    ).toUpperCase();
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'online':
        return 'En línea';
      case 'offline':
        return 'Desconectado';
      case 'idle':
        return 'Inactivo';
      default:
        return status;
    }
  }

  isSelected(visitorId: string): boolean {
    return this.internalSelectedIds().has(visitorId);
  }

  formatDuration(milliseconds: number | undefined): string {
    if (!milliseconds || milliseconds === 0) return '-';

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0
        ? `${days}d ${remainingHours}h`
        : `${days}d`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}m`
        : `${hours}h`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }

  truncateUrl(url: string | undefined, maxLength = 40): string {
    if (!url) return '-';

    const cleanUrl = url.replace(/^https?:\/\//, '');

    if (cleanUrl.length <= maxLength) {
      return cleanUrl;
    }

    const startLength = Math.floor(maxLength * 0.6);
    const endLength = maxLength - startLength - 3;

    return `${cleanUrl.slice(0, startLength)}...${cleanUrl.slice(-endLength)}`;
  }

  getUrlSegmentTags(url: string | undefined): string[] {
    if (!url) return ['raíz'];

    try {
      let domain = '';
      let pathname = url;
      let queryParams = '';

      if (url.includes('://')) {
        const urlObj = new URL(url);
        domain = urlObj.host;
        pathname = urlObj.pathname;
        queryParams = urlObj.search;
      } else if (url.startsWith('/')) {
        const [path, query] = url.split('?');
        pathname = path;
        queryParams = query ? `?${query}` : '';
      } else {
        return [url];
      }

      pathname = pathname.split('#')[0];

      const allSegments: string[] = domain ? [domain] : [];

      if (pathname === '/' || pathname === '') {
        if (queryParams) {
          allSegments.push(queryParams);
        }
        return allSegments.length > 0 ? allSegments : ['raíz'];
      }

      const pathSegments = pathname.split('/').filter((s) => s.length > 0);

      const truncateSegment = (segment: string): string => {
        if (segment.length > 12) {
          return segment.slice(0, 8) + '...';
        }
        return segment;
      };

      allSegments.push(...pathSegments.map(truncateSegment));

      if (queryParams) {
        allSegments.push(queryParams);
      }

      return allSegments.length > 0 ? allSegments : ['raíz'];
    } catch {
      return ['raíz'];
    }
  }

  onBreadcrumbSegmentClick(
    event: Event,
    segmentIndex: number,
    url: string | undefined
  ): void {
    event.stopPropagation();

    if (!url) return;

    try {
      let protocol = 'https';
      let domain = '';
      let pathname = url;
      let queryParams = '';

      if (url.includes('://')) {
        const urlObj = new URL(url);
        protocol = urlObj.protocol.replace(':', '');
        domain = urlObj.host;
        pathname = urlObj.pathname;
        queryParams = urlObj.search;
      } else if (url.startsWith('/')) {
        const [path, query] = url.split('?');
        pathname = path;
        queryParams = query ? `?${query}` : '';
        return;
      } else {
        return;
      }

      const displayedSegments = this.getUrlSegmentTags(url);
      const clickedSegment = displayedSegments[segmentIndex];

      const isQueryParamSegment = clickedSegment?.startsWith('?');

      let reconstructedUrl: string;

      if (segmentIndex === 0) {
        reconstructedUrl = `${protocol}://${domain}`;
      } else if (isQueryParamSegment) {
        reconstructedUrl = `${protocol}://${domain}${pathname}${queryParams}`;
      } else {
        const pathSegments = pathname.split('/').filter((s) => s.length > 0);
        const pathSegmentsToInclude = pathSegments.slice(0, segmentIndex);

        if (pathSegmentsToInclude.length === 0) {
          reconstructedUrl = `${protocol}://${domain}`;
        } else {
          reconstructedUrl = `${protocol}://${domain}/${pathSegmentsToInclude.join('/')}`;
        }
      }

      window.open(reconstructedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  }

  hasUnreadMessages(visitorId: string): boolean {
    return this.unreadVisitorIds().has(visitorId);
  }

  /**
   * Returns true when the visitor belongs to the tour sandbox demo state.
   * Used by the template to render a `DEMO` badge so operators can tell
   * sandbox rows from real visitors at a glance.
   */
  isDemoVisitor(visitorId: string): boolean {
    return isDemoId(visitorId);
  }

  /** Nombre a mostrar: contacto enriquecido o fallback por id/email */
  getDisplayName(visitor: Visitor): string {
    return getVisitorDisplayName({
      id: visitor.id,
      name: visitor.name,
      email: visitor.email,
    });
  }

  /** Inicial del avatar a partir del nombre visible */
  getInitial(visitor: Visitor): string {
    const name = this.getDisplayName(visitor).trim();
    const letter = name.match(/[A-Za-zÀ-ÿ0-9]/)?.[0];
    return (letter || 'V').toUpperCase();
  }

  /** UUID completo truncado para la fila (tooltip lleva el completo) */
  shortId(id: string): string {
    if (!id) return '—';
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
  }

  /** Título del meta: ID completo (+ email/fp) para comparar entre módulos */
  visitorMetaTitle(visitor: Visitor): string {
    const parts = [`ID: ${visitor.id}`];
    if (visitor.email) parts.push(visitor.email);
    if (visitor.fingerprint) parts.push(`FP: ${visitor.fingerprint}`);
    return parts.join(' · ');
  }

  /** Tono estable del avatar según id */
  avatarTone(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 6;
  }
}
