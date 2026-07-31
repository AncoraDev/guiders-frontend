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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { UserService } from '@guiders-frontend/auth/data-access/session';
import {
  PlatformAssignableRole,
  PlatformCompaniesService,
  PlatformCompanySummary,
  PlatformUser,
  PlatformUsersSummary,
} from '@guiders-frontend/platform-companies-service';

type QuickFilterId =
  | 'all'
  | 'active'
  | 'inactive'
  | 'admin'
  | 'commercial'
  | 'supervisor'
  | 'superadmin';

type PanelMode = 'create' | 'edit';

interface RoleOption {
  id: PlatformAssignableRole;
  label: string;
}

@Component({
  selector: 'lib-platform-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './platform-users.html',
  styleUrl: './platform-users.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformUsers implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub: Subscription | null = null;
  private mutateSub: Subscription | null = null;

  readonly users = signal<PlatformUser[]>([]);
  readonly companies = signal<PlatformCompanySummary[]>([]);
  readonly summary = signal<PlatformUsersSummary | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly search = signal('');
  readonly roleFilter = signal<QuickFilterId>('all');
  readonly companyFilter = signal<string>('all');

  readonly panelOpen = signal(false);
  readonly panelMode = signal<PanelMode>('create');
  readonly editingUserId = signal<string | null>(null);
  readonly formCompanyId = signal('');
  readonly formFirstName = signal('');
  readonly formLastName = signal('');
  readonly formName = signal('');
  readonly formEmail = signal('');
  readonly formPhone = signal('');
  readonly formPassword = signal('');
  readonly formRoles = signal<PlatformAssignableRole[]>(['commercial']);
  readonly formError = signal<string | null>(null);
  readonly formRolesLocked = signal(false);

  readonly roleOptions: RoleOption[] = [
    { id: 'admin', label: 'Admin' },
    { id: 'commercial', label: 'Comercial' },
    { id: 'supervisor', label: 'Supervisor' },
  ];

  readonly companyNameById = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.companies()) {
      map.set(c.id, c.companyName);
    }
    return map;
  });

  readonly panelTitle = computed(() =>
    this.panelMode() === 'create' ? 'Nuevo usuario' : 'Editar usuario',
  );

  private readonly currentKeycloakId = computed(
    () => this.userService.currentUser()?.sub ?? null,
  );

  private readonly currentEmail = computed(
    () => this.userService.currentUser()?.email ?? null,
  );

  readonly filtered = computed(() => {
    let list = this.users();
    const role = this.roleFilter();
    const companyId = this.companyFilter();
    const q = this.search().trim().toLowerCase();

    if (role === 'active') list = list.filter((u) => u.isActive);
    else if (role === 'inactive') list = list.filter((u) => !u.isActive);
    else if (role !== 'all') {
      list = list.filter((u) => u.roles?.includes(role));
    }

    if (companyId !== 'all') {
      list = list.filter((u) => u.companyId === companyId);
    }

    if (q) {
      const names = this.companyNameById();
      list = list.filter((u) => {
        const companyName = names.get(u.companyId)?.toLowerCase() ?? '';
        return (
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          companyName.includes(q) ||
          u.roles.some((r) => r.toLowerCase().includes(q))
        );
      });
    }

    return list;
  });

  readonly roleChips = computed(() => {
    const s = this.summary();
    const byRole = s?.byRole ?? {};
    return [
      { id: 'all' as const, label: 'Todos', count: s?.total ?? 0 },
      { id: 'active' as const, label: 'Activos', count: s?.active ?? 0 },
      { id: 'inactive' as const, label: 'Inactivos', count: s?.inactive ?? 0 },
      {
        id: 'superadmin' as const,
        label: 'Superadmin',
        count: byRole['superadmin'] ?? 0,
      },
      { id: 'admin' as const, label: 'Admin', count: byRole['admin'] ?? 0 },
      {
        id: 'supervisor' as const,
        label: 'Supervisor',
        count: byRole['supervisor'] ?? 0,
      },
      {
        id: 'commercial' as const,
        label: 'Comercial',
        count: byRole['commercial'] ?? 0,
      },
    ];
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.mutateSub?.unsubscribe();
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.loadSub?.unsubscribe();
    this.loadSub = forkJoin({
      users: this.platform.listUsers(),
      companies: this.platform.listCompanies(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ users, companies }) => {
          this.users.set(users.users);
          this.summary.set(users.summary);
          this.companies.set(companies);
        },
        error: (err: unknown) => this.error.set(this.mapError(err)),
      });
  }

  companyName(companyId: string): string {
    return this.companyNameById().get(companyId) ?? companyId.slice(0, 8);
  }

  roleLabel(role: string): string {
    const map: Record<string, string> = {
      superadmin: 'Superadmin',
      admin: 'Admin',
      supervisor: 'Supervisor',
      commercial: 'Comercial',
    };
    return map[role] ?? role;
  }

  isCurrentUser(user: PlatformUser): boolean {
    const kc = this.currentKeycloakId();
    if (kc && user.keycloakId && user.keycloakId === kc) return true;
    const email = this.currentEmail();
    return !!email && user.email?.toLowerCase() === email.toLowerCase();
  }

  hasSuperadmin(user: PlatformUser): boolean {
    return user.roles?.includes('superadmin') ?? false;
  }

  isRoleSelected(role: PlatformAssignableRole): boolean {
    return this.formRoles().includes(role);
  }

  toggleRole(role: PlatformAssignableRole): void {
    if (this.formRolesLocked()) return;
    const current = this.formRoles();
    if (current.includes(role)) {
      if (current.length === 1) return;
      this.formRoles.set(current.filter((r) => r !== role));
    } else {
      this.formRoles.set([...current, role]);
    }
  }

  openCreatePanel(): void {
    const preferred =
      this.companyFilter() !== 'all'
        ? this.companyFilter()
        : (this.companies()[0]?.id ?? '');
    this.panelMode.set('create');
    this.editingUserId.set(null);
    this.formCompanyId.set(preferred);
    this.formFirstName.set('');
    this.formLastName.set('');
    this.formName.set('');
    this.formEmail.set('');
    this.formPhone.set('');
    this.formPassword.set('');
    this.formRoles.set(['commercial']);
    this.formRolesLocked.set(false);
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  openEditPanel(user: PlatformUser): void {
    if (this.isCurrentUser(user)) return;
    this.panelMode.set('edit');
    this.editingUserId.set(user.id);
    this.formCompanyId.set(user.companyId);
    this.formFirstName.set('');
    this.formLastName.set('');
    this.formName.set(user.name || '');
    this.formEmail.set(user.email);
    this.formPhone.set('');
    this.formPassword.set('');
    const locked = this.hasSuperadmin(user);
    this.formRolesLocked.set(locked);
    if (locked) {
      this.formRoles.set([]);
    } else {
      const roles = (user.roles ?? []).filter(
        (r): r is PlatformAssignableRole =>
          r === 'admin' || r === 'commercial' || r === 'supervisor',
      );
      this.formRoles.set(roles.length ? roles : ['commercial']);
    }
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    if (this.saving()) return;
    this.panelOpen.set(false);
    this.formError.set(null);
  }

  submitPanel(): void {
    const email = this.formEmail().trim();
    const companyId = this.formCompanyId();
    const roles = this.formRoles();

    if (this.panelMode() === 'create') {
      const firstName = this.formFirstName().trim();
      const lastName = this.formLastName().trim();
      const phone = this.formPhone().trim();
      const temporaryPassword = this.formPassword();

      if (!companyId) {
        this.formError.set('Selecciona una company');
        return;
      }
      if (!firstName || !lastName) {
        this.formError.set('Nombre y apellidos son obligatorios');
        return;
      }
      if (!email) {
        this.formError.set('El email es obligatorio');
        return;
      }
      if (!temporaryPassword || temporaryPassword.trim().length < 6) {
        this.formError.set(
          'La contraseña temporal debe tener al menos 6 caracteres',
        );
        return;
      }
      if (roles.length === 0) {
        this.formError.set('Debes asignar al menos un rol');
        return;
      }

      this.formError.set(null);
      this.saving.set(true);
      this.mutateSub?.unsubscribe();
      this.mutateSub = this.platform
        .createUser({
          companyId,
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          roles,
          temporaryPassword,
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.panelOpen.set(false);
            this.load();
          },
          error: (err: unknown) => {
            this.formError.set(
              this.extractError(err, 'No se pudo crear el usuario'),
            );
          },
        });
      return;
    }

    const name = this.formName().trim();
    const userId = this.editingUserId();
    if (!userId) return;

    if (!name) {
      this.formError.set('El nombre es obligatorio');
      return;
    }

    if (!this.formRolesLocked() && roles.length === 0) {
      this.formError.set('Debes asignar al menos un rol');
      return;
    }

    this.formError.set(null);
    this.saving.set(true);
    this.mutateSub?.unsubscribe();
    this.mutateSub = this.platform
      .updateUser(
        userId,
        this.formRolesLocked() ? { name } : { name, roles },
      )
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.panelOpen.set(false);
          this.load();
        },
        error: (err: unknown) => {
          this.formError.set(
            this.extractError(err, 'No se pudo actualizar el usuario'),
          );
        },
      });
  }

  onToggleActive(user: PlatformUser): void {
    if (this.isCurrentUser(user)) return;

    const nextActive = !user.isActive;
    const msg = nextActive
      ? `¿Reactivar a ${user.name || user.email}?`
      : `¿Desactivar a ${user.name || user.email}? No podrá iniciar sesión mientras esté inactivo.`;
    if (!confirm(msg)) return;

    this.mutateSub?.unsubscribe();
    this.mutateSub = this.platform
      .setUserActive(user.id, { isActive: nextActive })
      .subscribe({
        next: () => this.load(),
        error: (err: unknown) => {
          this.error.set(
            this.extractError(err, 'No se pudo cambiar el estado del usuario'),
          );
        },
      });
  }

  onDelete(user: PlatformUser): void {
    if (this.isCurrentUser(user)) return;

    const ok = confirm(
      `¿Eliminar permanentemente a ${user.name || user.email}?\n\nEsta acción es irreversible: se borrará de Guiders y de Keycloak.`,
    );
    if (!ok) return;

    this.mutateSub?.unsubscribe();
    this.mutateSub = this.platform.deleteUser(user.id).subscribe({
      next: () => this.load(),
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

  private mapError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403 || err.status === 401) {
        return 'No tienes permisos de plataforma (superadmin).';
      }
      return err.error?.message || err.message || 'Error al cargar usuarios';
    }
    return 'Error al cargar usuarios';
  }
}
