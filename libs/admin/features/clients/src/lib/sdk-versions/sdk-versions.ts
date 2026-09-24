import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  PlatformCompaniesService,
  PlatformSdkRelease,
} from '@guiders-frontend/platform-companies-service';

export function webSdkSnippet(version: string): string {
  return `<script src="/ruta/guiders-sdk.min.js?v=${version}" data-api-key="TU_API_KEY"></script>`;
}

@Component({
  selector: 'lib-sdk-versions',
  standalone: true,
  templateUrl: './sdk-versions.html',
  styleUrl: './sdk-versions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SdkVersions implements OnInit {
  private readonly platform = inject(PlatformCompaniesService);

  readonly releases = signal<PlatformSdkRelease[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly copiedVersion = signal<string | null>(null);

  ngOnInit(): void {
    this.platform.listSdkReleases().subscribe({
      next: (releases) => {
        this.releases.set(releases);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.mapError(err));
        this.loading.set(false);
      },
    });
  }

  snippet(version: string): string {
    return webSdkSnippet(version);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  copySnippet(version: string): void {
    const text = webSdkSnippet(version);
    void navigator.clipboard.writeText(text).then(
      () => this.copiedVersion.set(version),
      () => this.copiedVersion.set(null),
    );
  }

  private mapError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403 || err.status === 401) {
        return 'No tienes permisos de plataforma (superadmin).';
      }
      return (
        err.error?.message ||
        err.message ||
        'No se han podido cargar las versiones'
      );
    }
    return 'No se han podido cargar las versiones';
  }
}
