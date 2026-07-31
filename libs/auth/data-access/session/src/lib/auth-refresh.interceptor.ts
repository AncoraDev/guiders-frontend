import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpHandlerFn
} from '@angular/common/http';
import { Observable, throwError, switchMap, catchError, filter, take, BehaviorSubject } from 'rxjs';
import { AuthRefreshService } from './auth-refresh.service';

/**
 * Interceptor funcional que maneja automáticamente el refresh de tokens
 * cuando se reciben errores 401/403, evitando que el usuario pierda la sesión.
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authRefreshService = inject(AuthRefreshService);
  
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo 401 = sesión inválida/expirada.
      // 403 suele ser autorización (roles) y no se arregla con refresh.
      if (error.status === 401) {
        return handleAuthError(req, next, authRefreshService, error);
      }

      return throwError(() => error);
    }),
  );
};

/**
 * Maneja errores de autenticación intentando hacer refresh de la sesión
 */
function handleAuthError(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authRefreshService: AuthRefreshService,
  originalError: HttpErrorResponse
): Observable<HttpEvent<unknown>> {
  
  // No intentar refresh si la petición ya es a un endpoint de auth para evitar bucles
  if (isAuthEndpoint(req.url)) {
    console.log('[AuthRefreshInterceptor] Error en endpoint de auth, no intentando refresh');
    return throwError(() => originalError);
  }

  // No intentar refresh si ya hay uno en progreso para la misma URL
  if (authRefreshService.isRefreshInProgress()) {
    console.log('[AuthRefreshInterceptor] Refresh ya en progreso, esperando...');
    
    // Esperar a que termine el refresh en progreso y reintentar
    return authRefreshService.getRefreshStatus().pipe(
      filter(inProgress => !inProgress), // Esperar a que termine
      take(1),
      switchMap(() => {
        console.log('[AuthRefreshInterceptor] Reintentando petición después de refresh');
        return next(req);
      }),
      catchError(() => {
        // Si sigue fallando después del refresh, retornar el error original
        return throwError(() => originalError);
      })
    );
  }

  console.log(`[AuthRefreshInterceptor] Error ${originalError.status} en ${req.url}, intentando refresh...`);

  // Intentar refresh de sesión
  return authRefreshService.refreshSession().pipe(
    switchMap(() => {
      // Si el refresh fue exitoso, reintentar la petición original
      console.log('[AuthRefreshInterceptor] Refresh exitoso, reintentando petición original');
      return next(req);
    }),
    catchError((refreshError) => {
      // Si el refresh falló, retornar el error original
      console.error('[AuthRefreshInterceptor] Refresh falló, retornando error original:', refreshError);
      return throwError(() => originalError);
    })
  );
}

/**
 * Verifica si la URL es un endpoint de autenticación para evitar bucles infinitos
 */
function isAuthEndpoint(url: string): boolean {
  const authPatterns = [
    '/bff/auth/login',
    '/bff/auth/refresh',
    '/bff/auth/logout',
    '/bff/auth/callback',
    '/bff/auth/me',    // Evitar bucle: si /me devuelve 401, no intentar refresh (lo gestiona globalErrorInterceptor)
    '/user/auth/login',
    '/user/auth/refresh',
    '/user/auth/logout'
  ];

  return authPatterns.some(pattern => url.includes(pattern));
}

/**
 * @deprecated Usar authRefreshInterceptor (función) en su lugar
 * Versión de clase para compatibilidad con código legacy
 */
@Injectable()
export class AuthRefreshInterceptorClass implements HttpInterceptor {
  private readonly authRefreshService = inject(AuthRefreshService);
  private readonly refreshInProgress = new BehaviorSubject<boolean>(false);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          return this.handleAuthErrorClass(req, next, error);
        }
        return throwError(() => error);
      })
    );
  }

  private handleAuthErrorClass(
    req: HttpRequest<unknown>,
    next: HttpHandler,
    originalError: HttpErrorResponse
  ): Observable<HttpEvent<unknown>> {
    
    if (isAuthEndpoint(req.url)) {
      return throwError(() => originalError);
    }

    if (this.refreshInProgress.value) {
      return this.refreshInProgress.pipe(
        filter(inProgress => !inProgress),
        take(1),
        switchMap(() => next.handle(req)),
        catchError(() => throwError(() => originalError))
      );
    }

    this.refreshInProgress.next(true);

    return this.authRefreshService.refreshSession().pipe(
      switchMap(() => {
        this.refreshInProgress.next(false);
        return next.handle(req);
      }),
      catchError((refreshError) => {
        this.refreshInProgress.next(false);
        console.error('Refresh falló:', refreshError);
        return throwError(() => originalError);
      })
    );
  }
}