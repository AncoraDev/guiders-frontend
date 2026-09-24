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
import { finalize } from 'rxjs/operators';
import {
  PlatformCompaniesService,
  PlatformProvider,
} from '@guiders-frontend/platform-companies-service';

@Component({
  selector: 'lib-providers',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './providers.html',
  styleUrl: './providers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Providers implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);

  readonly providers = signal<PlatformProvider[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly deletingId = signal<string | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.providers();
    if (!q) return list;
    return list.filter(
      (provider) =>
        provider.name.toLowerCase().includes(q) ||
        provider.demoAdminEmail.toLowerCase().includes(q) ||
        provider.id.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform
      .listProviders()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (rows) => this.providers.set(rows),
        error: (err: unknown) =>
          this.error.set(this.mapError(err, 'Error al cargar proveedores')),
      });
  }

  onDelete(provider: PlatformProvider): void {
    const ok = confirm(
      `¿Eliminar ${provider.name}?\n\nSu token dejará de valer. Si tiene clientes, hay que eliminarlos antes.`,
    );
    if (!ok) return;

    this.deletingId.set(provider.id);
    this.error.set(null);
    this.platform
      .deleteProvider(provider.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.load(),
        error: (err: unknown) =>
          this.error.set(this.mapError(err, 'No se pudo eliminar el proveedor')),
      });
  }

  private mapError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403 || err.status === 401) {
        return 'No tienes permisos de plataforma (superadmin).';
      }
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
      return err.message || fallback;
    }
    return fallback;
  }
}
