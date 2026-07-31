import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { PlatformCompaniesService } from './platform-companies.service';

describe('PlatformCompaniesService', () => {
  let service: PlatformCompaniesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ENVIRONMENT_TOKEN,
          useValue: { api: { baseUrl: '/api' } },
        },
      ],
    });
    service = TestBed.inject(PlatformCompaniesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista companies en GET /platform/companies', () => {
    service.listCompanies().subscribe((list) => {
      expect(list).toHaveLength(1);
    });
    const req = http.expectOne('/api/platform/companies');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([
      {
        id: 'c1',
        companyName: 'Acme',
        domains: ['acme.test'],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('crea company en POST /platform/companies', () => {
    service
      .createCompany({
        companyName: 'Acme',
        sites: [{ name: 'Principal', canonicalDomain: 'acme.test' }],
        admin: { adminName: 'Ada', adminEmail: 'ada@acme.test' },
      })
      .subscribe((res) => {
        expect(res.companyId).toBe('c1');
      });
    const req = http.expectOne('/api/platform/companies');
    expect(req.request.method).toBe('POST');
    req.flush({ companyId: 'c1', adminUserId: 'u1' });
  });
});
