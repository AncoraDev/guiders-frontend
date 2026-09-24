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
  PlatformIntegrationApiKey,
} from '@guiders-frontend/platform-companies-service';

interface SiteForm {
  id?: string;
  name: string;
  canonicalDomain: string;
  domainAliases: string;
}

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
  readonly integrationKeys = signal<PlatformIntegrationApiKey[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly formName = signal('');
  readonly formSites = signal<SiteForm[]>([]);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saveOk = signal(false);

  readonly newDomain = signal('');
  readonly creatingKey = signal(false);
  readonly keyError = signal<string | null>(null);
  readonly lastCreatedKey = signal<string | null>(null);
  readonly integrationKeyName = signal('LeadCars');
  readonly integrationKeyEnvironment = signal<'live' | 'test'>('live');
  readonly creatingIntegrationKey = signal(false);
  readonly integrationKeyError = signal<string | null>(null);
  readonly lastCreatedIntegrationKey = signal<string | null>(null);
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
          this.hydrateForm(company);
          this.apiKeys.set(apiKeys);
          this.loadIntegrationKeys();
        },
        error: (err: unknown) => {
          this.error.set(this.mapError(err, 'Cliente no encontrado'));
        },
      });
  }

  updateSite(index: number, patch: Partial<SiteForm>): void {
    this.formSites.update((sites) =>
      sites.map((site, i) => (i === index ? { ...site, ...patch } : site)),
    );
  }

  addSite(): void {
    this.formSites.update((sites) => [
      ...sites,
      { name: 'Sitio principal', canonicalDomain: '', domainAliases: '' },
    ]);
  }

  removeSite(index: number): void {
    if (this.formSites().length <= 1) return;
    this.formSites.update((sites) => sites.filter((_, i) => i !== index));
  }

  saveCompany(): void {
    const companyName = this.formName().trim();
    const sites = this.formSites().map((site) => ({
      id: site.id,
      name: site.name.trim() || 'Sitio principal',
      canonicalDomain: site.canonicalDomain.trim().toLowerCase(),
      domainAliases: site.domainAliases
        .split(',')
        .map((alias) => alias.trim().toLowerCase())
        .filter((alias) => alias.length > 0),
    }));

    if (!companyName) {
      this.saveError.set('El nombre de la empresa es obligatorio');
      return;
    }
    if (sites.some((site) => !site.canonicalDomain)) {
      this.saveError.set('Cada sitio necesita un dominio canónico');
      return;
    }

    this.saveError.set(null);
    this.saveOk.set(false);
    this.saving.set(true);
    this.platform
      .updateCompany(this.companyId, { companyName, sites })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (company) => {
          this.company.set(company);
          this.hydrateForm(company);
          this.saveOk.set(true);
          setTimeout(() => this.saveOk.set(false), 2000);
        },
        error: (err: unknown) => {
          this.saveError.set(this.mapError(err, 'No se pudo actualizar el cliente'));
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
          this.keyError.set(this.mapError(err, 'No se pudo crear la API key'));
        },
      });
  }

  createIntegrationApiKey(): void {
    this.integrationKeyError.set(null);
    this.lastCreatedIntegrationKey.set(null);
    const name = this.integrationKeyName().trim();
    if (!name) {
      this.integrationKeyError.set('Indica un nombre');
      return;
    }
    this.creatingIntegrationKey.set(true);
    this.platform
      .createIntegrationApiKey(
        this.companyId,
        name,
        this.integrationKeyEnvironment(),
      )
      .pipe(finalize(() => this.creatingIntegrationKey.set(false)))
      .subscribe({
        next: (res) => {
          this.lastCreatedIntegrationKey.set(res.token);
          this.loadIntegrationKeys();
        },
        error: (err: unknown) => {
          this.integrationKeyError.set(
            this.mapError(err, 'No se pudo crear la API key de integración'),
          );
        },
      });
  }

  private loadIntegrationKeys(): void {
    this.platform.listIntegrationApiKeys(this.companyId).subscribe({
      next: (keys) => this.integrationKeys.set(keys),
      error: (err: unknown) => {
        this.integrationKeyError.set(
          this.mapError(err, 'No se pudieron cargar las API keys de integración'),
        );
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

  private hydrateForm(company: PlatformCompanyDetail): void {
    this.formName.set(company.companyName);
    const sites: SiteForm[] = company.sites?.length
      ? company.sites.map((site) => ({
          id: site.id,
          name: site.name || 'Sitio principal',
          canonicalDomain: site.canonicalDomain,
          domainAliases: (site.domainAliases ?? []).join(', '),
        }))
      : [{ name: 'Sitio principal', canonicalDomain: '', domainAliases: '' }];
    this.formSites.set(sites);
  }

  private mapError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404) return 'Cliente no encontrado';
      return (
        (typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.message) || fallback
      );
    }
    return fallback;
  }
}
