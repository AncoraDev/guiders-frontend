import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LeadsService } from '@guiders-frontend/leads-service';
import {
  LeadCarsSyncRecord,
  SyncStatus,
  LeadCarsCompanyConfig,
} from '@guiders-frontend/shared/types';
import { Badge } from '@guiders-frontend/badge';

type LeadFilter = 'all' | SyncStatus;

@Component({
  selector: 'guiders-leads-list',
  imports: [CommonModule, FormsModule, Badge],
  templateUrl: './leads-list.html',
  styleUrl: './leads-list.scss',
})
export class LeadsList implements OnInit {
  private readonly leadsService = inject(LeadsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  // State
  readonly records = signal<LeadCarsSyncRecord[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly activeFilter = signal<LeadFilter>('all');
  readonly searchQuery = signal<string>('');
  readonly expandedRowId = signal<string | null>(null);

  // CRM config state
  readonly crmConfig = signal<LeadCarsCompanyConfig | null>(null);
  readonly crmConfigLoaded = signal<boolean>(false);
  readonly hasCrmConfig = computed(() => this.crmConfig() !== null);

  // Stats
  readonly totalCount = computed(() => this.records().length);
  readonly syncedCount = computed(
    () => this.records().filter((r) => r.status === 'synced').length
  );
  readonly pendingCount = computed(
    () => this.records().filter((r) => r.status === 'pending').length
  );
  readonly failedCount = computed(
    () => this.records().filter((r) => r.status === 'failed').length
  );

  // Filtered records
  readonly filteredRecords = computed(() => {
    let result = this.records();
    const filter = this.activeFilter();
    const query = this.searchQuery().toLowerCase().trim();

    if (filter !== 'all') {
      result = result.filter((r) => r.status === filter);
    }

    if (query) {
      result = result.filter((r) => {
        const cd = r.contactData;
        if (!cd) return r.visitorId.toLowerCase().includes(query);
        return (
          cd.alias?.toLowerCase().includes(query) ||
          cd.nombre?.toLowerCase().includes(query) ||
          cd.apellidos?.toLowerCase().includes(query) ||
          cd.email?.toLowerCase().includes(query) ||
          cd.telefono?.toLowerCase().includes(query) ||
          r.visitorId.toLowerCase().includes(query) ||
          r.externalLeadId?.toLowerCase().includes(query)
        );
      });
    }

    return result;
  });

  readonly hasRecords = computed(() => this.filteredRecords().length > 0);

  ngOnInit(): void {
    this.leadsService.loading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.loading.set(v));

    this.leadsService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.error.set(v));

    this.leadsService.syncRecords$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.records.set(v));

    this.leadsService.config$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((config) => {
        this.crmConfig.set(config);
        this.crmConfigLoaded.set(true);
      });

    this.loadCrmConfig();
    this.loadRecords();
  }

  private loadCrmConfig(): void {
    this.leadsService
      .getConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  goToCrmSetup(): void {
    this.router.navigate(['/integrations/leadcars']);
  }

  loadRecords(): void {
    this.leadsService
      .getSyncRecords(false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  setFilter(filter: LeadFilter): void {
    this.activeFilter.set(filter);
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  toggleRow(id: string): void {
    this.expandedRowId.set(this.expandedRowId() === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expandedRowId() === id;
  }

  // Helpers
  getDisplayName(record: LeadCarsSyncRecord): string {
    const cd = record.contactData;
    if (!cd) return '-';
    if (cd.alias?.trim()) return cd.alias.trim();
    const parts = [cd.nombre, cd.apellidos].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '-';
  }

  getInitials(record: LeadCarsSyncRecord): string {
    const cd = record.contactData;
    if (!cd) return '?';
    if (cd.alias?.trim()) {
      return cd.alias.trim().slice(0, 2).toUpperCase();
    }
    const nombre = cd.nombre?.[0] ?? '';
    const apellido = cd.apellidos?.[0] ?? '';
    return (nombre + apellido).toUpperCase() || '?';
  }

  hasContactData(record: LeadCarsSyncRecord): boolean {
    const cd = record.contactData;
    return !!(cd && (cd.alias || cd.nombre || cd.email || cd.telefono));
  }

  getStatusVariant(
    status: SyncStatus
  ): 'success' | 'warning' | 'danger' | 'info' {
    const map: Record<SyncStatus, 'success' | 'warning' | 'danger' | 'info'> = {
      synced: 'success',
      pending: 'warning',
      failed: 'danger',
      partial: 'info',
    };
    return map[status];
  }

  getStatusLabel(status: SyncStatus): string {
    const map: Record<SyncStatus, string> = {
      synced: 'Sincronizado',
      pending: 'Pendiente',
      failed: 'Fallido',
      partial: 'Parcial',
    };
    return map[status] || status;
  }

  getTemperatureVariant(
    temp: string | undefined
  ): 'info' | 'warning' | 'danger' | 'default' {
    if (temp === 'cold') return 'info';
    if (temp === 'warm') return 'warning';
    if (temp === 'hot') return 'danger';
    return 'default';
  }

  getTemperatureLabel(temp: string | undefined): string {
    if (temp === 'cold') return 'Frío';
    if (temp === 'warm') return 'Templado';
    if (temp === 'hot') return 'Caliente';
    return temp ?? '-';
  }

  getTemperature(record: LeadCarsSyncRecord): string | undefined {
    return record.metadata?.['temperature'] as string | undefined;
  }

  getCrmTypeLabel(type: string): string {
    if (type === 'leadcars') return 'LeadCars';
    return type;
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  truncateId(id: string): string {
    return id.length <= 10 ? id : `${id.substring(0, 8)}…`;
  }
}
