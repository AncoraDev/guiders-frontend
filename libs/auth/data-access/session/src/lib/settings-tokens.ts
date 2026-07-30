import { InjectionToken } from '@angular/core';

/** Route to navigate to when the user closes the settings page. Provide per-app. */
export const SETTINGS_CLOSE_ROUTE = new InjectionToken<string>('SETTINGS_CLOSE_ROUTE', {
  providedIn: 'root',
  factory: () => '/atencion', // sensible default for console
});
