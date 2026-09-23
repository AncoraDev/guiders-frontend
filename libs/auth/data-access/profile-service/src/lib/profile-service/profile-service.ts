import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {
  CannedReply,
  ENVIRONMENT_TOKEN,
  UserProfile,
} from '@guiders-frontend/auth/data-access/session';

export interface UploadAvatarResponse {
  avatarUrl: string;
  message: string;
}

export interface LeadCaptureNotifySettings {
  email: string;
  from?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  apiKeyLast4?: string | null;
}

export interface ContactFormLegalSettings {
  privacyPolicyUrl: string;
  privacyCheckboxLabel: string;
  marketingCheckboxLabel: string;
}

export type WidgetPositionPreset =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

export interface WidgetConfigSettings {
  chatEnabled: boolean;
  autoOpenChatOnMessage: boolean;
  colorScheme: 'system' | 'light' | 'dark';
  theme: 'default' | 'carbon';
  position: {
    desktop: WidgetPositionPreset;
    mobileEnabled: boolean;
    mobile: WidgetPositionPreset;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);
  private readonly baseUrl = `${this.environment.api.baseUrl}`;

  /**
   * Sube o actualiza el avatar del usuario
   * @param userId ID del usuario
   * @param file Archivo de imagen (PNG o JPG, máx 5MB)
   * @returns Observable con la URL del avatar actualizado y mensaje de confirmación
   */
  uploadAvatar(userId: string, file: File): Observable<UploadAvatarResponse> {
    // Validar tipo de archivo
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return throwError(() => new Error('Formato de archivo no válido. Solo se permiten PNG y JPG.'));
    }

    // Validar tamaño de archivo (5MB = 5 * 1024 * 1024 bytes)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return throwError(() => new Error('El archivo es demasiado grande. Tamaño máximo: 5MB.'));
    }

    // Crear FormData para envío multipart/form-data
    const formData = new FormData();
    formData.append('file', file);

    console.log(`[ProfileService] Uploading avatar for user ${userId}`, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    // Realizar petición POST con FormData
    return this.http.post<UploadAvatarResponse>(
      `${this.baseUrl}/user/auth/${userId}/avatar`,
      formData,
      { withCredentials: true }
    ).pipe(
      tap(response => {
        console.log('[ProfileService] Avatar uploaded successfully:', response);
      }),
      catchError(error => {
        console.error('[ProfileService] Error uploading avatar:', error);

        // Mapear errores HTTP a mensajes descriptivos
        let errorMessage = 'Error al subir el avatar. Inténtalo de nuevo.';

        if (error.status === 400) {
          errorMessage = error.error?.message || 'Archivo inválido.';
        } else if (error.status === 401) {
          errorMessage = 'No autorizado. Por favor, inicia sesión nuevamente.';
        } else if (error.status === 403) {
          errorMessage = 'No tienes permisos para actualizar este avatar.';
        } else if (error.status === 404) {
          errorMessage = 'Usuario no encontrado.';
        } else if (error.status === 413) {
          errorMessage = 'El archivo es demasiado grande.';
        } else if (error.status === 500) {
          errorMessage = 'Error del servidor. Inténtalo más tarde.';
        }

        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Obtiene el perfil completo del usuario autenticado
   * @returns Observable con el perfil completo incluyendo avatarUrl y keycloakId
   */
  getUserProfile(): Observable<UserProfile> {
    console.log('[ProfileService] Fetching user profile from /api/user/auth/me');

    return this.http.get<UserProfile>(
      `${this.baseUrl}/user/auth/me`,
      { withCredentials: true }
    ).pipe(
      tap(profile => {
        console.log('[ProfileService] User profile loaded:', {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          hasAvatar: !!profile.avatarUrl,
          greetingMessage: profile.greetingMessage,
          cannedCount: profile.cannedReplies?.length ?? 0,
        });
      }),
      catchError(error => {
        console.error('[ProfileService] Error fetching user profile:', error);

        let errorMessage = 'Error al obtener el perfil del usuario.';

        if (error.status === 401) {
          errorMessage = 'No autorizado. Por favor, inicia sesión nuevamente.';
        } else if (error.status === 404) {
          errorMessage = 'Perfil de usuario no encontrado.';
        } else if (error.status === 500) {
          errorMessage = 'Error del servidor. Inténtalo más tarde.';
        }

        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Guarda el saludo del comercial (CTA Saludar). Vacío = texto por defecto.
   */
  updateGreetingMessage(
    greetingMessage: string | null
  ): Observable<{ greetingMessage: string | null }> {
    return this.http
      .patch<{ greetingMessage: string | null }>(
        `${this.baseUrl}/user/auth/me/greeting`,
        { greetingMessage },
        { withCredentials: true }
      )
      .pipe(
        tap((response) => {
          console.log('[ProfileService] Greeting updated:', response);
        }),
        catchError((error) => {
          console.error('[ProfileService] Error updating greeting:', error);
          const message =
            error.error?.message ||
            'No se pudo guardar el mensaje de saludo.';
          return throwError(() => new Error(message));
        })
      );
  }

  updateCannedReplies(
    items: CannedReply[]
  ): Observable<{ cannedReplies: CannedReply[] }> {
    return this.http
      .put<{ cannedReplies: CannedReply[] }>(
        `${this.baseUrl}/user/auth/me/canned-replies`,
        { items },
        { withCredentials: true }
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message || 'No se pudieron guardar las frases.';
          return throwError(() => new Error(message));
        })
      );
  }

  getTeamCannedReplies(): Observable<CannedReply[]> {
    return this.http
      .get<{ cannedReplies: CannedReply[] }>(
        `${this.baseUrl}/me/company/canned-replies`,
        { withCredentials: true }
      )
      .pipe(
        map((res) => res.cannedReplies ?? []),
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudieron cargar las frases del equipo.';
          return throwError(() => new Error(message));
        })
      );
  }

  updateTeamCannedReplies(
    items: CannedReply[]
  ): Observable<CannedReply[]> {
    return this.http
      .put<{ cannedReplies: CannedReply[] }>(
        `${this.baseUrl}/me/company/canned-replies`,
        { items },
        { withCredentials: true }
      )
      .pipe(
        map((res) => res.cannedReplies ?? []),
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudieron guardar las frases del equipo.';
          return throwError(() => new Error(message));
        })
      );
  }

  getContactFormLegal(): Observable<ContactFormLegalSettings> {
    return this.http
      .get<ContactFormLegalSettings>(
        `${this.baseUrl}/me/company/contact-form-legal`,
        { withCredentials: true }
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudieron cargar los textos del formulario.';
          return throwError(() => new Error(message));
        })
      );
  }

  updateContactFormLegal(
    legal: ContactFormLegalSettings
  ): Observable<ContactFormLegalSettings> {
    return this.http
      .put<ContactFormLegalSettings>(
        `${this.baseUrl}/me/company/contact-form-legal`,
        legal,
        { withCredentials: true }
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudieron guardar los textos del formulario.';
          return throwError(() => new Error(message));
        })
      );
  }

  getLeadCaptureNotify(): Observable<LeadCaptureNotifySettings> {
    return this.http
      .get<LeadCaptureNotifySettings>(
        `${this.baseUrl}/me/company/lead-capture-notify`,
        { withCredentials: true },
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudo cargar el email de avisos de captación.';
          return throwError(() => new Error(message));
        }),
      );
  }

  updateLeadCaptureNotify(
    settings: LeadCaptureNotifySettings,
  ): Observable<LeadCaptureNotifySettings> {
    return this.http
      .put<LeadCaptureNotifySettings>(
        `${this.baseUrl}/me/company/lead-capture-notify`,
        settings,
        { withCredentials: true },
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudo guardar el email de avisos de captación.';
          return throwError(() => new Error(message));
        }),
      );
  }

  testLeadCaptureNotify(
    settings: LeadCaptureNotifySettings,
  ): Observable<{ sent: true }> {
    return this.http
      .post<{ sent: true }>(
        `${this.baseUrl}/me/company/lead-capture-notify/test`,
        settings,
        { withCredentials: true },
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudo enviar el email de prueba.';
          return throwError(() => new Error(message));
        }),
      );
  }

  getWidgetConfig(): Observable<WidgetConfigSettings> {
    return this.http
      .get<WidgetConfigSettings>(`${this.baseUrl}/me/company/widget-config`, {
        withCredentials: true,
      })
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudo cargar la configuración del chat web.';
          return throwError(() => new Error(message));
        }),
      );
  }

  updateWidgetConfig(
    config: WidgetConfigSettings,
  ): Observable<WidgetConfigSettings> {
    return this.http
      .put<WidgetConfigSettings>(
        `${this.baseUrl}/me/company/widget-config`,
        config,
        { withCredentials: true },
      )
      .pipe(
        catchError((error) => {
          const message =
            error.error?.message ||
            'No se pudo guardar la configuración del chat web.';
          return throwError(() => new Error(message));
        }),
      );
  }
}
