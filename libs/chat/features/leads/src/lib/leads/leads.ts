import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { interval, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Avatar } from '@guiders-frontend/avatar';
import {
  PaginationComponent,
  type PaginationConfig,
} from '@guiders-frontend/pagination';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { getContactDisplayName } from '@guiders-frontend/visitor-display-name';
import {
  LeadCaptureTrace,
  LeadContactData,
  LeadFollowUpStatus,
  readLeadCaptureTrace,
  resolveFollowUpStatus,
} from '@guiders-frontend/shared/types';

export type LeadsStatusFilter = LeadFollowUpStatus;
export type LeadsOriginFilter = 'all' | 'assistant' | 'manual';
export type LeadsDateRange = '7d' | 'month' | 'all';

export interface LeadRow {
  contact: LeadContactData;
  displayName: string;
  capture: LeadCaptureTrace | null;
  fromAssistant: boolean;
  chatId: string | null;
  previewAnswers: LeadCaptureTrace['answers'];
  followUpStatus: LeadFollowUpStatus;
  haystack: string;
}

interface StatusChip {
  id: LeadsStatusFilter;
  label: string;
}

interface OriginChip {
  id: LeadsOriginFilter;
  label: string;
}

interface DateChip {
  id: LeadsDateRange;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Inbox de todos los leads captados: asistente, formulario o ficha.
 * El comercial los trata aquí; el chat sigue en Atención.
 */
@Component({
  selector: 'lib-leads',
  standalone: true,
  imports: [CommonModule, RouterLink, Avatar, PaginationComponent],
  templateUrl: './leads.html',
  styleUrl: './leads.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Leads implements OnInit {
  private readonly leadContactService = inject(LeadContactService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub: Subscription | null = null;

  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly statusFilter = signal<LeadsStatusFilter>('pending');
  readonly originFilter = signal<LeadsOriginFilter>('all');
  readonly dateRange = signal<LeadsDateRange>('all');
  readonly expandedId = signal<string | null>(null);
  readonly updatingId = signal<string | null>(null);
  readonly lastRefreshTime = signal<Date | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);

  private readonly rows = signal<LeadRow[]>([]);

  readonly statusChips: StatusChip[] = [
    { id: 'pending', label: 'Por tratar' },
    { id: 'contacted', label: 'Contactados' },
    { id: 'dismissed', label: 'Descartados' },
  ];

  readonly originChips: OriginChip[] = [
    { id: 'all', label: 'Todos' },
    { id: 'assistant', label: 'Automáticos' },
    { id: 'manual', label: 'Comercial' },
  ];

  readonly dateChips: DateChip[] = [
    { id: '7d', label: 'Últimos 7 días' },
    { id: 'month', label: 'Este mes' },
    { id: 'all', label: 'Todo' },
  ];

  readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const range = this.dateRange();
    const origin = this.originFilter();
    const status = this.statusFilter();

    return this.rows().filter((row) => {
      if (row.followUpStatus !== status) return false;
      if (origin === 'assistant' && !row.fromAssistant) return false;
      if (origin === 'manual' && row.fromAssistant) return false;
      if (!this.inDateRange(row.contact.extractedAt, range)) return false;
      return !term || row.haystack.includes(term);
    });
  });

  readonly statusCounts = computed(() => {
    const origin = this.originFilter();
    const range = this.dateRange();
    const term = this.search().trim().toLowerCase();
    const counts = { pending: 0, contacted: 0, dismissed: 0 };

    for (const row of this.rows()) {
      if (origin === 'assistant' && !row.fromAssistant) continue;
      if (origin === 'manual' && row.fromAssistant) continue;
      if (!this.inDateRange(row.contact.extractedAt, range)) continue;
      if (term && !row.haystack.includes(term)) continue;
      counts[row.followUpStatus] += 1;
    }
    return counts;
  });

  readonly hasAnyRows = computed(() => this.rows().length > 0);

  readonly paginationConfig = computed<PaginationConfig>(() => ({
    currentPage: this.page(),
    pageSize: this.pageSize(),
    totalCount: this.filteredRows().length,
    pageSizeOptions: [10, 20, 50],
  }));

  readonly pagedRows = computed(() => {
    const all = this.filteredRows();
    const start = (this.page() - 1) * this.pageSize();
    return all.slice(start, start + this.pageSize());
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
    this.reload();
  }

  selectStatus(status: LeadsStatusFilter): void {
    if (this.statusFilter() === status) return;
    this.statusFilter.set(status);
    this.expandedId.set(null);
    this.page.set(1);
  }

  selectOrigin(origin: LeadsOriginFilter): void {
    if (this.originFilter() === origin) return;
    this.originFilter.set(origin);
    this.expandedId.set(null);
    this.page.set(1);
  }

  selectDateRange(range: LeadsDateRange): void {
    if (this.dateRange() === range) return;
    this.dateRange.set(range);
    this.page.set(1);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onRefresh(): void {
    this.reload(true);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.expandedId.set(null);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.expandedId.set(null);
  }

  toggleRow(row: LeadRow): void {
    this.expandedId.update((id) =>
      id === row.contact.id ? null : row.contact.id
    );
  }

  markFollowUp(row: LeadRow, status: LeadFollowUpStatus): void {
    if (this.updatingId()) return;
    this.updatingId.set(row.contact.visitorId);
    this.leadContactService
      .updateFollowUp(row.contact.visitorId, status)
      .pipe(
        finalize(() => this.updatingId.set(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => this.reload(true),
        error: () => this.error.set('No se pudo actualizar el seguimiento'),
      });
  }

  formatDateTime(value: string | null | undefined): string {
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

  emptyCopy(): string {
    const status = this.statusFilter();
    if (status === 'pending') {
      return 'No hay leads por tratar con estos filtros.';
    }
    if (status === 'contacted') {
      return 'Aún no has marcado ningún lead como contactado.';
    }
    return 'No hay leads descartados con estos filtros.';
  }

  reload(silent = false): void {
    if (silent) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);

    this.loadSub?.unsubscribe();
    this.loadSub = this.leadContactService
      .listContactData()
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.refreshing.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (contacts) => {
          this.rows.set(this.toRows(contacts));
          this.lastRefreshTime.set(new Date());
          const maxPage = Math.max(
            1,
            Math.ceil(this.filteredRows().length / this.pageSize()) || 1
          );
          if (this.page() > maxPage) this.page.set(maxPage);
        },
        error: () => {
          this.error.set('No se pudieron cargar los leads');
          this.rows.set([]);
        },
      });
  }

  private inDateRange(iso: string, range: LeadsDateRange): boolean {
    if (range === 'all') return true;
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return false;
    if (range === '7d') return at >= Date.now() - 7 * DAY_MS;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return at >= start.getTime();
  }

  private toRows(contacts: LeadContactData[]): LeadRow[] {
    return contacts
      .map((contact) => {
        const capture = readLeadCaptureTrace(contact);
        const displayName = getContactDisplayName(contact) ?? 'Sin nombre';
        const followUpStatus = resolveFollowUpStatus(contact);
        return {
          contact,
          displayName,
          capture,
          fromAssistant: capture?.capturedWithoutAgent === true,
          chatId: contact.extractedFromChatId ?? null,
          previewAnswers: (capture?.answers ?? []).slice(0, 2),
          followUpStatus,
          haystack: [
            displayName,
            contact.email,
            contact.telefono,
            contact.poblacion,
            contact.alias,
            ...(capture?.answers.map((answer) => answer.answer) ?? []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.contact.extractedAt).getTime() -
          new Date(a.contact.extractedAt).getTime()
      );
  }
}
