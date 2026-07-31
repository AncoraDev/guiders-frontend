import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Avatar } from '@guiders-frontend/avatar';
import {
  PaginationComponent,
  type PaginationConfig,
} from '@guiders-frontend/pagination';
import {
  ConnectionSessionsService,
  ConnectionSession,
  ConnectionSessionEndReason,
  ConnectionSessionsQuery,
} from '@guiders-frontend/connection-sessions-service';

type QuickFilterId = 'all' | 'today' | 'week' | 'open' | 'closed';

interface QuickFilter {
  id: QuickFilterId;
  label: string;
}

@Component({
  selector: 'lib-conexiones',
  standalone: true,
  imports: [CommonModule, FormsModule, Avatar, PaginationComponent],
  templateUrl: './conexiones.html',
  styleUrl: './conexiones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Conexiones implements OnInit {
  private readonly sessionsService = inject(ConnectionSessionsService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub: Subscription | null = null;

  readonly sessions = signal<ConnectionSession[]>([]);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly total = signal(0);
  readonly lastRefreshTime = signal<Date | null>(null);
  readonly selectedQuickFilter = signal<QuickFilterId>('all');
  readonly showAdvanced = signal(false);

  /** Filtros avanzados */
  readonly filterFrom = signal('');
  readonly filterTo = signal('');
  readonly filterEndReason = signal<ConnectionSessionEndReason | ''>('');
  readonly filterCommercialId = signal('');

  /** Agentes vistos (admin) para el selector */
  private readonly knownAgents = signal<
    Map<string, string>
  >(new Map());

  readonly isAdminView = computed(() =>
    this.userService.hasAnyRole(['admin', 'supervisor']),
  );

  readonly quickFilters: QuickFilter[] = [
    { id: 'all', label: 'Todas' },
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Esta semana' },
    { id: 'open', label: 'Activas' },
    { id: 'closed', label: 'Cerradas' },
  ];

  readonly paginationConfig = computed<PaginationConfig>(() => ({
    currentPage: this.page(),
    pageSize: this.pageSize(),
    totalCount: this.total(),
    pageSizeOptions: [10, 20, 50],
  }));

  readonly agentOptions = computed(() => {
    const entries = [...this.knownAgents().entries()];
    return entries
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  readonly activeFilterChips = computed(() => {
    const chips: { key: string; label: string; value: string }[] = [];
    if (this.filterFrom()) {
      chips.push({ key: 'from', label: 'Desde', value: this.filterFrom() });
    }
    if (this.filterTo()) {
      chips.push({ key: 'to', label: 'Hasta', value: this.filterTo() });
    }
    if (this.filterEndReason()) {
      chips.push({
        key: 'endReason',
        label: 'Motivo',
        value: this.reasonLabel(
          this.filterEndReason() as ConnectionSessionEndReason,
        ),
      });
    }
    if (this.isAdminView() && this.filterCommercialId()) {
      const id = this.filterCommercialId();
      chips.push({
        key: 'commercialId',
        label: 'Agente',
        value: this.knownAgents().get(id) || id.slice(0, 8),
      });
    }
    return chips;
  });

  private readonly nowTick = toSignal(interval(1000), { initialValue: 0 });

  readonly timeSinceLastRefresh = computed(() => {
    this.nowTick();
    const t = this.lastRefreshTime();
    if (!t) return '';
    const sec = Math.floor((Date.now() - t.getTime()) / 1000);
    if (sec < 5) return 'ahora';
    if (sec < 60) return `hace ${sec} seg`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `hace ${min} min`;
    return `hace ${Math.floor(min / 60)} h`;
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.loadSub?.unsubscribe());
    this.loadSessions();
  }

  onQuickFilterSelect(id: QuickFilterId): void {
    this.selectedQuickFilter.set(id);
    this.page.set(1);
    this.loadSessions();
  }

  onRefresh(): void {
    this.loadSessions(true);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadSessions();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.loadSessions();
  }

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
  }

  closeAdvanced(): void {
    this.showAdvanced.set(false);
  }

  onAdvancedBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeAdvanced();
    }
  }

  applyAdvancedFilters(): void {
    this.page.set(1);
    this.showAdvanced.set(false);
    this.loadSessions();
  }

  clearAdvancedFilters(): void {
    this.filterFrom.set('');
    this.filterTo.set('');
    this.filterEndReason.set('');
    this.filterCommercialId.set('');
    this.selectedQuickFilter.set('all');
    this.page.set(1);
    this.showAdvanced.set(false);
    this.loadSessions();
  }

  onRemoveFilterChip(key: string): void {
    switch (key) {
      case 'from':
        this.filterFrom.set('');
        break;
      case 'to':
        this.filterTo.set('');
        break;
      case 'endReason':
        this.filterEndReason.set('');
        break;
      case 'commercialId':
        this.filterCommercialId.set('');
        break;
    }
    this.page.set(1);
    this.loadSessions();
  }

  agentLabel(session: ConnectionSession): string {
    return (
      session.commercialDisplayName ||
      this.knownAgents().get(session.commercialId) ||
      `Agente · ${session.commercialId.slice(0, 8)}`
    );
  }

  formatDateTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDuration(ms: number | null, endedAt: string | null): string {
    if (endedAt == null) return 'En curso';
    if (ms == null) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  reasonLabel(reason: ConnectionSessionEndReason | null): string {
    switch (reason) {
      case 'manual':
        return 'Manual';
      case 'logout':
        return 'Logout';
      case 'browser_close':
        return 'Cierre navegador';
      case 'unknown':
        return 'Desconocido';
      default:
        return '—';
    }
  }

  isOpen(session: ConnectionSession): boolean {
    return session.endedAt == null;
  }

  private loadSessions(silent = false): void {
    if (silent) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);

    const query = this.buildQuery();

    this.loadSub?.unsubscribe();
    this.loadSub = this.sessionsService
      .listSessions(query)
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.refreshing.set(false);
        }),
      )
      .subscribe({
        next: (res) => {
          this.sessions.set(res.sessions ?? []);
          this.total.set(res.pagination?.total ?? 0);
          this.page.set(res.pagination?.page ?? query.page ?? 1);
          this.lastRefreshTime.set(new Date());
          this.mergeKnownAgents(res.sessions ?? []);
        },
        error: () => {
          this.error.set('No se pudieron cargar las conexiones');
          this.sessions.set([]);
          this.total.set(0);
        },
      });
  }

  private mergeKnownAgents(sessions: ConnectionSession[]): void {
    if (!this.isAdminView()) return;
    const next = new Map(this.knownAgents());
    for (const s of sessions) {
      const label =
        s.commercialDisplayName || `Agente · ${s.commercialId.slice(0, 8)}`;
      if (!next.has(s.commercialId) || s.commercialDisplayName) {
        next.set(s.commercialId, label);
      }
    }
    this.knownAgents.set(next);
  }

  private buildQuery(): ConnectionSessionsQuery {
    const query: ConnectionSessionsQuery = {
      page: this.page(),
      limit: this.pageSize(),
    };

    const quick = this.selectedQuickFilter();
    const now = new Date();

    if (quick === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      query.from = start.toISOString();
    } else if (quick === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // lunes
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      query.from = start.toISOString();
    } else if (quick === 'open') {
      query.status = 'open';
    } else if (quick === 'closed') {
      query.status = 'closed';
    }

    // Avanzados pisan/complementan chips de fecha si hay valores
    if (this.filterFrom()) {
      query.from = new Date(this.filterFrom()).toISOString();
    }
    if (this.filterTo()) {
      const end = new Date(this.filterTo());
      end.setHours(23, 59, 59, 999);
      query.to = end.toISOString();
    }
    if (this.filterEndReason()) {
      query.endReason = this.filterEndReason() as ConnectionSessionEndReason;
    }
    if (this.isAdminView() && this.filterCommercialId()) {
      query.commercialId = this.filterCommercialId();
    }

    return query;
  }
}
