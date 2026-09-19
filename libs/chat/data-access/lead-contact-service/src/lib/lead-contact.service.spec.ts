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
});