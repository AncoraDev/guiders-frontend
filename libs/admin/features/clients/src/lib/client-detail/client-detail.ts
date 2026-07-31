import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, forkJoin } from 'rxjs';
import {
  PlatformApiKey,
  PlatformCompaniesService,
  PlatformCompanyDetail,
} from '@guiders-frontend/platform-companies-service';

@Component({
  selector: 'lib-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './client-detail.html',
  styleUrl: './client-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientDetail implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);
  private readonly route = inject(ActivatedRoute);

  readonly company = signal<PlatformCompanyDetail | null>(null);
  readonly apiKeys = signal<PlatformApiKey[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly newDomain = signal('');
  readonly creatingKey = signal(false);
  readonly keyError = signal<string | null>(null);
  readonly lastCreatedKey = signal<string | null>(null);
  readonly copyFeedback = signal<string | null>(null);

  private companyId = '';

  ngOnInit(): void {
    this.companyId = this.route.snapshot.paramMap.get('companyId') ?? '';
    if (!this.companyId) {
      this.error.set('ID de cliente no válido');
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      company: this.platform.getCompany(this.companyId),
      apiKeys: this.platform.listApiKeys(this.companyId),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ company, apiKeys }) => {
          this.company.set(company);
          this.apiKeys.set(apiKeys);
        },
        error: (err: unknown) => {
          this.error.set(this.mapError(err));
        },
      });
  }

  createApiKey(): void {
    this.keyError.set(null);
    this.lastCreatedKey.set(null);
    const domain = this.newDomain().trim().toLowerCase();
    if (!domain) {
      this.keyError.set('Indica un dominio');
      return;
    }
    this.creatingKey.set(true);
    this.platform
      .createApiKey(this.companyId, domain)
      .pipe(finalize(() => this.creatingKey.set(false)))
      .subscribe({
        next: (res) => {
          this.lastCreatedKey.set(res.apiKey);
          this.newDomain.set('');
          this.platform.listApiKeys(this.companyId).subscribe({
            next: (keys) => this.apiKeys.set(keys),
          });
        },
        error: (err: unknown) => {
          this.keyError.set(this.mapError(err));
        },
      });
  }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copyFeedback.set('Copiado');
      setTimeout(() => this.copyFeedback.set(null), 1500);
    } catch {
      this.copyFeedback.set('No se pudo copiar');
    }
  }

  private mapError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404) return 'Cliente no encontrado';
      return (
        (typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.message) || 'Error de red'
      );
    }
    return 'Error de red';
  }
}
