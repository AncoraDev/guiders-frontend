import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { PlatformCompaniesService } from '@guiders-frontend/platform-companies-service';

@Component({
  selector: 'lib-provider-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './provider-create.html',
  styleUrl: './provider-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderCreate {
  private readonly platform = inject(PlatformCompaniesService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly demoAdminEmail = signal('');
  readonly demoAdminPassword = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    this.error.set(null);
    const name = this.name().trim();
    const demoAdminEmail = this.demoAdminEmail().trim().toLowerCase();
    const demoAdminPassword = this.demoAdminPassword();

    if (!name || !demoAdminEmail || !demoAdminPassword) {
      this.error.set('Nombre, email y contraseña de la demo son obligatorios.');
      return;
    }

    if (demoAdminPassword.trim().length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.saving.set(true);
    this.platform
      .createProvider({ name, demoAdminEmail, demoAdminPassword })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/proveedores', created.id]);
        },
        error: (err: unknown) => {
          this.error.set(this.mapError(err));
        },
      });
  }

  private mapError(err: unknown): string {
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
      return err.message || 'No se pudo crear el proveedor';
    }
    return 'No se pudo crear el proveedor';
  }
}
