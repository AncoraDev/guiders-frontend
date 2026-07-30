import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  computed,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chat, User, PresenceStatus, Participant } from '@guiders-frontend/shared/types';
import { IconComponent } from '@guiders-frontend/icon';
import { Message } from '@guiders-frontend/shared/types';
import { MessageInput } from '@guiders-frontend/chat/ui/message-input';
import { PresenceService } from '@guiders-frontend/presence-service';
import { Avatar } from '@guiders-frontend/avatar';
import { getVisitorDisplayName } from '@guiders-frontend/visitor-display-name';

/** Datos de contexto del visitante para la cabecera del chat. */
export interface VisitorChatProfile {
  currentUrl?: string | null;
  totalSessions?: number;
  totalPagesVisited?: number;
  totalTimeConnectedMs?: number;
  totalChats?: number;
  lifecycle?: string | null;
  browser?: string | null;
  lastActivityAt?: string | null;
}

@Component({
  selector: 'guiders-chat-placeholder',
  standalone: true,
  imports: [CommonModule, Avatar, IconComponent, MessageInput],
  templateUrl: './chat-placeholder.html',
  styleUrl: './chat-placeholder.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidersChatPlaceholderComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly presenceService = inject(PresenceService);
  
  @Input({ required: true }) selectedChat!: Chat;
  @Input() showActions = true;
  @Input() isPanelOpen = false; // Estado del panel de detalles del visitante
  @Input() placeholderMessage = 'Envía un mensaje para iniciar la conversación';
  @Input() messages: Message[] = [];
  @Input() currentUserId: string | null = null;
  @Input() isLoading = false;
  @Input() isLoadingMore = false; // Loading para scroll infinito
  @Input() hasMoreMessages = false; // Indica si hay más mensajes antiguos
  /** Perfil/navegación del visitante (página actual, sesiones, etc.). */
  @Input() visitorProfile: VisitorChatProfile | null = null;

  @Output() settingsClicked = new EventEmitter<void>();
  @Output() closeChat = new EventEmitter<void>();
  @Output() messageSent = new EventEmitter<string>();
  @Output() loadMoreMessages = new EventEmitter<void>(); // Evento para cargar más mensajes

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;

  private intersectionObserver?: IntersectionObserver;
  private shouldScrollToBottom = true;
  private previousScrollHeight = 0;
  private isHandlingIntersection = false; // Flag para evitar llamadas duplicadas

  /**
   * Computed properties para el Avatar component
   */
  readonly visitorId = computed(() => {
    const visitor = this.selectedChat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.id || this.selectedChat.chatId || 'anonymous';
  });

  readonly visitorName = computed(() => {
    const visitor = this.selectedChat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.name;
  });

  readonly visitorEmail = computed(() => {
    const visitor = this.selectedChat.participants?.find((p: User) => p.role === 'visitor');
    return visitor?.email;
  });

  /**
   * Obtener nombre para mostrar del chat
   */
  getChatDisplayName(): string {
    const chat = this.selectedChat;
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
   * Obtener información del estado del chat
   */
  getChatStatusInfo(): { label: string; color: string; icon: string } {
    const status = this.selectedChat.status;
    switch (status) {
      case 'ACTIVE':
        return { label: 'Activo', color: 'success', icon: 'check-circle' };
      case 'PENDING':
        return { label: 'Pendiente', color: 'warning', icon: 'clock' };
      case 'CLOSED':
        return { label: 'Cerrado', color: 'neutral', icon: 'x' };
      case 'TRANSFERRED':
        return { label: 'Transferido', color: 'info', icon: 'arrow-right' };
      case 'ASSIGNED':
        return { label: 'Asignado', color: 'info', icon: 'user' };
      default:
        return { label: 'Desconocido', color: 'neutral', icon: 'help-circle' };
    }
  }

  /**
   * Obtener estado de presencia del otro participante
   */
  getParticipantPresenceStatus(): PresenceStatus | undefined {
    const otherParticipant = this.selectedChat.participants?.find(
      (p: User) => p.id !== this.currentUserId
    );

    if (!otherParticipant) return undefined;

    const participant = this.presenceService.getParticipantPresence(
      this.selectedChat.chatId,
      otherParticipant.id
    );

    return participant?.connectionStatus;
  }

  /**
   * Obtener texto descriptivo del estado de presencia
   */
  getPresenceStatusLabel(status?: PresenceStatus): string {
    if (!status) return '';

    const labels: Record<PresenceStatus, string> = {
      online: 'En línea',
      offline: 'Desconectado',
      away: 'Ausente',
      busy: 'Ocupado',
      chatting: 'Conversando',
    };

    return labels[status];
  }

  /** Path legible de la URL actual (o host+path si hace falta). */
  profilePath(url?: string | null): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const path = `${parsed.pathname}${parsed.search}` || '/';
      return path.length > 64 ? `${path.slice(0, 61)}…` : path;
    } catch {
      return url.length > 64 ? `${url.slice(0, 61)}…` : url;
    }
  }

  formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  /**
   * Manejar click en configuración
   */
  onSettingsClick(): void {
    this.settingsClicked.emit();
  }

  /**
   * Obtener nombre de ícono para el estado (con tipos válidos)
   */
  getStatusIconName(): 'check' | 'clock' | 'close' | 'arrow-right' | 'user' | 'help-circle' {
    const status = this.selectedChat.status;
    switch (status) {
      case 'ACTIVE': return 'check';
      case 'PENDING': return 'clock';
      case 'CLOSED': return 'close';
      case 'TRANSFERRED': return 'arrow-right';
      case 'ASSIGNED': return 'user';
      default: return 'help-circle';
    }
  }

  /**
   * Manejar cierre del chat
   */
  onCloseChat(): void {
    this.closeChat.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visitorProfile']) {
      this.cdr.markForCheck();
    }

    // Si cambia el chat seleccionado, hacer scroll al final
    if (changes['selectedChat']) {
      this.shouldScrollToBottom = true;
      this.scheduleScrollToBottom();
      // Limpiar y reconfigurar observer cuando cambia el chat
      this.cleanupIntersectionObserver();
      this.isHandlingIntersection = false;
    }

    // Si se agregan mensajes nuevos (al final), hacer scroll al final
    if (changes['messages'] && !changes['messages'].firstChange) {
      const prev = changes['messages'].previousValue as Message[];
      const curr = changes['messages'].currentValue as Message[];
      
      // Si hay más mensajes y el último mensaje cambió, es un mensaje nuevo al final
      if (curr.length > prev.length) {
        const lastPrevMessage = prev[prev.length - 1];
        const lastCurrMessage = curr[curr.length - 1];
        
        if (!lastPrevMessage || lastPrevMessage.messageId !== lastCurrMessage.messageId) {
          // Mensaje nuevo al final, hacer scroll
          this.shouldScrollToBottom = true;
          this.scheduleScrollToBottom();
        } else {
          // Mensajes agregados al inicio (scroll infinito), preservar posición
          this.shouldScrollToBottom = false;
          this.preserveScrollPosition();
        }
      }
    }

    // Si cambia hasMoreMessages O isLoadingMore, reconfigurar el observer
    if (changes['hasMoreMessages'] || changes['isLoadingMore']) {
      const hasMore = this.hasMoreMessages;
      const isLoading = this.isLoadingMore;
      
      console.log('[ChatPlaceholder] Estado de carga cambió:', { hasMore, isLoading });
      
      // Solo reconfigurar si terminó de cargar
      if (changes['isLoadingMore'] && !isLoading && changes['isLoadingMore'].previousValue) {
        console.log('[ChatPlaceholder] Carga completada, reseteando flag');
        this.isHandlingIntersection = false;
        
        // Reconfigurar observer después de cargar mensajes
        if (hasMore) {
          this.cleanupIntersectionObserver();
          setTimeout(() => {
            this.setupIntersectionObserver();
          }, 200);
        }
      } else if (changes['hasMoreMessages']?.currentValue && !isLoading) {
        // Solo configurar si no está cargando
        this.cleanupIntersectionObserver();
        setTimeout(() => {
          this.setupIntersectionObserver();
        }, 100);
      }
    }
  }

  ngAfterViewInit(): void {
    this.scheduleScrollToBottom();
    // Configurar observer si hay más mensajes
    if (this.hasMoreMessages) {
      setTimeout(() => {
        this.setupIntersectionObserver();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.cleanupIntersectionObserver();
  }

  /**
   * Configurar IntersectionObserver para detectar scroll al inicio
   */
  private setupIntersectionObserver(): void {
    console.log('[ChatPlaceholder] Configurando IntersectionObserver...');
    console.log('[ChatPlaceholder] scrollAnchor existe?', !!this.scrollAnchor);
    console.log('[ChatPlaceholder] messagesContainer existe?', !!this.messagesContainer);
    console.log('[ChatPlaceholder] hasMoreMessages:', this.hasMoreMessages);
    
    if (!this.scrollAnchor) {
      console.warn('[ChatPlaceholder] No se puede configurar observer: scrollAnchor no disponible');
      return;
    }

    if (!this.messagesContainer) {
      console.warn('[ChatPlaceholder] No se puede configurar observer: messagesContainer no disponible');
      return;
    }

    // Limpiar observer anterior si existe
    this.cleanupIntersectionObserver();

    const options: IntersectionObserverInit = {
      root: this.messagesContainer.nativeElement,
      rootMargin: '50px', // Aumentado de 20px a 50px para detectar antes
      threshold: 0.1
    };

    console.log('[ChatPlaceholder] Creando IntersectionObserver con opciones:', options);

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        console.log('[ChatPlaceholder] IntersectionObserver callback:', {
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          isLoadingMore: this.isLoadingMore,
          hasMoreMessages: this.hasMoreMessages,
          isHandlingIntersection: this.isHandlingIntersection
        });

        // Usar flag para evitar llamadas duplicadas
        if (entry.isIntersecting && 
            !this.isLoadingMore && 
            this.hasMoreMessages && 
            !this.isHandlingIntersection) {
          
          console.log('[ChatPlaceholder] ✅ Condiciones cumplidas, emitiendo loadMoreMessages');
          this.isHandlingIntersection = true; // Marcar como manejando
          this.loadMoreMessages.emit();
          
          // El flag se reseteará cuando isLoadingMore cambie en ngOnChanges
        } else {
          if (!entry.isIntersecting) {
            console.log('[ChatPlaceholder] ⏸️ Scroll anchor no visible');
          }
          if (this.isLoadingMore) {
            console.log('[ChatPlaceholder] ⏸️ Ya está cargando más mensajes');
          }
          if (!this.hasMoreMessages) {
            console.log('[ChatPlaceholder] ⏸️ No hay más mensajes para cargar');
          }
          if (this.isHandlingIntersection) {
            console.log('[ChatPlaceholder] ⏸️ Ya se está manejando una intersección');
          }
        }
      });
    }, options);

    this.intersectionObserver.observe(this.scrollAnchor.nativeElement);
    console.log('[ChatPlaceholder] ✅ Observer configurado y observando scrollAnchor');
  }

  /**
   * Limpiar IntersectionObserver
   */
  private cleanupIntersectionObserver(): void {
    if (this.intersectionObserver) {
      console.log('[ChatPlaceholder] Limpiando IntersectionObserver');
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }
  }

  /**
   * Preservar posición del scroll al insertar mensajes antiguos
   */
  private preserveScrollPosition(): void {
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;

    // Guardar altura antes de la actualización
    this.previousScrollHeight = container.scrollHeight;

    // Forzar detección de cambios
    this.cdr.detectChanges();

    // Ajustar scroll después de renderizar
    setTimeout(() => {
      if (!container) return;
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - this.previousScrollHeight;
      
      if (scrollDiff > 0) {
        container.scrollTop += scrollDiff;
        console.log(`[ChatPlaceholder] Preserved scroll position. Adjusted by ${scrollDiff}px`);
      }
    }, 0);
  }

  trackMessageById(index: number, message: Message): string {
    return message.messageId;
  }

  isOwnMessage(message: Message): boolean {
    if (this.currentUserId) {
      return message.senderId === this.currentUserId;
    }
    return message.senderType === 'COMMERCIAL';
  }

  isSystemMessage(message: Message): boolean {
    return message.senderType === 'SYSTEM';
  }

  getSenderLabel(message: Message): string {
    if (this.isSystemMessage(message)) {
      return 'Sistema';
    }

    if (this.isOwnMessage(message)) {
      return 'Tú';
    }

    // Buscar el participante que envió el mensaje
    const participant = this.selectedChat.participants?.find((p: User) => p.id === message.senderId);

    // Si encontramos el participante, usar función centralizada
    if (participant) {
      return getVisitorDisplayName({
        id: participant.id,
        name: participant.name,
        email: participant.email,
      });
    }

    // Fallback por tipo de remitente si no se encuentra el participante
    switch (message.senderType) {
      case 'VISITOR':
        return 'Visitante anónimo';
      case 'COMMERCIAL':
        return 'Agente';
      default:
        return 'Sistema';
    }
  }

  formatMessageTime(value: Date | string | number | null | undefined): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  /**
   * Determina si debe mostrarse un separador de fecha antes de este mensaje
   */
  shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true; // Siempre mostrar separador para el primer mensaje
    
    const currentMessage = this.messages[index];
    const previousMessage = this.messages[index - 1];
    
    if (!currentMessage?.sentAt || !previousMessage?.sentAt) return false;
    
    const currentDate = new Date(currentMessage.sentAt);
    const previousDate = new Date(previousMessage.sentAt);
    
    // Comparar solo año, mes y día (ignorar hora)
    return currentDate.toDateString() !== previousDate.toDateString();
  }

  /**
   * Formatea la fecha del separador al estilo WhatsApp
   * Retorna: "Hoy", "Ayer", o fecha formateada
   */
  formatDateSeparator(value: Date | string | number | null | undefined): string {
    if (!value) return '';
    
    const messageDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(messageDate.getTime())) return '';
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Resetear horas para comparación exacta de fechas
    const resetTime = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    
    const messageDateOnly = resetTime(messageDate);
    const todayOnly = resetTime(today);
    const yesterdayOnly = resetTime(yesterday);
    
    if (messageDateOnly.getTime() === todayOnly.getTime()) {
      return 'Hoy';
    }
    
    if (messageDateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Ayer';
    }
    
    // Para fechas más antiguas, mostrar fecha completa
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(messageDate);
  }

  onMessageSent(content: string): void {
    this.messageSent.emit(content);
  }

  private scheduleScrollToBottom(): void {
    if (!this.shouldScrollToBottom) return;
    
    // Forzar detección de cambios antes del scroll (OnPush strategy)
    this.cdr.detectChanges();
    
    // Usar setTimeout para dar tiempo al DOM a renderizar completamente
    setTimeout(() => this.scrollToBottom(), 0);
  }

  private scrollToBottom(): void {
    const container = this.messagesContainer?.nativeElement;
    if (!container) {
      return;
    }
    
    // Verificar que realmente hay contenido para hacer scroll
    if (container.scrollHeight > container.clientHeight) {
      container.scrollTop = container.scrollHeight;
    }
  }
}