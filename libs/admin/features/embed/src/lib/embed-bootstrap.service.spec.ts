import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { EmbedBootstrapService } from './embed-bootstrap.service';
import { EmbedAllowedOriginsService } from './embed-allowed-origins.service';

describe('EmbedBootstrapService', () => {
  let service: EmbedBootstrapService;
  let originsService: EmbedAllowedOriginsService;
  let httpMock: HttpTestingController;
  let router: Router;
  let mockParentPostMessage: ReturnType<typeof vi.fn>;
  let messageListeners: Array<(event: MessageEvent) => void> = [];

  beforeEach(() => {
    // Mock window.parent.postMessage
    mockParentPostMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage: mockParentPostMessage },
      writable: true,
      configurable: true,
    });

    // Capture message listeners
    messageListeners = [];
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = ((event: string, handler: EventListenerOrEventListenerObject) => {
      if (event === 'message' && typeof handler === 'function') {
        messageListeners.push(handler as (event: MessageEvent) => void);
      }
      return originalAdd(event, handler);
    }) as typeof window.addEventListener;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        EmbedBootstrapService,
        EmbedAllowedOriginsService,
      ],
    });

    service = TestBed.inject(EmbedBootstrapService);
    originsService = TestBed.inject(EmbedAllowedOriginsService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    messageListeners = [];
    vi.restoreAllMocks();
  });

  describe('AC1 — bootstrap() sends guiders:v1:ready', () => {
    it('debe llamar window.parent.postMessage con guiders:v1:ready', () => {
      service.bootstrap();
      expect(mockParentPostMessage).toHaveBeenCalledWith(
        { type: 'guiders:v1:ready', payload: { version: '1.0.0' } },
        '*',
      );
    });

    it('debe registrar window.addEventListener para mensajes', () => {
      service.bootstrap();
      expect(messageListeners.length).toBeGreaterThan(0);
    });

    it('debe cargar orígenes del companyId antes de anunciar ready', async () => {
      window.history.replaceState({}, '', '/?embed=true&companyId=company-1');
      service.bootstrap();
      expect(messageListeners.length).toBe(0);

      const req = httpMock.expectOne(
        '/api/embed/allowed-origins?companyId=company-1',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ origins: ['http://localhost:8090'] });
      await vi.waitFor(() => {
        expect(messageListeners.length).toBeGreaterThan(0);
      });
      expect(originsService.isAllowed('http://localhost:8090')).toBe(true);
      expect(mockParentPostMessage).toHaveBeenCalled();
      window.history.replaceState({}, '', '/');
    });
  });

  describe('AC2 — Mensaje leadcars:v1:auth con origin válido', () => {
    it('debe llamar POST /embed/authenticate-session cuando origin es válido', () => {
      originsService.setAllowed(['https://leadcars.com']);
      service.bootstrap();
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const messageEvent = new MessageEvent('message', {
        origin: 'https://leadcars.com',
        data: {
          type: 'leadcars:v1:auth',
          payload: { token: 'abc123', userId: 'user-1' },
        },
      });

      messageListeners[0](messageEvent);

      const req = httpMock.expectOne('/api/embed/authenticate-session');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ userId: 'user-1' });
      expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');

      req.flush({
        sessionEstablished: true,
        expiresAt: '2026-06-19T00:00:00.000Z',
      });

      expect(navSpy).toHaveBeenCalledWith(['/embed/dashboard']);
    });
  });

  describe('AC3 — Mensaje con origin inválido es silenciosamente rechazado', () => {
    it('debe NO llamar HTTP cuando origin no está permitido', () => {
      originsService.setAllowed(['https://leadcars.com']);
      service.bootstrap();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const messageEvent = new MessageEvent('message', {
        origin: 'https://attacker.com',
        data: { type: 'leadcars:v1:auth', payload: { token: 'secret-token' } },
      });

      messageListeners[0](messageEvent);

      // No HTTP request should be made
      httpMock.expectNone('/api/embed/authenticate-session');
      // Warning logged with origin but NOT token (AI-3 + security)
      expect(warnSpy).toHaveBeenCalled();
      const warnArgs = warnSpy.mock.calls[0].join(' ');
      expect(warnArgs).toContain('attacker.com');
      expect(warnArgs).not.toContain('secret-token');
    });

    it('debe NO navegar cuando origin es inválido', () => {
      originsService.setAllowed(['https://leadcars.com']);
      service.bootstrap();
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const messageEvent = new MessageEvent('message', {
        origin: 'https://attacker.com',
        data: { type: 'leadcars:v1:auth', payload: { token: 'x' } },
      });

      messageListeners[0](messageEvent);

      expect(navSpy).not.toHaveBeenCalled();
    });
  });

  describe('AC4 — Mensaje con type desconocido es silenciosamente ignorado', () => {
    it('debe NO procesar message con type desconocido', () => {
      originsService.setAllowed(['https://leadcars.com']);
      service.bootstrap();

      const messageEvent = new MessageEvent('message', {
        origin: 'https://leadcars.com',
        data: { type: 'unknown:v1:foo', payload: {} },
      });

      messageListeners[0](messageEvent);

      httpMock.expectNone('/api/embed/authenticate-session');
    });

    it('debe NO procesar message sin type', () => {
      originsService.setAllowed(['https://leadcars.com']);
      service.bootstrap();

      const messageEvent = new MessageEvent('message', {
        origin: 'https://leadcars.com',
        data: { foo: 'bar' },
      });

      messageListeners[0](messageEvent);

      httpMock.expectNone('/api/embed/authenticate-session');
    });
  });
});