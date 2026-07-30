import {
  Injectable,
  signal,
  computed,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';

/**
 * Available named themes.
 * Dark themes:
 * - grey-dark:    "Hormigón y Sombra" — neutral greys, the original palette (default)
 * - carbon:       Vercel-inspired — deep blacks, minimal contrast
 * - midnight:     GitHub-inspired — navy blues, cool tones
 * - warm-dark:    Linear-inspired — warm charcoals, purple accent
 *
 * Light themes (independent identities, not mirrors of dark):
 * - clean-light:  Zinc light — white content, zinc-100 rails, near-black accent
 * - daylight:     Corporate blue — #1a6bcc accent, bg #f0f4f8
 * - fresh-light:  Mint green — #0f9d74 accent, bg #f5f7f5
 * - rose-quartz:  Mauve-pink — #c2185b accent, bg #fdf6f7
 *
 * Company themes (white-label / embed partners):
 * - leadcars:     LeadCars SaaS — navy + lime, powder-blue chrome
 *
 * Legacy values 'light' and 'dark' are kept for backwards compatibility:
 * - 'dark'  maps to 'grey-dark'
 * - 'light' maps to 'clean-light'
 */
export type SidebarTheme =
  | 'grey-dark'
  | 'carbon'
  | 'midnight'
  | 'warm-dark'
  | 'clean-light'
  | 'daylight'
  | 'fresh-light'
  | 'rose-quartz'
  | 'leadcars'
  | 'light'
  | 'dark';

/** Canonical theme names (excludes legacy aliases). */
export type NamedTheme =
  | 'grey-dark'
  | 'carbon'
  | 'midnight'
  | 'warm-dark'
  | 'clean-light'
  | 'daylight'
  | 'fresh-light'
  | 'rose-quartz'
  | 'leadcars';

/** Groups shown in the theme picker. */
export type ThemeGroup = 'dark' | 'light' | 'company';

export interface ThemeOption {
  id: NamedTheme;
  label: string;
  description: string;
  /** Representative accent color for the theme switcher preview swatch. */
  accent: string;
  /** Representative background color for the theme switcher swatch. */
  bg: string;
  /** Whether this is a light content theme (theme-light class). */
  light: boolean;
  /** Picker section: Dark / Light / Company. */
  group: ThemeGroup;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'grey-dark',
    label: 'Grey',
    description: 'Neutral greys — Hormigón y Sombra',
    accent: '#a8a39d',
    bg: '#1c1917',
    light: false,
    group: 'dark',
  },
  {
    id: 'carbon',
    label: 'Carbon',
    description: 'Deep blacks — Vercel-inspired',
    accent: '#ededed',
    bg: '#0a0a0a',
    light: false,
    group: 'dark',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Navy blues — GitHub-inspired',
    accent: '#58a6ff',
    bg: '#0d1117',
    light: false,
    group: 'dark',
  },
  {
    id: 'warm-dark',
    label: 'Warm',
    description: 'Warm charcoals — Linear-inspired',
    accent: '#9e8cfc',
    bg: '#16141d',
    light: false,
    group: 'dark',
  },
  {
    id: 'clean-light',
    label: 'Clean',
    description: 'Zinc light — clear surfaces & borders',
    accent: '#18181b',
    bg: '#f4f4f5',
    light: true,
    group: 'light',
  },
  {
    id: 'daylight',
    label: 'Daylight',
    description: 'Corporate blue — light identity',
    accent: '#1a6bcc',
    bg: '#f0f4f8',
    light: true,
    group: 'light',
  },
  {
    id: 'fresh-light',
    label: 'Fresh',
    description: 'Mint green — light identity',
    accent: '#0f9d74',
    bg: '#f5f7f5',
    light: true,
    group: 'light',
  },
  {
    id: 'rose-quartz',
    label: 'Rose',
    description: 'Mauve-pink — light identity',
    accent: '#c2185b',
    bg: '#fdf6f7',
    light: true,
    group: 'light',
  },
  {
    id: 'leadcars',
    label: 'LeadCars',
    description: 'Navy + lima — embed LeadCars SaaS',
    accent: '#a9cb57',
    bg: '#1b3149',
    light: true,
    group: 'company',
  },
];

const THEME_STORAGE_KEY = 'guiders-sidebar-theme';
const DEFAULT_THEME: NamedTheme = 'grey-dark';

const LIGHT_THEMES: NamedTheme[] = [
  'clean-light',
  'daylight',
  'fresh-light',
  'rose-quartz',
  'leadcars',
];

const DARK_THEMES: NamedTheme[] = [
  'grey-dark',
  'carbon',
  'midnight',
  'warm-dark',
];

/** Normalise legacy 'dark'/'light' values to a canonical NamedTheme. */
function normaliseTheme(value: string | null): NamedTheme {
  if (!value) return DEFAULT_THEME;
  if (value === 'dark') return 'grey-dark';
  if (value === 'light') return 'clean-light';
  if (
    value === 'grey-dark' ||
    value === 'carbon' ||
    value === 'midnight' ||
    value === 'warm-dark' ||
    value === 'clean-light' ||
    value === 'daylight' ||
    value === 'fresh-light' ||
    value === 'rose-quartz' ||
    value === 'leadcars'
  ) {
    return value as NamedTheme;
  }
  return DEFAULT_THEME;
}

/**
 * Service for managing app-wide theme persistence in localStorage.
 * Applies `data-theme="<name>"` attribute to `document.body` so all CSS
 * `[data-theme]` blocks cascade globally.
 * Loads the saved theme before app initialization to prevent flash of wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Internal signal for theme state
  private readonly _theme = signal<NamedTheme>(this.loadThemeFromStorage());

  // Public readonly signal
  readonly theme = this._theme.asReadonly();

  // Convenience computed helpers
  readonly isDarkTheme = computed(() => DARK_THEMES.includes(this._theme()));
  readonly isLightTheme = computed(() => LIGHT_THEMES.includes(this._theme()));
  readonly currentThemeOption = computed(
    () => THEME_OPTIONS.find((t) => t.id === this._theme()) ?? THEME_OPTIONS[0]
  );

  constructor() {
    // Apply initial data-theme attribute to body
    this.applyThemeAttribute(this._theme());
  }

  /**
   * Load theme from localStorage synchronously.
   * Called during service construction to ensure theme is available immediately.
   */
  private loadThemeFromStorage(): NamedTheme {
    if (!this.isBrowser) {
      return DEFAULT_THEME;
    }

    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return normaliseTheme(stored);
    } catch (error) {
      console.warn(
        'ThemeService: Failed to load theme from localStorage',
        error
      );
    }

    return DEFAULT_THEME;
  }

  /**
   * Set the active theme and persist to localStorage.
   * Accepts both NamedTheme and legacy SidebarTheme values.
   */
  setTheme(theme: SidebarTheme): void {
    const normalised = normaliseTheme(theme);
    this._theme.set(normalised);
    this.saveThemeToStorage(normalised);
    this.applyThemeAttribute(normalised);
  }

  /**
   * Cycle through the available named themes in order.
   * Returns the new theme.
   */
  cycleTheme(): NamedTheme {
    const currentIndex = THEME_OPTIONS.findIndex(
      (t) => t.id === this._theme()
    );
    const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
    const next = THEME_OPTIONS[nextIndex].id;
    this.setTheme(next);
    return next;
  }

  /**
   * Toggle between light and dark — kept for backwards compatibility with
   * existing sidebar component. Cycles through named themes instead.
   */
  toggleTheme(): SidebarTheme {
    return this.cycleTheme();
  }

  /**
   * Apply `data-theme` attribute to `document.body` for global CSS cascade.
   * Also keeps legacy `theme-*` classes for backwards compatibility with
   * components that still rely on them.
   */
  private applyThemeAttribute(theme: NamedTheme): void {
    if (!this.isBrowser) {
      return;
    }

    const body = this.document.body;
    if (!body) {
      return;
    }

    // Set data-theme attribute (new system)
    body.setAttribute('data-theme', theme);

    // Keep legacy theme classes for backwards compatibility
    const isLight = LIGHT_THEMES.includes(theme);
    body.classList.remove('theme-dark', 'theme-light');
    body.classList.add(isLight ? 'theme-light' : 'theme-dark');
  }

  /**
   * Save theme to localStorage.
   */
  private saveThemeToStorage(theme: NamedTheme): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn('ThemeService: Failed to save theme to localStorage', error);
    }
  }
}
