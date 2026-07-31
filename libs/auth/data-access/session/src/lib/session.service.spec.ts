import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { SessionService, User } from './session.service';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { Environment } from '@guiders-frontend/shared/types';

describe('SessionService', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT_TOKEN, useValue: mockEnvironment }
      ]
    });
    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch user session', () => {
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User'
    };

    service.ensureSession$().subscribe(user => {
      expect(user).toEqual(mockUser);
    });

    const req = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(mockUser);
  });

  it('should cache the session request', () => {
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User'
    };

    // Primera llamada
    service.ensureSession$().subscribe();
    // Segunda llamada
    service.ensureSession$().subscribe();

    // Solo debe hacer una petición HTTP
    const req = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    req.flush(mockUser);
  });

  it('should clear cache', () => {
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User'
    };

    // Primera llamada
    service.ensureSession$().subscribe();
    const req1 = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    req1.flush(mockUser);

    // Limpiar cache
    service.clearCache();

    // Segunda llamada después de limpiar cache
    service.ensureSession$().subscribe();
    const req2 = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    req2.flush(mockUser);
  });

  it('should NOT re-fetch when re-subscribed sequentially after previous subscription completed', () => {
    // Reproduces the bug: authGuard re-runs on every navigation.
    // With shareReplay({refCount: true}), once the previous subscription
    // completes (refCount drops to 0), the next subscription re-executes
    // the source, triggering /auth/me again — causing an infinite loop
    // when combined with reactive effects on the user signal.
    const mockUser: User = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User'
    };

    // First subscription completes synchronously after flush
    const sub1 = service.ensureSession$().subscribe();
    const req1 = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    req1.flush(mockUser);
    sub1.unsubscribe();

    // Second subscription (simulates a subsequent navigation triggering authGuard)
    service.ensureSession$().subscribe();

    // No new HTTP request should be made — the cached value must be replayed
    httpMock.expectNone('https://test-api.com/bff/auth/me/console');
  });
});
