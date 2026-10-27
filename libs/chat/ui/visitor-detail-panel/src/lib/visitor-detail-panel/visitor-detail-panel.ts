/**
 * Visitor Detail Panel Component
 * Panel lateral con información detallada del visitante
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Visitor,
  LeadCaptureTrace,
  LeadContactData,
  SaveContactDataRequest,
  VisitorPageHistoryItem,
  readLeadCaptureTrace,
} from '@guiders-frontend/shared/types';
import { ContactDataForm } from '@guiders-frontend/contact-data-form';
import { ActivityStatCard } from '@guiders-frontend/activity-stat-card';

/** Score de lead mostrado en el panel (mismo shape que VisitorsDataService) */
export interface VisitorPanelLeadScore {
  score: number;
  tier: 'cold' | 'warm' | 'hot';
  signals?: {
    isRecurrentVisitor?: boolean;
    hasHighEngagement?: boolean;
    hasInvestedTime?: boolean;
    needsHelp?: boolean;
  };
}

/** Nombre legible del navegador. El user agent completo va en el title. */
export function friendlyBrowserName(userAgent?: string | null): string {
  const raw = userAgent?.trim();
  if (!raw) return '';

  const browser = detectBrowser(raw);
  const device = detectDevice(raw);
  return device ? `${browser} · ${device}` : browser;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua) || /Edge\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua) || /Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  if (/MSIE |Trident\//i.test(ua)) return 'Internet Explorer';
  return 'Navegador';
}

function detectDevice(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return '';
}

@Component({
  selector: 'guiders-visitor-detail-panel',
  standalone: true,
  imports: [CommonModule, ContactDataForm, ActivityStatCard],
  templateUrl: './visitor-detail-panel.html',
  styleUrl: './visitor-detail-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitorDetailPanel {
  // === INPUTS ===
  readonly visitor = input.required<Visitor>();
  readonly isOpen = input<boolean>(true);
  readonly leadScore = input<VisitorPanelLeadScore | null>(null);

  /** Datos de contacto del lead */
  readonly contactData = input<LeadContactData | null>(null);

  /** Indica si se está guardando los datos de contacto */
  readonly savingContactData = input<boolean>(false);

  /** ID del chat actual (para extraer contexto) */
  readonly chatId = input<string | undefined>(undefined);

  /** Historial de navegación (más reciente primero) */
  readonly pageHistory = input<VisitorPageHistoryItem[]>([]);
  readonly pageHistoryTotal = input<number>(0);
  readonly pageHistoryLoading = input<boolean>(false);

  // === OUTPUTS ===
  readonly closePanel = output<void>();
  readonly openUrl = output<string>();

  /** Emite cuando se guardan los datos de contacto */
  readonly saveContactData = output<SaveContactDataRequest>();

  // === STATE ===
  readonly urlCopied = signal<boolean>(false);

  /** Controla si el formulario de contacto está en modo edición */
  readonly isEditingContact = signal<boolean>(false);

  // === COMPUTED ===
  readonly visitorInitials = computed(() => {
    const name = this.visitor().name;
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  });

  readonly statusIcon = computed(() => {
    const status = this.visitor().status;
    switch (status) {
      case 'online': return '🟢';
      case 'offline': return '⚫';
      case 'idle': return '🟡';
      default: return '⚫';
    }
  });

  readonly statusLabel = computed(() => {
    const status = this.visitor().status;
    switch (status) {
      case 'online': return 'En línea';
      case 'offline': return 'Desconectado';
      case 'idle': return 'Inactivo';
      default: return 'Desconectado';
    }
  });

  readonly lifecycleIcon = computed(() => {
    const lifecycle = this.visitor().lifecycle;
    switch (lifecycle) {
      case 'ANON': return '👤';
      case 'ENGAGED': return '👀';
      case 'LEAD': return '📧';
      case 'CONVERTED': return '✅';
      default: return '👤';
    }
  });

  readonly lifecycleLabel = computed(() => {
    const lifecycle = this.visitor().lifecycle;
    switch (lifecycle) {
      case 'ANON': return 'Anónimo';
      case 'ENGAGED': return 'Interesado';
      case 'LEAD': return 'Lead';
      case 'CONVERTED': return 'Convertido';
      default: return 'Anónimo';
    }
  });

  readonly lastVisitFormatted = computed(() => {
    const date = this.visitor().lastVisit;
    return this.formatRelativeTime(new Date(date));
  });

  /**
   * Resumen del consentimiento que aceptó el visitante en el formulario. Es
   * null cuando no hay constancia, para no dar por hecho que lo rechazó.
   */
  readonly consentSummary = computed<string | null>(() => {
    const contact = this.contactData();
    if (contact?.acceptedPrivacyPolicy === undefined) return null;
    if (!contact.acceptedPrivacyPolicy) return 'No aceptó la política de privacidad';
    return contact.acceptedMarketing
      ? 'Política de privacidad y comunicaciones aceptadas'
      : 'Política de privacidad aceptada';
  });

  /**
   * Lo que contestó el visitante en el asistente de captación. Es el contexto
   * con el que llamarle: sin esto la ficha solo enseña nombre y teléfono.
   */
  readonly leadCapture = computed<LeadCaptureTrace | null>(() => {
    const trace = readLeadCaptureTrace(this.contactData());
    return trace && trace.answers.length > 0 ? trace : null;
  });

  /** Comentario que dejó el visitante en el formulario del asistente. */
  readonly captureComment = computed<string | null>(() => {
    const value = this.contactData()?.additionalData?.['comentario'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  });

  readonly truncatedUrl = computed(() => {
    const url = this.visitor().currentUrl;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }
  });

  readonly formattedSessionDuration = computed(() => {
    const seconds = this.visitor().averageSessionDuration;
    if (!seconds || seconds === 0) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  });

  readonly tierIcon = computed(() => {
    const tier = this.leadScore()?.tier;
    switch (tier) {
      case 'hot': return '🔴';
      case 'warm': return '🟡';
      case 'cold': return '🔵';
      default: return '⚪';
    }
  });

  readonly tierLabel = computed(() => {
    const tier = this.leadScore()?.tier;
    switch (tier) {
      case 'hot': return 'Lead caliente';
      case 'warm': return 'Lead templado';
      case 'cold': return 'Lead frío';
      default: return 'Sin evaluar';
    }
  });

  readonly signalsTooltip = computed(() => {
    const signals = this.leadScore()?.signals;
    if (!signals) return '';

    const parts: string[] = [];
    if (signals.isRecurrentVisitor) parts.push('Visitante recurrente');
    if (signals.hasHighEngagement) parts.push('Alto engagement');
    if (signals.hasInvestedTime) parts.push('Tiempo invertido');
    if (signals.needsHelp) parts.push('Solicitó ayuda');

    return parts.join(' • ');
  });

  // === EVENT HANDLERS ===
  onClose(): void {
    this.closePanel.emit();
  }

  onOpenUrl(): void {
    const url = this.visitor().currentUrl;
    if (url) {
      this.openUrl.emit(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async onCopyUrl(): Promise<void> {
    const url = this.visitor().currentUrl;
    if (url) {
      await navigator.clipboard.writeText(url);
      this.urlCopied.set(true);
      setTimeout(() => this.urlCopied.set(false), 2000);
    }
  }

  formatPageTime(iso: string): string {
    return this.formatRelativeTime(new Date(iso));
  }

  showTraffic(): boolean {
    const hasHistory = !this.pageHistoryLoading() && this.pageHistory().length > 0;
    return hasHistory || this.browserLabel().length > 0;
  }

  /** La última visita solo es «actual» si el visitante sigue en línea. */
  isLivePage(index: number): boolean {
    return index === 0 && this.visitor().status === 'online';
  }

  /** URL completa. El recorte visual lo hace el CSS; el title conserva el href. */
  formatPageUrl(item: VisitorPageHistoryItem): string {
    return item.url || item.path || '/';
  }

  formatReferrer(referrer: string | undefined): string {
    return referrer?.trim() || 'Directo';
  }

  /**
   * Origen de la visita más reciente que lo registró.
   * Vacío = directo. Sin campo = el evento no guardó referrer.
   */
  originLabel(): string {
    const recorded = this.pageHistory().find((page) => page.referrer !== undefined);
    const raw = recorded ? recorded.referrer : this.visitor().referrer;
    if (raw === undefined) return 'No registrado';
    return raw.trim() || 'Directo';
  }

  /** User agent tal cual. Se enseña al pasar el ratón. */
  rawUserAgent(): string {
    const fromVisitor = this.visitor().userAgent?.trim();
    if (fromVisitor) return fromVisitor;
    return (
      this.pageHistory().find((page) => page.userAgent?.trim())?.userAgent?.trim() ||
      ''
    );
  }

  /** Nombre corto: Edge, Safari, Chrome… */
  browserLabel(): string {
    return friendlyBrowserName(this.rawUserAgent());
  }

  openHistoryUrl(item: VisitorPageHistoryItem): void {
    let href = item.url;
    if (!href) return;

    if (!href.startsWith('http')) {
      const current = this.visitor().currentUrl;
      try {
        if (current) {
          const origin = new URL(current).origin;
          href = `${origin}${href.startsWith('/') ? href : `/${href}`}`;
        } else if (this.visitor().domain) {
          href = `https://${this.visitor().domain}${href.startsWith('/') ? href : `/${href}`}`;
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    window.open(href, '_blank', 'noopener,noreferrer');
  }

  onToggleEditContact(): void {
    this.isEditingContact.update(v => !v);
  }

  onCancelContactEdit(): void {
    this.isEditingContact.set(false);
  }

  onSaveContactData(request: SaveContactDataRequest): void {
    this.saveContactData.emit(request);
    // Cerrar edición después de emitir (el padre manejará el estado de guardado)
    this.isEditingContact.set(false);
  }

  // === PRIVATE METHODS ===
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return date.toLocaleDateString();
  }
}
