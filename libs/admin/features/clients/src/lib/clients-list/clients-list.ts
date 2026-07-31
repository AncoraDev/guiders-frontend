import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  PlatformCompaniesService,
  PlatformCompanySummary,
  PlatformUser,
} from '@guiders-frontend/platform-companies-service';

export interface CompanyUserRoleCount {
  role: string;
  label: string;
  count: number;
}

export interface CompanyUserStats {
  total: number;
  byRole: CompanyUserRoleCount[];
}

const ROLE_ORDER = ['admin', 'commercial', 'supervisor', 'superadmin'] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  commercial: 'Comercial',
  supervisor: 'Supervisor',
  superadmin: 'Superadmin',
};

@Component({
  selector: 'lib-clients-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './clients-list.html',
  styleUrl: './clients-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsList implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);

  readonly companies = signal<PlatformCompanySummary[]>([]);
  readonly users = signal<PlatformUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');

  private readonly statsByCompanyId = computed(() => {
    const map = new Map<string, CompanyUserStats>();
    for (const user of this.users()) {
      const current = map.get(user.companyId) ?? { total: 0, byRole: [] };
      current.total += 1;

      const counts = new Map(
        current.byRole.map((r) => [r.role, r.count] as const),
      );
      for (const role of user.roles ?? []) {
        counts.set(role, (counts.get(role) ?? 0) + 1);
      }
      current.byRole = this.toRoleCounts(counts);
      map.set(user.companyId, current);
    }
    return map;
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.companies();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.domains.some((d) => d.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      companies: this.platform.listCompanies(),
      users: this.platform.listUsers(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ companies, users }) => {
          this.companies.set(companies);
          this.users.set(users.users ?? []);
        },
        error: (err: unknown) => {
          this.error.set(this.mapError(err));
        },
      });
  }

  userStats(companyId: string): CompanyUserStats {
    return (
      this.statsByCompanyId().get(companyId) ?? { total: 0, byRole: [] }
    );
  }

  private toRoleCounts(counts: Map<string, number>): CompanyUserRoleCount[] {
    const known = ROLE_ORDER.filter((role) => (counts.get(role) ?? 0) > 0).map(
      (role) => ({
        role,
        label: ROLE_LABELS[role] ?? role,
        count: counts.get(role) ?? 0,
      }),
    );
    const extras = [...counts.entries()]
      .filter(
        ([role, count]) =>
          count > 0 && !(ROLE_ORDER as readonly string[]).includes(role),
      )
      .map(([role, count]) => ({
        role,
        label: ROLE_LABELS[role] ?? role,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return [...known, ...extras];
  }

  private mapError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403 || err.status === 401) {
        return 'No tienes permisos de plataforma (superadmin).';
      }
      return err.error?.message || err.message || 'Error al cargar clientes';
    }
    return 'Error al cargar clientes';
  }
}
