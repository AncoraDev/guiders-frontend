import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chat, User } from '@guiders-frontend/shared/types';
import { TextField } from '@guiders-frontend/text-field';
import { Badge } from '@guiders-frontend/badge';
import { UserService } from '@guiders-frontend/auth/data-access/session';

@Component({
  selector: 'guiders-chat-list',
  imports: [CommonModule, FormsModule, TextField, Badge],
  templateUrl: './chat-list.html',
  styleUrl: './chat-list.scss',
})
export class ChatList {
  // Servicios
  private readonly userService = inject(UserService);

  // Inputs usando signals API
  readonly chats = input.required<Chat[]>();
  readonly selectedChatId = input<string | null>(null);
  readonly loading = input<boolean>(false);
  readonly showSearch = input<boolean>(true);

  // Outputs usando signals API
  readonly chatSelect = output<Chat>();
  readonly searchChange = output<string>();

  // Estado interno con signals
  readonly searchQuery = signal<string>('');

  // Computed values
  readonly filteredChats = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.chats();
    
    return this.chats().filter(chat => {
      const chatName = this.getChatName(chat).toLowerCase();
      const lastMessageContent = chat.lastMessage?.content.toLowerCase() || '';
      return chatName.includes(query) || lastMessageContent.includes(query);
    });
  });

  // Métodos
  onChatClick(chat: Chat): void {
    this.chatSelect.emit(chat);
  }

  onSearchValueChange(value: string): void {
    this.searchQuery.set(value);
    this.searchChange.emit(value);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = target.value;
    this.searchQuery.set(query);
    this.searchChange.emit(query);
  }

  getChatName(chat: Chat): string {
    // Si el chat tiene un nombre específico, usarlo
    if (chat.name && chat.name !== 'Chat sin título') {
      return chat.name;
    }

    if (chat.participants && chat.participants.length > 2) {
      return chat.name || 'Grupo sin nombre';
    }

    // Para chats directos, obtener el nombre del otro participante
    const currentUserId = this.userService.getUserId();
    const otherParticipant = chat.participants?.find(p => p.id !== currentUserId);

    if (otherParticipant?.name && otherParticipant.name.trim()) {
      return otherParticipant.name;
    }

    if (otherParticipant?.email && otherParticipant.email.trim()) {
      return otherParticipant.email;
    }

    // Usar el nombre calculado del chat si está disponible
    if (chat.name && chat.name !== 'Chat sin título') {
      return chat.name;
    }

    return 'Visitante';
  }

  getChatAvatar(chat: Chat): string {
    if (chat.participants && chat.participants.length > 2) {
      return '👥'; // Avatar por defecto para grupos
    }
    
    const currentUserId = this.userService.getUserId();
    const otherParticipant = chat.participants?.find(p => p.id !== currentUserId);
    return otherParticipant?.avatar || '👤';
  }

  formatLastMessageTime(timestamp: Date | string | undefined): string {
    if (!timestamp) return '';

    try {
      const date = new Date(timestamp);

      // Verificar si la fecha es válida
      if (isNaN(date.getTime())) {
        return '';
      }

      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Ahora';
      if (minutes < 60) return `${minutes}m`;
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;

      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    } catch (error) {
      console.warn('Error al formatear fecha:', timestamp, error);
      return '';
    }
  }

  formatLastMessage(chat: Chat): string {
    if (!chat.lastMessage) return 'Sin mensajes';
    
    const message = chat.lastMessage;
    const maxLength = 50;
    if (message.systemData?.action === 'contact_request') return 'Solicitud de datos';
    if (message.systemData?.action === 'contact_submission') return 'Datos recibidos';
    
    if (message.type === 'TEXT') {
      return message.content.length > maxLength 
        ? message.content.substring(0, maxLength) + '...'
        : message.content;
    }
    
    switch (message.type) {
      case 'IMAGE': return '📷 Imagen';
      case 'FILE': return '📎 Archivo';
      case 'AUDIO': return '🎵 Audio';
      case 'VIDEO': return '🎥 Video';
      case 'SYSTEM': return '📢 Mensaje del sistema';
      case 'INTERACTIVE':
        return /enviados/i.test(message.content) ? 'Datos recibidos' : 'Solicitud de datos';
      default: return 'Mensaje';
    }
  }

  isSelected(chat: Chat): boolean {
    return this.selectedChatId() === chat.chatId;
  }

  getStatusColor(user: User): string {
    switch (user.status) {
      case 'online': return '#4CAF50';
      case 'away': return '#FF9800';
      case 'busy': return '#F44336';
      default: return '#9E9E9E';
    }
  }
}
