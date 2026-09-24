import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'lib-client-api-docs',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './client-api-docs.html',
  styleUrl: './client-api-docs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientApiDocs {
  readonly providerName = signal('leadcars');

  readonly providerLabel = computed(
    () => this.providerName().trim() || 'leadcars',
  );

  readonly providerSlug = computed(() => {
    const slug = this.providerLabel()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    return slug || 'leadcars';
  });

  readonly authMessage = computed(() => `${this.providerSlug()}:v1:auth`);
  readonly logoutMessage = computed(() => `${this.providerSlug()}:v1:logout`);

  syncExample(): string {
    return JSON.stringify(
      {
        companyId: '{companyId}',
        externalUserId: `${this.providerSlug()}-commercial-42`,
        email: 'ana@concesionario.es',
        firstName: 'Ana',
        lastName: 'García',
        roles: ['commercial'],
        active: true,
      },
      null,
      2,
    );
  }

  syncResponseExample(): string {
    return JSON.stringify(
      {
        userId: '<uuid de Guiders>',
        externalUserId: `${this.providerSlug()}-commercial-42`,
        active: true,
        created: true,
      },
      null,
      2,
    );
  }

  iframeExample(): string {
    return '{url-de-console}/?embed=true&companyId={companyId}';
  }

  embedExample(): string {
    return JSON.stringify(
      {
        companyId: '{companyId}',
        externalUserId: `${this.providerSlug()}-commercial-42`,
      },
      null,
      2,
    );
  }

  readyExample(): string {
    return JSON.stringify(
      { type: 'guiders:v1:ready', payload: { version: '1.0.0' } },
      null,
      2,
    );
  }

  authExample(): string {
    return JSON.stringify(
      {
        type: this.authMessage(),
        payload: { token: '<token>', userId: '<uuid de Guiders>' },
      },
      null,
      2,
    );
  }

  logoutExample(): string {
    return JSON.stringify(
      { type: this.logoutMessage(), payload: {} },
      null,
      2,
    );
  }
}
