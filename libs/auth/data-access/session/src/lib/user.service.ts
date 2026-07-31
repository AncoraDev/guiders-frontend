import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError } from 'rxjs';
import { User } from './user.interface';
import { ENVIRONMENT_TOKEN } from './environment.token';
import { resolveAuthApp } from './resolve-auth-app';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  
  // Señal que almacena el usuario actual
  private readonly _currentUser = signal<User | null>(null);
  
  // Señal de solo lectura para el usuario actual
  readonly currentUser = this._currentUser.asReadonly();
  
  // Computed que indica si hay un usuario logueado
  readonly isAuthenticated = computed(() => !!this._currentUser());
  
  // Computed que verifica si la sesión ha expirado
  readonly isSessionExpired = computed(() => {
    const user = this._currentUser();
    if (!user?.session?.exp) return false;
    
    const now = Math.floor(Date.now() / 1000);
    return user.session.exp <= now;
  });

  /**
   * Obtiene el usuario actual desde el BFF y lo almacena en el signal
   */
  fetchUser(): Observable<User> {
    const app = resolveAuthApp(this.environment);
    return this.http.get<User>(`${this.environment.api.baseUrl}/bff/auth/me/${app}`, {
      withCredentials: true
    }).pipe(
      tap(user => {
        this._currentUser.set(user);
        console.log('User fetched and stored:', user);
      }),
      catchError(error => {
        this._currentUser.set(null);
        console.error('Error fetching user:', error);
        throw error;
      })
    );
  }

  /**
   * Establece el usuario actual
   */
  setUser(user: User | null): void {
    this._currentUser.set(user);
  }

  /**
   * Limpia el usuario actual
   */
  clearUser(): void {
    this._currentUser.set(null);
  }

  /**
   * Verifica si el usuario tiene un rol específico
   */
  hasRole(role: string): boolean {
    const user = this._currentUser();
    return user?.roles?.includes(role) ?? false;
  }

  /**
   * Verifica si el usuario tiene alguno de los roles especificados
   */
  hasAnyRole(roles: string[]): boolean {
    const user = this._currentUser();
    if (!user?.roles) return false;
    
    return roles.some(role => user.roles.includes(role));
  }

  /**
   * Obtiene el email del usuario actual
   */
  getUserEmail(): string | null {
    return this._currentUser()?.email ?? null;
  }

  /**
   * Obtiene el ID del usuario actual (sub)
   */
  getUserId(): string | null {
    return this._currentUser()?.sub ?? null;
  }

  /**
   * Obtiene la aplicación del usuario actual
   */
  getUserApp(): string | null {
    return this._currentUser()?.app ?? null;
  }

  /**
   * Cierra la sesión del usuario redirigiendo al endpoint de logout del BFF.
   * El navegador seguirá automáticamente el redirect 302 al login.
   * @param app - Nombre de la aplicación ('console' o 'admin')
   */
  logout(app?: 'console' | 'admin'): void {
    const targetApp = app ?? resolveAuthApp(this.environment);
    const logoutUrl = `${this.environment.api.baseUrl}/bff/auth/logout/${targetApp}`;
    
    console.log('[UserService] Redirigiendo a logout:', logoutUrl);
    
    // Limpiar estado local antes de redirigir
    this.clearUser();
    
    // Redirigir al endpoint de logout (el navegador seguirá el 302 automáticamente)
    window.location.href = logoutUrl;
  }
}