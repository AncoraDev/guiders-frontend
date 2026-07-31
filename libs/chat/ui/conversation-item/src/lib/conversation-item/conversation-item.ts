import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chat, User, PresenceStatus } from '@guiders-frontend/shared/types';
import { UnreadBadge } from '@guiders-frontend/unread-badge';
import { Avatar } from '@guiders-frontend/avatar';
import { Badge } from '@guiders-frontend/badge';
import { isDemoId } from '@guiders-frontend/tour-sandbox';
import { getVisitorDisplayName } from '@guiders-frontend/visitor-display-name';

@Component({
  selector: 'guiders-conversation-item',
  standalone: true,
  imports: [CommonModule, UnreadBadge, Avatar, Badge],
  templateUrl: './conversation-item.html',
  styleUrl: './conversation-item.scss',
})
export class ConversationItem {
  // Inputs usando signals API
  readonly conversation = input.required<Chat>();
  readonly isSelected = input<boolean>(false);

  // Estado de presencia del participante (opcional)
  readonly participantPresenceStatus = input<PresenceStatus | undefined>(undefined);

  // Outputs usando signals API
  readonly conversationSelected = output<Chat>();

  // Computed para determinar si mostrar badge de presencia
  readonly showPresenceBadge = computed(() => {
    return this.participantPresenceStatus() !== undefined;
  });

  // Computed: true cuando la conversación pertenece al sandbox del tour
  readonly isDemo = computed(() => isDemoId(this.conversation().chatId));

  // Computed para obtener datos del visitante para el avatar
  readonly visitorId = computed(() => {
    const chat = this.conversation();
    const visitor = chat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.id || chat.chatId;
  });

  readonly visitorName = computed(() => this.getChatDisplayName());

  readonly visitorEmail = computed(() => {
    const chat = this.conversation();
    const visitor = chat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.email;
  });

  /**
   * Manejar click en la conversación
   */
  onConversationClick(): void {
    this.conversationSelected.emit(this.conversation());
  }

  /**
   * Obtener nombre para mostrar del chat
   */
  getChatDisplayName(): string {
    const chat = this.conversation();
    // Si el chat tiene un nombre personalizado válido, usarlo
    if (chat.name && chat.name !== 'Chat sin título' && chat.name !== 'Visitante') {
      return chat.name;
    }

    // Obtener el visitante del chat
    const visitor = chat.participants?.find((p: User) => p.role === 'visitor');

    // Usar función centralizada para obtener el nombre de visualización
    return getVisitorDisplayName({
      id: visitor?.id,
      name: visitor?.name,
      email: visitor?.email,
    });
  }

  /**
   * Obtener avatar del chat
   */
  getChatAvatar(): string {
    const chat = this.conversation();
    if (chat.participants && chat.participants.length > 2) {
      return '👥';
    }

  const visitor = chat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.avatar || '👤';
  }

  /**
   * Devuelve true si el avatar parece una URL (imagen remota/local).
   * Usado por la plantilla para decidir entre <img> o SVG fallback.
   */
  isAvatarUrl(): boolean {
    const avatar = this.getChatAvatar();
    if (!avatar) return false;
    // Considerar que una URL contiene 'http' o empieza con '/' (ruta relativa)
    return typeof avatar === 'string' && (avatar.startsWith('http') || avatar.startsWith('/'));
  }

  /**
   * Obtener preview del último mensaje
   */
  getChatPreview(): string {
    const chat = this.conversation();
    if (!chat.lastMessage) {
      return 'Sin mensajes';
    }

    const message = chat.lastMessage;
    if (message.type === 'TEXT') {
      return message.content.length > 60
        ? message.content.substring(0, 60) + '...'
        : message.content;
    }

    switch (message.type) {
      case 'IMAGE': return '📷 Imagen';
      case 'FILE': return '📎 Archivo';
      case 'AUDIO': return '🎵 Audio';
      case 'VIDEO': return '🎥 Video';
      case 'SYSTEM': return '📢 Mensaje del sistema';
      default: return 'Mensaje';
    }
  }

  /**
   * Formatear tiempo del chat
   * - Hoy: Solo hora → "11:37"
   * - Esta semana: Día de la semana → "lunes", "martes", etc.
   * - Más antiguo: Fecha completa → "7/12/2025"
   */
  formatChatTime(): string {
    const chat = this.conversation();
    if (!chat.lastMessage?.sentAt) return '';

    try {
      const date = new Date(chat.lastMessage.sentAt);
      if (isNaN(date.getTime())) return '';

      const now = new Date();

      // Verificar si es hoy
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        // Mostrar solo hora: "11:37"
        return date.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      }

      // Verificar si es esta semana (últimos 7 días pero no hoy)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo de esta semana
      startOfWeek.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
      if (diffDays < 7 && date >= startOfWeek) {
        // Mostrar día de la semana: "lunes", "martes", etc.
        return date.toLocaleDateString('es-ES', {
          weekday: 'long'
        });
      }

      // Más de una semana: fecha completa "7/12/2025"
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.warn('Error al formatear fecha:', chat.lastMessage.sentAt, error);
      return '';
    }
  }

  /**
   * Obtener datetime string para el atributo HTML
   */
  getChatDatetime(): string | null {
    const chat = this.conversation();
    if (!chat.lastMessage?.sentAt) return null;

    try {
      return new Date(chat.lastMessage.sentAt).toISOString();
    } catch {
      return null;
    }
  }

}