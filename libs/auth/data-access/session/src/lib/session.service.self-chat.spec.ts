import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SelfChatService } from '@guiders-frontend/self-chat';
import { Environment } from '@guiders-frontend/shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ENVIRONMENT_TOKEN } from './environment.token';
import { SessionService } from './session.service';
import type { User } from './user.interface';

describe('SessionService self-chat integration', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;
  let selfChat: SelfChatService;

  const mockEnvironment: Environment = {
    production: false,
    auth: {
      authority: 'https://test.com',
      clientId: 'test-client',
      scope: 'openid',
      secureRoutes: [],
    },
    api: { baseUrl: 'https://test-api.com' },
  };

  const mockUser: User = {
    sub: 'user-1',
    email: 'foo@example.com',
    roles: ['commercial'],
    companyId: 'co-1',
    app: 'console',
    session: { exp: Math.floor(Date.now() / 1000) + 3600 },
  } as User;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT_TOKEN, useValue: mockEnvironment },
      ],
    });
    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    selfChat = TestBed.inject(SelfChatService);
  });

  it('initializes the self chat when the session is established', () => {
    const initSpy = vi.spyOn(selfChat, 'initialize');

    service.ensureSession$().subscribe();
    const req = httpMock.expectOne('https://test-api.com/bff/auth/me/console');
    req.flush(mockUser);

    expect(initSpy).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'foo@example.com',
    });
  });

  it('clears the self chat when the session cache is cleared', () => {
    const clearSpy = vi.spyOn(selfChat, 'clear');
    service.clearCache();
    expect(clearSpy).toHaveBeenCalled();
  });
});
