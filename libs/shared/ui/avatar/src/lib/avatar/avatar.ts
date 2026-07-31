import {
  Component,
  computed,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceStatus } from '@guiders-frontend/shared/types';

export type AvatarSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'guiders-avatar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  // === INPUTS ===
  /**
   * Unique identifier for the user/visitor (used for color generation)
   */
  readonly userId = input.required<string>();

  /**
   * User/visitor name (used for initial generation)
   */
  readonly name = input<string | undefined>(undefined);

  /**
   * User/visitor email (used for initial generation if name is not available)
   */
  readonly email = input<string | undefined>(undefined);

  /**
   * Presence status (optional)
   */
  readonly presenceStatus = input<PresenceStatus | undefined>(undefined);

  /**
   * Avatar size
   */
  readonly size = input<AvatarSize>('medium');

  // === COMPUTED VALUES ===
  /**
   * Generate unique color based on user ID
   */
  readonly avatarColor = computed(() => {
    return this.generateColorFromId(this.userId());
  });

  /**
   * Get initial from name or email.
   * Ignora nombres genéricos ("Visitante", etc.) para priorizar alias/nombre real.
   */
  readonly initial = computed(() => {
    const name = this.name()?.trim();
    const email = this.email()?.trim();
    const genericNames = new Set([
      'visitante',
      'visitante anónimo',
      'chat sin título',
      'visitor',
      'anonymous',
    ]);

    if (name) {
      const lower = name.toLowerCase();
      const isGeneric =
        genericNames.has(lower) || lower.startsWith('visitante #');
      if (!isGeneric) {
        // "WEBER (Sergio)" → W; salta símbolos iniciales
        const letter = name.match(/[A-Za-zÀ-ÿ0-9]/)?.[0];
        if (letter) return letter.toUpperCase();
      }
    }

    if (email) {
      const letter = email.match(/[A-Za-zÀ-ÿ0-9]/)?.[0];
      if (letter) return letter.toUpperCase();
    }

    return 'V';
  });

  /**
   * Show presence badge
   */
  readonly showPresenceBadge = computed(() => {
    return this.presenceStatus() !== undefined;
  });

  /**
   * CSS classes for avatar container
   */
  readonly avatarClasses = computed(() => ({
    'guiders-avatar': true,
    [`guiders-avatar--${this.size()}`]: true,
  }));

  // === PRIVATE METHODS ===
  /**
   * Generates a consistent color based on the hash of the ID
   * Uses a carefully curated palette optimized for:
   * - Good contrast with white text
   * - Visual distinction between colors
   * - Professional appearance in both light and dark modes
   */
  private generateColorFromId(id: string): string {
    // Paleta muted adaptada a temas dark: tonos desaturados con buen contraste para texto blanco
    const colors = [
      '#4f52a0', // Índigo apagado
      '#6b4fa0', // Violeta apagado
      '#7c4fa0', // Púrpura apagado
      '#8c4a7a', // Fucsia apagado
      '#8c4a62', // Rosa apagado
      '#8c3a4a', // Rosa rojo apagado
      '#8c3a3a', // Rojo apagado
      '#8c5a2a', // Naranja apagado
      '#7a6020', // Ámbar apagado
      '#4a6820', // Lima apagado
      '#2a6a3a', // Verde apagado
      '#2a6a56', // Esmeralda apagado
      '#2a6462', // Teal apagado
      '#1e6070', // Cyan apagado
      '#1e5070', // Azul cielo apagado
      '#2a4a80', // Azul apagado
    ];

    // Generar hash del ID para obtener índice consistente
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convertir a 32bit integer
    }

    const index = Math.abs(hash) % colors.length;
    // Convertir hex a rgba con opacidad 0.55 para efecto translúcido
    const hex = colors[index].replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.55)`;
  }
}
