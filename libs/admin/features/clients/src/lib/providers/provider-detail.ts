import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import {
  PlatformCompaniesService,
  PlatformProvider,
} from '@guiders-frontend/platform-companies-service';

@Component({
  selector: 'lib-provider-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './provider-detail.html',
  styleUrl: './provider-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderDetail implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly provider = signal<PlatformProvider | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly regenerating = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveOk = signal(false);
  readonly tokenError = signal<string | null>(null);
  readonly copyFeedback = signal<string | null>(null);

  readonly formName = signal('');
  readonly formEmail = signal('');
  readonly formPassword = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('providerId');
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    this.platform
      .listProviders()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (rows) => {
          const found = rows.find((row) => row.id === id) ?? null;
          this.provider.set(found);
          if (!found) {
            this.error.set('Proveedor no encontrado');
            return;
          }
          this.formName.set(found.name);
          this.formEmail.set(found.demoAdminEmail);
          this.formPassword.set(found.demoAdminPassword);
        },
        error: (err: unknown) =>
          this.error.set(this.mapError(err, 'No se pudo cargar el proveedor')),
      });
  }

  save(): void {
    const current = this.provider();
    if (!current) return;
    const name = this.formName().trim();
    const demoAdminEmail = this.formEmail().trim().toLowerCase();
    const demoAdminPassword = this.formPassword();
    this.saveOk.set(false);
    this.saveError.set(null);
    if (!name || !demoAdminEmail || !demoAdminPassword) {
      this.saveError.set('Nombre, email y contraseña de la demo son obligatorios.');
      return;
    }
    if (demoAdminPassword.trim().length < 8) {
      this.saveError.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    this.saving.set(true);
    this.platform
      .renameProvider(current.id, { name, demoAdminEmail, demoAdminPassword })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.saveOk.set(true);
          this.load();
        },
        error: (err: unknown) =>
          this.saveError.set(this.mapError(err, 'No se pudo guardar el proveedor')),
      });
  }

  regenerate(): void {
    const current = this.provider();
    if (!current) return;
    const ok = confirm(
      `La clave actual de ${current.name} dejará de funcionar en la demo. ¿Generar otra?`,
    );
    if (!ok) return;
    this.tokenError.set(null);
    this.regenerating.set(true);
    this.platform
      .regenerateProviderToken(current.id)
      .pipe(finalize(() => this.regenerating.set(false)))
      .subscribe({
        next: () => this.load(),
        error: (err: unknown) =>
          this.tokenError.set(this.mapError(err, 'No se pudo regenerar el token')),
      });
  }

  onDelete(): void {
    const current = this.provider();
    if (!current) return;
    const ok = confirm(
      `¿Eliminar ${current.name}?\n\nSu token dejará de valer. Si tiene clientes, hay que eliminarlos antes.`,
    );
    if (!ok) return;
    this.deleting.set(true);
    this.platform
      .deleteProvider(current.id)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/proveedores']);
        },
        error: (err: unknown) =>
          this.error.set(this.mapError(err, 'No se pudo eliminar el proveedor')),
      });
  }

  async copy(value: string): Promise<void> {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    this.copyFeedback.set('Copiado');
  }

  statusLabel(status: string): string {
    if (status === 'active') return 'Activa';
    if (status === 'revoked') return 'Revocada';
    return status;
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
