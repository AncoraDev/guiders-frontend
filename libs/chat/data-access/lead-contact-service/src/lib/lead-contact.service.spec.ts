import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { LeadContactService } from './lead-contact.service';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { Environment, LeadContactData } from '@guiders-frontend/shared/types';

const mockEnvironment: Environment = {
  production: false,
  auth: {
    authority: 'https://test.com',
    clientId: 'test-client',
    scope: 'openid',
    secureRoutes: []
  },
  api: {
    baseUrl: 'https://test-api.com'
  }
};

describe('LeadContactService', () => {
  let service: LeadContactService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT_TOKEN, useValue: mockEnvironment }
      ]
    });

    service = TestBed.inject(LeadContactService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should save contact data', () => {
    const visitorId = 'visitor-123';
    const data = { name: 'John', email: 'john@example.com', phone: '+1234567890' };

    service.saveContactData(visitorId, data).subscribe();

    const req = httpMock.expectOne('https://test-api.com/leads/contact-data/visitor-123');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(data);
  });

  it('should get contact data', () => {
    const visitorId = 'visitor-123';

    service.getContactData(visitorId).subscribe();

    const req = httpMock.expectOne('https://test-api.com/leads/contact-data/visitor-123');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ name: 'John', email: 'john@example.com', phone: '+1234567890' });
  });

  it('un 404 no bloquea un force posterior', () => {
    const visitorId = 'visitor-nuevo';
    const saved = {
      id: 'c1',
      visitorId,
      companyId: 'co',
      nombre: 'Ana',
      email: 'ana@test.com',
      extractedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    let first: LeadContactData | null | undefined;
    service.getContactData(visitorId).subscribe((data) => {
      first = data;
    });
    httpMock
      .expectOne('https://test-api.com/leads/contact-data/visitor-nuevo')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    expect(first).toBeNull();

    let second: LeadContactData | null | undefined;
    service.getContactData(visitorId).subscribe((data) => {
      second = data;
    });
    httpMock.expectNone('https://test-api.com/leads/contact-data/visitor-nuevo');
    expect(second).toBeNull();

    let forced: LeadContactData | null | undefined;
    service.getContactData(visitorId, { force: true }).subscribe((data) => {
      forced = data;
    });
    const retry = httpMock.expectOne(
      'https://test-api.com/leads/contact-data/visitor-nuevo'
    );
    retry.flush(saved);
    expect(forced).toEqual(saved);
  });

  it('lista la cola de pendientes y actualiza el contador', () => {
    service.listContactData({ status: 'pending' }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'https://test-api.com/leads/contact-data' &&
        r.params.get('status') === 'pending' &&
        r.params.get('source') === null
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(service.pendingCount()).toBe(0);
  });

  it('actualiza el seguimiento y refresca el contador', () => {
    service.updateFollowUp('visitor-1', 'contacted').subscribe();

    const patch = httpMock.expectOne(
      'https://test-api.com/leads/contact-data/visitor-1/follow-up'
    );
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ status: 'contacted' });
    patch.flush({
      id: 'c1',
      visitorId: 'visitor-1',
      companyId: 'co',
      followUpStatus: 'contacted',
      extractedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const refresh = httpMock.expectOne(
      (r) =>
        r.url === 'https://test-api.com/leads/contact-data' &&
        r.params.get('status') === 'pending'
    );
    refresh.flush([]);
  });
});