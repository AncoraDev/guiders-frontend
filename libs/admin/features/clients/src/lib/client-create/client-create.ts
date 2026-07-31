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
  selector: 'lib-client-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './client-create.html',
  styleUrl: './client-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientCreate {
  private readonly platform = inject(PlatformCompaniesService);
  private readonly router = inject(Router);

  readonly companyName = signal('');
  readonly siteName = signal('Sitio Principal');
  readonly canonicalDomain = signal('');
  readonly domainAliases = signal('');
  readonly adminFirstName = signal('');
  readonly adminLastName = signal('');
  readonly adminEmail = signal('');
  readonly adminTel = signal('');
  readonly adminPassword = signal('');

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    this.error.set(null);
    const name = this.companyName().trim();
    const domain = this.canonicalDomain().trim().toLowerCase();
    const adminFirstName = this.adminFirstName().trim();
    const adminLastName = this.adminLastName().trim();
    const adminEmail = this.adminEmail().trim().toLowerCase();
    const adminPassword = this.adminPassword();

    if (
      !name ||
      !domain ||
      !adminFirstName ||
      !adminLastName ||
      !adminEmail ||
      !adminPassword
    ) {
      this.error.set(
        'Empresa, dominio, nombre, apellidos, email y contraseña temporal del admin son obligatorios.',
      );
      return;
    }

    if (adminPassword.trim().length < 6) {
      this.error.set('La contraseña temporal debe tener al menos 6 caracteres.');
      return;
    }

    const aliases = this.domainAliases()
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);

    this.saving.set(true);
    this.platform
      .createCompany({
        companyName: name,
        sites: [
          {
            name: this.siteName().trim() || 'Sitio Principal',
            canonicalDomain: domain,
            domainAliases: aliases,
          },
        ],
        admin: {
          adminFirstName,
          adminLastName,
          adminEmail,
          adminTel: this.adminTel().trim() || undefined,
          adminPassword,
        },
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => {
          void this.router.navigate(['/clients', res.companyId]);
        },
        error: (err: unknown) => {
          this.error.set(this.mapError(err));
        },
      });
  }

  private mapError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const msg =
        typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.message;
      if (err.status === 409) {
        return msg || 'Ya existe un usuario con ese email';
      }
      return msg || 'No se pudo crear el cliente';
    }
    return 'No se pudo crear el cliente';
  }
}
