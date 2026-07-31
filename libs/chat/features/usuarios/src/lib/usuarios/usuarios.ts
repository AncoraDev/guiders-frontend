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
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import { Avatar } from '@guiders-frontend/avatar';
import { Badge } from '@guiders-frontend/badge';
import {
  PaginationComponent,
  type PaginationConfig,
} from '@guiders-frontend/pagination';
import {
  CompanyUsersService,
  CompanyUser,
  AssignableCompanyRole,
} from '@guiders-frontend/company-users-service';

type QuickFilterId = 'all' | 'active' | 'inactive' | 'admin' | 'commercial';
type PanelMode = 'create' | 'edit';

interface QuickFilter {
  id: QuickFilterId;
  label: string;
}

interface RoleOption {
  id: AssignableCompanyRole;
  label: string;
}

@Component({
  selector: 'lib-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, Avatar, Badge, PaginationComponent],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Usuarios implements OnInit {
  private readonly usersService = inject(CompanyUsersService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub: Subscription | null = null;
  private mutateSub: Subscription | null = null;

  readonly allUsers = signal<CompanyUser[]>([]);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly selectedQuickFilter = signal<QuickFilterId>('all');
  readonly searchQuery = signal('');

  readonly panelOpen = signal(false);
  readonly panelMode = signal<PanelMode>('create');
  readonly editingUserId = signal<string | null>(null);
  readonly formName = signal('');
  readonly formEmail = signal('');
  readonly formRoles = signal<AssignableCompanyRole[]>(['commercial']);

  readonly quickFilters: QuickFilter[] = [
    { id: 'all', label: 'Todos' },
    { id: 'active', label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
    { id: 'admin', label: 'Admins' },
    { id: 'commercial', label: 'Comerciales' },
  ];

  readonly roleOptions: RoleOption[] = [
    { id: 'admin', label: 'Admin' },
    { id: 'commercial', label: 'Comercial' },
    { id: 'supervisor', label: 'Supervisor' },
  ];

  private readonly currentKeycloakId = computed(
    () => this.userService.currentUser()?.sub ?? null,
  );

  private readonly currentEmail = computed(
    () => this.userService.currentUser()?.email ?? null,
  );

  readonly panelTitle = computed(() =>
    this.panelMode() === 'create' ? 'Nuevo usuario' : 'Editar usuario',
  );

  readonly filteredUsers = computed(() => {
    let list = this.allUsers();
    const filter = this.selectedQuickFilter();
    const q = this.searchQuery().trim().toLowerCase();

    if (filter === 'active') {
      list = list.filter((u) => u.isActive);
    } else if (filter === 'inactive') {
      list = list.filter((u) => !u.isActive);
    } else if (filter === 'admin') {
      list = list.filter((u) => u.roles?.includes('admin'));
    } else if (filter === 'commercial') {
      list = list.filter((u) => u.roles?.includes('commercial'));
    }

    if (q) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email, 'es'),
    );
  });

  readonly pagedUsers = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filteredUsers().slice(start, start + this.pageSize());
  });

  readonly paginationConfig = computed<PaginationConfig>(() => ({
    currentPage: this.page(),
    pageSize: this.pageSize(),
    totalCount: this.filteredUsers().length,
    pageSizeOptions: [10, 20, 50],
  }));

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.mutateSub?.unsubscribe();
    });
    this.loadUsers();
  }

  onQuickFilterSelect(id: QuickFilterId): void {
    this.selectedQuickFilter.set(id);
    this.page.set(1);
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  onRefresh(): void {
    this.loadUsers(true);
  }

  onPageChange(page: number): void {
    this.page.set(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  isCurrentUser(user: CompanyUser): boolean {
    const kc = this.currentKeycloakId();
    if (kc && user.keycloakId && user.keycloakId === kc) return true;
    const email = this.currentEmail();
    return !!email && user.email === email;
  }

  roleLabels(roles: string[]): string[] {
    const map: Record<string, string> = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      commercial: 'Comercial',
      superadmin: 'Superadmin',
    };
    return (roles ?? []).map((r) => map[r] || r);
  }

  formatDate(value: string | null | undefined): string {
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

  isRoleSelected(role: AssignableCompanyRole): boolean {
    return this.formRoles().includes(role);
  }

  toggleRole(role: AssignableCompanyRole): void {
    const current = this.formRoles();
    if (current.includes(role)) {
      if (current.length === 1) return;
      this.formRoles.set(current.filter((r) => r !== role));
    } else {
      this.formRoles.set([...current, role]);
    }
  }

  openCreatePanel(): void {
    this.panelMode.set('create');
    this.editingUserId.set(null);
    this.formName.set('');
    this.formEmail.set('');
    this.formRoles.set(['commercial']);
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  openEditPanel(user: CompanyUser): void {
    if (this.isCurrentUser(user)) return;
    this.panelMode.set('edit');
    this.editingUserId.set(user.id);
    this.formName.set(user.name || '');
    this.formEmail.set(user.email);
    const roles = (user.roles ?? []).filter((r): r is AssignableCompanyRole =>
      ['admin', 'commercial', 'supervisor'].includes(r),
    );
    this.formRoles.set(roles.length ? roles : ['commercial']);
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    if (this.saving()) return;
    this.panelOpen.set(false);
    this.formError.set(null);
  }

  submitPanel(): void {
    const name = this.formName().trim();
    const email = this.formEmail().trim();
    const roles = this.formRoles();

    if (!name) {
      this.formError.set('El nombre es obligatorio');
      return;
    }
    if (this.panelMode() === 'create' && !email) {
      this.formError.set('El email es obligatorio');
      return;
    }
    if (roles.length === 0) {
      this.formError.set('Debes asignar al menos un rol');
      return;
    }

    this.formError.set(null);
    this.saving.set(true);
    this.mutateSub?.unsubscribe();

    if (this.panelMode() === 'create') {
      this.mutateSub = this.usersService
        .createCompanyUser({ name, email, roles })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.panelOpen.set(false);
            this.loadUsers(true);
          },
          error: (err: unknown) => {
            this.formError.set(this.extractError(err, 'No se pudo crear el usuario'));
          },
        });
      return;
    }

    const userId = this.editingUserId();
    if (!userId) return;

    this.mutateSub = this.usersService
      .updateCompanyUser(userId, { name, roles })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.panelOpen.set(false);
          this.loadUsers(true);
        },
        error: (err: unknown) => {
          this.formError.set(
            this.extractError(err, 'No se pudo actualizar el usuario'),
          );
        },
      });
  }

  onToggleActive(user: CompanyUser): void {
    if (this.isCurrentUser(user)) return;

    const nextActive = !user.isActive;
    const msg = nextActive
      ? `¿Reactivar a ${user.name || user.email}?`
      : `¿Desactivar a ${user.name || user.email}? No podrá iniciar sesión mientras esté inactivo.`;
    if (!confirm(msg)) return;

    this.mutateSub?.unsubscribe();
    this.mutateSub = this.usersService
      .setCompanyUserActive(user.id, { isActive: nextActive })
      .subscribe({
        next: () => this.loadUsers(true),
        error: (err: unknown) => {
          this.error.set(
            this.extractError(err, 'No se pudo cambiar el estado del usuario'),
          );
        },
      });
  }

  onDelete(user: CompanyUser): void {
    if (this.isCurrentUser(user)) return;

    const ok = confirm(
      `¿Eliminar permanentemente a ${user.name || user.email}?\n\nEsta acción es irreversible: se borrará de Guiders y de Keycloak.`,
    );
    if (!ok) return;

    this.mutateSub?.unsubscribe();
    this.mutateSub = this.usersService.deleteCompanyUser(user.id).subscribe({
      next: () => this.loadUsers(true),
      error: (err: unknown) => {
        this.error.set(this.extractError(err, 'No se pudo eliminar el usuario'));
      },
    });
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string | string[] } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object') {
        if (typeof body.message === 'string' && body.message.trim()) {
          return body.message;
        }
        if (Array.isArray(body.message) && body.message[0]) {
          return String(body.message[0]);
        }
      }
    }
    return fallback;
  }

  private loadUsers(silent = false): void {
    if (silent) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);

    this.loadSub?.unsubscribe();
    this.loadSub = this.usersService
      .listCompanyUsers()
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.refreshing.set(false);
        }),
      )
      .subscribe({
        next: (res) => {
          this.allUsers.set(res.users ?? []);
        },
        error: () => {
          this.error.set('No se pudieron cargar los usuarios');
          this.allUsers.set([]);
        },
      });
  }
}
