import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, interval, of } from 'rxjs';
import {
  catchError,
  filter,
  finalize,
  map,
  startWith,
  switchMap,
} from 'rxjs/operators';
import { ChatService } from '@guiders-frontend/chat-service';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import type { CannedReply } from '@guiders-frontend/auth/data-access/session';
import { ProfileService } from '@guiders-frontend/profile-service';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { PresenceService } from '@guiders-frontend/presence-service';
import {
  VisitorsDataService,
  VisitorActivity,
} from '@guiders-frontend/visitors-data-service';
import { GuidersChatPlaceholderComponent } from '@guiders-frontend/chat/ui/chat-placeholder';
import type { VisitorChatProfile } from '@guiders-frontend/chat/ui/chat-placeholder';
import type {
  MessageSendPayload,
  SlashCommand,
} from '@guiders-frontend/chat/ui/message-input';
import type { ContactRequestCardConfirm } from '@guiders-frontend/chat/ui/contact-request-card';
import { GuidersChatWelcomeStateComponent } from '@guiders-frontend/chat/ui/chat-welcome-state';
import { VisitorDetailPanel } from '@guiders-frontend/visitor-detail-panel';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import {
  getContactDisplayName,
  getVisitorDisplayName,
} from '@guiders-frontend/visitor-display-name';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { StatusSelector } from '@guiders-frontend/status-selector';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';
import { CompanyUsersService } from '@guiders-frontend/company-users-service';
import {
  Chat,
  LeadContactData,
  Message,
  PresenceStatus,
  SaveContactDataRequest,
  Visitor,
  VisitorPageHistoryItem,
  VisitorSearchResult,
} from '@guiders-frontend/shared/types';

/** Offline sin no-leídos más antiguos que esto → sección inactivos. */
const MINE_ACTIVE_MS = 48 * 60 * 60 * 1000;
/** Polling silencioso para colas (presencia/unread van por WebSocket). */
const POLL_MS = 4000;
const VISITOR_HISTORY_CHAT_LIMIT = 10;
const VISITOR_HISTORY_MSG_LIMIT = 50;
/** Saludo por defecto al CTA "Saludar" (En la web). */
const DEFAULT_GREETING = '¡Hola! ¿En qué puedo ayudarte?';
const PREVIEW_MAX_CHARS = 80;

export type AtencionCola = 'pendientes' | 'mios' | 'en-web';

export interface AtencionListItem {
  id: string;
  kind: 'pending' | 'mine' | 'web';
  title: string;
  subtitle: string;
  /** Preview truncado del último mensaje (Pendientes / Míos). */
  preview?: string;
  /** Página / URL corta cuando está disponible. */
  pageLabel?: string;
  /** Lead = nombre + (email|tel) o lifecycle LEAD/CONVERTED. */
  isLead?: boolean;
  chatId?: string;
  visitorId: string;
  unreadCount: number;
  statusLabel: string;
  presence?: PresenceStatus;
  updatedAtMs?: number;
  rawChat?: Chat;
  rawVisitor?: VisitorSearchResult;
}

/**
 * Atención — espacio operativo único del comercial.
 * Colas: Pendientes (claim al abrir) / Míos / En la web.
 */
@Component({
  selector: 'lib-atencion',
  standalone: true,
  imports: [
    CommonModule,
    GuidersChatPlaceholderComponent,
    GuidersChatWelcomeStateComponent,
    VisitorDetailPanel,
    StatusSelector,
  ],
  templateUrl: './atencion.html',
  styleUrl: './atencion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Atencion implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly chatService = inject(ChatService);
  private readonly sessionService = inject(SessionService);
  private readonly profileService = inject(ProfileService);
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly presenceService = inject(PresenceService);
  private readonly visitorsService = inject(VisitorsDataService);
  private readonly leadContactService = inject(LeadContactService);
  private readonly toastService = inject(ToastService);
  private readonly commercialPresence = inject(CommercialPresenceService);
  private readonly companyUsersService = inject(CompanyUsersService);
  private readonly route = inject(ActivatedRoute);

  /** Chats PENDING ya notificados (WS + poll) para no duplicar toasts. */
  private readonly notifiedPendingChatIds = new Set<string>();
  private contactRequestInFlight = false;
  /** Visitantes que el WS marcó offline: no re-entrar por PENDING vacío. */
  private readonly offlineWebVisitorIds = new Set<string>();
  /** Tras el primer refresh, el poll puede emitir toasts por deltas. */
  private pendingToastBaselineReady = false;
  private readonly onChatCreated = (data: unknown): void => {
    const payload = data as {
      chatId?: string;
      visitorId?: string;
      status?: string;
      commercialId?: string;
      visitorInfo?: { name?: string; email?: string };
    };
    if (!payload?.chatId) return;

    const status = String(payload.status ?? '').toUpperCase();
    const isPending =
      status === 'PENDING' || (!payload.commercialId && status !== 'ASSIGNED');
    if (!isPending) return;

    this.chatService.webSocketService.joinRoom(payload.chatId);
    this.unreadMessagesService.includeNotifyChat(payload.chatId);

    this.ngZone.run(() => {
      this.refreshAll(true);
    });
  };

  /** Chats Pendientes + Míos unidos por WS (notificación de escritorio). */
  private wiredQueueChatIds = new Set<string>();

  /**
   * Transferencia en Atención: el origen suelta sala; el destino refresca Míos.
   * El toast lo muestra TransferNotificationService (shell global de Console).
   */
  private readonly onCommercialAssigned = (data: unknown): void => {
    const payload = data as {
      chatId?: string;
      commercialId?: string;
      assignmentReason?: string;
      previousCommercialId?: string;
    };
    if (!payload?.chatId || !payload.commercialId) return;
    if (payload.assignmentReason !== 'transfer') return;

    const selfId = this.currentUserId();
    if (!selfId) return;

    // Origen: dejar de recibir message:new / notificaciones de este chat
    if (payload.previousCommercialId === selfId) {
      this.ngZone.run(() => {
        this.releaseChatRealtime(payload.chatId!);
        this.mineItems.update((list) =>
          list.filter((item) => item.chatId !== payload.chatId),
        );
        if (this.selectedChat()?.chatId === payload.chatId) {
          this.clearSelectedChat();
        }
        this.refreshAll(true);
      });
      return;
    }

    if (payload.commercialId !== selfId) return;

    this.ngZone.run(() => {
      this.refreshAll(true);
      this.activeCola.set('mios');
    });
  };

  readonly activeCola = signal<AtencionCola>('mios');
  /** Desconectado = solo lectura: no atender, no saludar, no escribir. */
  readonly isPresenceConnected = signal(false);
  /** Permiso de Notification API para el aviso de escritorio. */
  readonly desktopPermission = signal<NotificationPermission | 'unsupported'>(
    'default'
  );
  /** Saludo del perfil; vacío = DEFAULT_GREETING. */
  private readonly greetingMessage = signal<string | null>(null);
  private readonly mineCannedReplies = signal<CannedReply[]>([]);
  private readonly teamCannedReplies = signal<CannedReply[]>([]);
  readonly isLoading = signal(false);
  readonly isClaiming = signal(false);
  /** Solo estado de carga/sesión: el poll lo limpia cada 4s. Los errores de
   * acción (saludar, reclamar, enviar) van por toast para no perderse. */
  readonly error = signal<string | null>(null);
  readonly showInactiveMios = signal(false);

  readonly pendingItems = signal<AtencionListItem[]>([]);
  readonly mineItems = signal<AtencionListItem[]>([]);
  readonly webItems = signal<AtencionListItem[]>([]);
  /** Presencia del visitante por chatId (Míos / chat abierto). */
  readonly presenceByChat = signal<Record<string, PresenceStatus | undefined>>(
    {}
  );

  readonly selectedItemId = signal<string | null>(null);
  readonly selectedChat = signal<Chat | null>(null);
  readonly messages = signal<Message[]>([]);
  readonly messagesLoading = signal(false);
  readonly visitorProfile = signal<VisitorChatProfile | null>(null);
  readonly visitorActivity = signal<VisitorActivity | null>(null);
  readonly visitorContactData = signal<LeadContactData | null>(null);
  readonly savingContactData = signal(false);
  /** Confirmaciones aplicadas en esta sesión, antes de que llegue el mensaje. */
  private readonly optimisticConfirmedRequestIds = signal<string[]>([]);
  /**
   * El backend deja un mensaje `contact_confirmation` en el hilo, así que el
   * estado confirmado se deriva de los mensajes y sobrevive a un recargo.
   */
  readonly confirmedContactRequestIds = computed(() => {
    const ids = new Set(this.optimisticConfirmedRequestIds());
    for (const message of this.messages()) {
      const systemData = message.systemData;
      if (!systemData?.requestId) continue;
      if (
        systemData.action === 'contact_confirmation' ||
        systemData.status === 'confirmed'
      ) {
        ids.add(systemData.requestId);
      }
    }
    return Array.from(ids);
  });
  readonly showVisitorPanel = signal(false);
  /** Comerciales online (excluye al usuario actual) para @mention. */
  readonly mentionCandidates = signal<
    Array<{ id: string; name: string; avatarUrl?: string | null }>
  >([]);
  /** Layout estrecho: ficha del visitante en overlay (no resta ancho al chat). */
  readonly isCompactLayout = signal(false);
  readonly pageHistory = signal<VisitorPageHistoryItem[]>([]);
  readonly pageHistoryTotal = signal(0);
  readonly pageHistoryLoading = signal(false);

  private compactMql: MediaQueryList | null = null;
  private readonly onCompactLayoutChange = (event: MediaQueryListEvent): void => {
    this.applyCompactLayout(event.matches);
  };

  readonly currentUserId = computed(
    () => this.sessionService.getCurrentUser()?.sub ?? null
  );
  readonly companyId = computed(
    () => this.sessionService.getCurrentUser()?.companyId ?? null
  );

  /** Míos enriquecidos con presencia + unread en vivo. */
  readonly enrichedMineItems = computed(() => {
    const presence = this.presenceByChat();
    const unread = this.unreadMessagesService.unreadCountMap();
    return this.mineItems()
      .map((item) => {
        const chatId = item.chatId;
        const p = chatId ? presence[chatId] : undefined;
        return {
          ...item,
          presence: p,
          statusLabel: this.presenceLabel(p),
          unreadCount: chatId ? unread[chatId] ?? item.unreadCount : item.unreadCount,
        };
      })
      .sort((a, b) => this.compareMineItems(a, b));
  });

  readonly activeMineItems = computed(() =>
    this.enrichedMineItems().filter((i) => this.isMineActive(i))
  );

  readonly inactiveMineItems = computed(() =>
    this.enrichedMineItems().filter((i) => !this.isMineActive(i))
  );

  readonly listItems = computed(() => {
    switch (this.activeCola()) {
      case 'mios': {
        const active = this.activeMineItems();
        if (this.showInactiveMios()) {
          return [...active, ...this.inactiveMineItems()];
        }
        return active;
      }
      case 'en-web':
        return this.webItems();
      default:
        return this.pendingItems().map((item) => ({
          ...item,
          unreadCount: item.chatId
            ? this.unreadMessagesService.unreadCountMap()[item.chatId] ??
              item.unreadCount
            : item.unreadCount,
        }));
    }
  });

  readonly pendingCount = computed(() => this.pendingItems().length);
  readonly mineCount = computed(() => this.activeMineItems().length);
  readonly inactiveMineCount = computed(() => this.inactiveMineItems().length);
  readonly mineUnreadCount = computed(() =>
    this.enrichedMineItems().reduce((sum, i) => sum + (i.unreadCount || 0), 0)
  );
  readonly webCount = computed(() => this.webItems().length);

  readonly selectedItem = computed(() => {
    const id = this.selectedItemId();
    if (!id) return null;
    return (
      this.listItems().find((i) => i.id === id) ??
      this.pendingItems().find((i) => i.id === id) ??
      this.enrichedMineItems().find((i) => i.id === id) ??
      this.webItems().find((i) => i.id === id) ??
      null
    );
  });

  /** Visitante para el panel lateral de detalles. */
  readonly selectedVisitor = computed((): Visitor | null => {
    const chat = this.selectedChat();
    if (!chat) return null;

    const visitorId = chat.visitorId;
    if (!visitorId) return null;

    const participant = chat.participants?.find((p) => p.role === 'visitor');
    const presence = chat.chatId
      ? this.presenceByChat()[chat.chatId]
      : undefined;
    let status: 'online' | 'offline' | 'idle' = 'offline';
    if (presence === 'online' || presence === 'chatting') status = 'online';
    else if (presence === 'away' || presence === 'busy') status = 'idle';

    const activity = this.visitorActivity();
    const currentUrl =
      this.visitorProfile()?.currentUrl || activity?.currentUrl || undefined;
    let domain = '';
    if (currentUrl) {
      try {
        domain = new URL(currentUrl).hostname;
      } catch {
        domain = '';
      }
    }

    const contact = this.visitorContactData();
    const contactName = getContactDisplayName(contact);
    const personName = [contact?.nombre, contact?.apellidos]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    // contactName ya incluye "Alias (Nombre Apellidos)" cuando hay alias
    const displayName =
      contactName ||
      getVisitorDisplayName({
        id: visitorId,
        alias: contact?.alias,
        name: personName || participant?.name,
        email: contact?.email || participant?.email,
      });

    return {
      id: visitorId,
      siteId: 'site-001',
      companyId: this.companyId() || 'company-001',
      name: displayName,
      email: contact?.email || participant?.email,
      phone: contact?.telefono,
      domain,
      currentUrl,
      status,
      lifecycle: activity?.lifecycle || 'ANON',
      firstVisit: chat.createdAt ? new Date(chat.createdAt) : new Date(),
      lastVisit: activity?.lastActivityAt
        ? new Date(activity.lastActivityAt)
        : chat.updatedAt
          ? new Date(chat.updatedAt)
          : new Date(),
      totalChats: activity?.totalChats ?? 0,
      totalSessions: activity?.totalSessions ?? 0,
      totalPageViews: activity?.totalPagesVisited ?? 0,
      averageSessionDuration: activity
        ? Math.floor(activity.totalTimeConnectedMs / 1000)
        : 0,
      isNewVisitor: (activity?.totalSessions ?? 0) <= 1,
      hasActiveChat: true,
    };
  });

  readonly slashCommands = computed<SlashCommand[]>(() => {
    const commands: SlashCommand[] = [
      {
        id: 'request-contact',
        label: 'Solicitar datos',
        hint: 'Pide nombre, email, teléfono y población',
        kind: 'action',
        group: 'action',
      },
    ];
    for (const item of this.teamCannedReplies()) {
      commands.push({
        id: `team:${item.id}`,
        label: item.title,
        hint: item.body,
        kind: 'snippet',
        group: 'team',
        body: item.body,
      });
    }
    for (const item of this.mineCannedReplies()) {
      commands.push({
        id: `mine:${item.id}`,
        label: item.title,
        hint: item.body,
        kind: 'snippet',
        group: 'mine',
        body: item.body,
      });
    }
    return commands;
  });

  ngOnInit(): void {
    const userId = this.currentUserId();
    if (userId) {
      this.unreadMessagesService.setCurrentUser(userId);
    }

    this.profileService
      .getUserProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.greetingMessage.set(profile.greetingMessage ?? null);
          this.mineCannedReplies.set(profile.cannedReplies ?? []);
        },
        error: () => this.greetingMessage.set(null),
      });

    this.profileService
      .getTeamCannedReplies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.teamCannedReplies.set(items),
        error: () => this.teamCannedReplies.set([]),
      });

    const colaParam = this.route.snapshot.queryParamMap.get('cola');
    if (
      colaParam === 'mios' ||
      colaParam === 'en-web' ||
      colaParam === 'pendientes'
    ) {
      this.activeCola.set(colaParam);
    }

    this.commercialPresence.isConnected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((connected) => this.isPresenceConnected.set(connected));

    this.refreshDesktopPermission();
    const onWindowFocus = () => this.refreshDesktopPermission();
    window.addEventListener('focus', onWindowFocus);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('focus', onWindowFocus)
    );

    this.chatService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mapMsgs) => {
        const chatId = this.selectedChat()?.chatId;
        if (!chatId) return;

        const serviceMessages = mapMsgs[chatId];
        if (!serviceMessages?.length) return;

        // Fusionar (como Inbox): no reemplazar el historial HTTP con solo lo del WS
        const current = this.messages();
        const incoming = serviceMessages.filter(
          (sm) =>
            !!sm.messageId &&
            !current.some((cm) => cm.messageId === sm.messageId)
        );
        if (incoming.length === 0) return;

        this.ngZone.run(() => {
          this.messages.set([...current, ...incoming]);
          const last = incoming[incoming.length - 1];
          if (last) {
            const preview = this.previewFromMessage(last, 'Sin mensajes');
            this.mineItems.update((list) =>
              list.map((item) =>
                item.chatId === chatId
                  ? {
                      ...item,
                      preview,
                      subtitle: preview,
                      updatedAtMs: Date.now(),
                    }
                  : item
              )
            );
          }
        });
      });

    this.setupLiveSync();
    this.setupCompactLayoutWatcher();
    this.setupMentionCandidatesPolling();
    this.refreshAll();

    interval(POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshAll(true));
  }

  ngOnDestroy(): void {
    this.compactMql?.removeEventListener('change', this.onCompactLayoutChange);
    this.compactMql = null;
    this.chatService.webSocketService.off('chat:created', this.onChatCreated);
    this.chatService.webSocketService.off(
      'chat:commercial-assigned',
      this.onCommercialAssigned,
    );
    this.unreadMessagesService.setActiveChat(null);
    this.chatService.selectChat(null);
  }

  selectCola(cola: AtencionCola): void {
    this.activeCola.set(cola);
    this.clearSelectedChat();
  }

  refreshDesktopPermission(): void {
    this.desktopPermission.set(this.unreadMessagesService.desktopPermission());
  }

  enableDesktopNotifications(): void {
    void this.unreadMessagesService.requestDesktopPermission().then((permission) => {
      this.desktopPermission.set(permission);
      if (permission === 'granted') {
        this.toastService.success('Avisos de escritorio activados');
        this.unreadMessagesService.testNotification();
      }
    });
  }

  testDesktopNotification(): void {
    this.unreadMessagesService.testNotification();
  }

  onCloseChat(): void {
    this.clearSelectedChat();
  }

  toggleVisitorPanel(): void {
    const next = !this.showVisitorPanel();
    this.showVisitorPanel.set(next);
    if (next) {
      const visitorId = this.selectedChat()?.visitorId;
      if (visitorId) this.loadVisitorContactData(visitorId);
    }
  }

  onCloseVisitorPanel(): void {
    this.showVisitorPanel.set(false);
  }

  private setupCompactLayoutWatcher(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    this.compactMql = window.matchMedia('(max-width: 1280px)');
    this.applyCompactLayout(this.compactMql.matches);
    this.compactMql.addEventListener('change', this.onCompactLayoutChange);
  }

  private applyCompactLayout(compact: boolean): void {
    this.ngZone.run(() => {
      this.isCompactLayout.set(compact);
      if (compact) {
        this.showVisitorPanel.set(false);
      }
    });
  }

  onConfirmContactData(event: ContactRequestCardConfirm): void {
    this.saveVisitorContact(
      {
        ...event.data,
        ...this.consentFromMessages(event.requestId),
        extractedFromChatId: this.selectedChat()?.chatId,
      },
      event.requestId,
    );
  }

  /**
   * El visitante acepta las políticas en el formulario, así que los flags se
   * leen del mensaje de envío para guardarlos junto a los datos del lead.
   */
  private consentFromMessages(
    requestId: string,
  ): Pick<
    SaveContactDataRequest,
    'acceptedPrivacyPolicy' | 'acceptedMarketing'
  > {
    for (const message of this.messages()) {
      const systemData = message.systemData;
      if (
        systemData?.action !== 'contact_submission' ||
        systemData.requestId !== requestId
      ) {
        continue;
      }
      return {
        acceptedPrivacyPolicy: systemData.acceptedPrivacyPolicy,
        acceptedMarketing: systemData.acceptedMarketing,
      };
    }
    return {};
  }

  onSaveContactData(request: SaveContactDataRequest): void {
    this.saveVisitorContact(request);
  }

  private saveVisitorContact(
    request: SaveContactDataRequest,
    requestId?: string,
  ): void {
    const visitorId =
      this.selectedVisitor()?.id || this.selectedChat()?.visitorId;
    if (!visitorId || visitorId === 'unknown') {
      this.toastService.error('No se pudo identificar al visitante');
      return;
    }

    this.savingContactData.set(true);
    this.leadContactService
      .saveContactData(visitorId, request)
      .pipe(
        finalize(() => this.savingContactData.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (saved) => {
          const now = new Date().toISOString();
          const updated: LeadContactData = {
            id: saved?.id || this.visitorContactData()?.id || `temp-${Date.now()}`,
            visitorId,
            companyId:
              saved?.companyId ||
              this.visitorContactData()?.companyId ||
              this.companyId() ||
              'unknown',
            alias: saved?.alias ?? request.alias,
            nombre: saved?.nombre ?? request.nombre,
            apellidos: saved?.apellidos ?? request.apellidos,
            email: saved?.email ?? request.email,
            telefono: saved?.telefono ?? request.telefono,
            poblacion: saved?.poblacion ?? request.poblacion,
            acceptedPrivacyPolicy:
              saved?.acceptedPrivacyPolicy ?? request.acceptedPrivacyPolicy,
            acceptedMarketing:
              saved?.acceptedMarketing ?? request.acceptedMarketing,
            consentAcceptedAt:
              saved?.consentAcceptedAt ??
              this.visitorContactData()?.consentAcceptedAt,
            extractedFromChatId:
              saved?.extractedFromChatId ?? request.extractedFromChatId,
            additionalData: saved?.additionalData ?? request.additionalData,
            extractedAt:
              saved?.extractedAt ||
              this.visitorContactData()?.extractedAt ||
              now,
            updatedAt: saved?.updatedAt || now,
          };
          this.visitorContactData.set(updated);
          this.leadContactService.putCache(updated);
          this.applyContactDisplayName(visitorId, updated);
          if (requestId) {
            this.optimisticConfirmedRequestIds.update((ids) =>
              ids.includes(requestId) ? ids : [...ids, requestId]
            );
            this.persistContactConfirmation(requestId);
          }
          this.toastService.success('Datos de contacto guardados');
          this.showVisitorPanel.set(true);
        },
        error: () => {
          this.toastService.error('No se pudieron guardar los datos de contacto');
        },
      });
  }

  /**
   * Marca la solicitud como confirmada en el hilo. Los datos del lead ya están
   * guardados, así que un fallo aquí solo afecta al estado de la tarjeta.
   */
  private persistContactConfirmation(requestId: string): void {
    const chatId = this.selectedChat()?.chatId;
    if (!chatId) return;

    this.chatService
      .confirmContactData(chatId, requestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error) => {
          console.warn(
            '[Atencion] No se pudo registrar la confirmación en el hilo',
            error
          );
        },
      });
  }

  /** Actualiza título del chat abierto y de las listas (alias / nombre del contacto). */
  private applyContactDisplayName(
    visitorId: string,
    contact: LeadContactData | null
  ): void {
    if (!contact) return;

    const displayName = getContactDisplayName(contact);
    if (!displayName) return;

    const chat = this.selectedChat();
    if (chat?.visitorId === visitorId) {
      this.selectedChat.set({
        ...chat,
        name: displayName,
        participants: (chat.participants ?? []).map((p) =>
          p.role === 'visitor' || p.id === visitorId
            ? {
                ...p,
                name: displayName,
                email: contact.email || p.email,
              }
            : p
        ),
      });
    }

    const isLead = this.contactMeetsLeadCriteria(contact);
    const rename = (items: AtencionListItem[]): AtencionListItem[] =>
      items.map((item) =>
        item.visitorId === visitorId
          ? {
              ...item,
              title: displayName,
              isLead: item.isLead || isLead,
            }
          : item
      );

    this.pendingItems.update(rename);
    this.mineItems.update(rename);
    this.webItems.update(rename);
  }

  private clearSelectedChat(): void {
    this.selectedItemId.set(null);
    this.selectedChat.set(null);
    this.messages.set([]);
    this.visitorProfile.set(null);
    this.visitorActivity.set(null);
    this.visitorContactData.set(null);
    this.pageHistory.set([]);
    this.pageHistoryTotal.set(0);
    this.showVisitorPanel.set(false);
    this.unreadMessagesService.setActiveChat(null);
    this.chatService.selectChat(null);
  }

  toggleInactiveMios(): void {
    this.showInactiveMios.update((v) => !v);
  }

  refreshAll(silent = false): void {
    const userId = this.currentUserId();
    const companyId = this.companyId();
    if (!userId || !companyId) {
      this.error.set('Sesión sin usuario o empresa');
      return;
    }

    if (!silent) {
      this.isLoading.set(true);
    }
    this.error.set(null);

    forkJoin({
      pending: this.visitorsService.getPendingChats(undefined, 50).pipe(
        map((res) => this.splitPendingQueue(res.queue)),
        catchError((err) => {
          console.error('[Atencion] pending queue error', err);
          return of({
            withMessage: [] as AtencionListItem[],
            silentWeb: [] as AtencionListItem[],
          });
        })
      ),
      mine: this.chatService
        .getCommercialChats(userId, {
          limit: 50,
          filters: { status: ['ASSIGNED', 'ACTIVE', 'PENDING'] },
        })
        .pipe(
          map((chats) => {
            const mapped = chats
              .filter((c) => c.status !== 'CLOSED')
              .filter((c) => !this.chatService.isSelfChatId(c.chatId))
              // Evitar chats basura donde visitorId = comercial (auto-chat)
              .filter((c) => c.visitorId && c.visitorId !== userId)
              .map((c) => this.mapMineChat(c));
            // Un visitante = una fila (mismo Edge con 2 chats ASSIGNED
            // hacía parecer que había 2 pestañas online).
            return this.dedupeMineByVisitor(mapped);
          }),
          catchError((err) => {
            console.error('[Atencion] mine chats error', err);
            return of([] as AtencionListItem[]);
          })
        ),
      web: this.visitorsService
        .searchVisitors(companyId, {
          filters: {
            // 'away' incluido a propósito: el backend marca AWAY tras 2 min sin
            // clic (PRESENCE_USER_INACTIVITY_MINUTES) aunque la pestaña siga
            // abierta. Sin 'away' el visitante que solo lee desaparecía de
            // Atención y solo se veía en Visitantes.
            connectionStatus: ['online', 'chatting', 'away'],
          },
          limit: 50,
        })
        .pipe(
          map((res) => res.visitors ?? []),
          catchError((err) => {
            console.error('[Atencion] web visitors error', err);
            return of([] as VisitorSearchResult[]);
          })
        ),
    })
      .pipe(
        finalize(() => {
          if (!silent) this.isLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ pending, mine, web }) => {
          const pendingItems = pending.withMessage;
          this.notifyPendingDeltas(pendingItems);

          this.pendingItems.set(pendingItems);
          this.mineItems.set(mine);
          const mineVisitorIds = new Set(mine.map((m) => m.visitorId));
          const pendingVisitorIds = new Set(
            pendingItems.map((p) => p.visitorId)
          );
          const webFromSearch = web
            .filter((v) =>
              this.isEligibleForWebQueue(v, mineVisitorIds, pendingVisitorIds)
            )
            .map((v) => this.mapWebVisitor(v));
          const webItems = this.mergeWebItems(
            pending.silentWeb.filter(
              (item) =>
                !mineVisitorIds.has(item.visitorId) &&
                !pendingVisitorIds.has(item.visitorId) &&
                !this.offlineWebVisitorIds.has(item.visitorId)
            ),
            webFromSearch
          );
          this.webItems.set(webItems);

          this.wireMineRealtime(mine);
          this.preserveSelection(pendingItems, mine);
          this.enrichRowsWithContacts(
            [...pendingItems, ...mine, ...webItems].map((i) => i.visitorId)
          );

          const visitorId = this.selectedChat()?.visitorId;
          const contact = this.visitorContactData();
          if (contact && visitorId) {
            this.applyContactDisplayName(visitorId, contact);
          } else if (
            visitorId &&
            [...pendingItems, ...mine].some(
              (item) =>
                item.visitorId === visitorId &&
                item.isLead &&
                !this.visitorContactData()
            )
          ) {
            this.loadVisitorContactData(visitorId);
          }

          // Deep-link ?chat=… (notificación, o un lead captado desde /captacion).
          // También busca en Pendientes: el chat de una captación sin agente no
          // está asignado a nadie, así que abrirlo implica reclamarlo.
          const chatParam = this.route.snapshot.queryParamMap.get('chat');
          if (chatParam && !this.selectedChat()) {
            const mineItem = mine.find((i) => i.chatId === chatParam);
            const item =
              mineItem ?? pendingItems.find((i) => i.chatId === chatParam);
            if (item) {
              this.activeCola.set(mineItem ? 'mios' : 'pendientes');
              this.openChat(item, item.rawChat ?? null);
            }
          }
        },
        error: () => {
          if (!silent) this.error.set('No se pudieron cargar las colas');
        },
      });
  }

  /**
   * Visitante válido para "En la web":
   * - no interno (empleado)
   * - no está ya en Míos
   * - no está en Pendientes con mensaje (evitar duplicado)
   * - sigue en el sitio: online / chatting / away (offline = sesión cerrada)
   *
   * No filtramos isMe: en local el demo y Console comparten IP/navegador
   * y el visitante real desaparecía del panel.
   */
  private isEligibleForWebQueue(
    v: VisitorSearchResult,
    mineVisitorIds: Set<string>,
    pendingVisitorIds: Set<string>
  ): boolean {
    if (v.isInternal) return false;
    if (mineVisitorIds.has(v.id) || pendingVisitorIds.has(v.id)) return false;
    if (String(v.connectionStatus ?? '').toLowerCase() === 'offline') {
      return false;
    }
    return true;
  }

  /** AWAY = pestaña abierta pero sin clic reciente; sigue siendo abordable. */
  private isIdleOnSite(v: VisitorSearchResult): boolean {
    return String(v.connectionStatus ?? '').toLowerCase() === 'away';
  }

  /**
   * Desconectado no puede atender: reclamar o iniciar chat dejaría al visitante
   * esperando a alguien que no está. Solo se permite mirar los chats propios.
   */
  private requireConnected(action: string): boolean {
    if (this.isPresenceConnected()) return true;
    this.toastService.info(`Conéctate para ${action}`);
    return false;
  }

  onSelectItem(item: AtencionListItem): void {
    if (this.isClaiming()) return;

    if (item.kind === 'mine' && item.chatId) {
      this.openChat(item, item.rawChat ?? null);
      return;
    }

    if (item.kind === 'pending' && item.chatId) {
      if (!this.requireConnected('atender conversaciones')) return;
      this.claimAndOpen(item);
      return;
    }

    if (item.kind === 'web') {
      if (!this.requireConnected('iniciar una conversación')) return;
      if (item.chatId) {
        this.claimAndOpen(item);
        return;
      }
      this.startChatWithVisitor(item);
    }
  }

  /** Texto que se envía al pulsar Saludar. */
  private greetingText(): string {
    const custom = this.greetingMessage()?.trim();
    return custom || DEFAULT_GREETING;
  }

  /** CTA En la web: inicia chat con mensaje de saludo → Míos. */
  onSaludar(event: Event, item: AtencionListItem): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.isClaiming() || item.kind !== 'web') return;
    if (!this.requireConnected('saludar a un visitante')) return;
    if (item.chatId) {
      this.claimAndOpen(item, { withGreeting: true });
      return;
    }
    this.startChatWithVisitor(item, { withGreeting: true });
  }

  onSendMessage(payload: MessageSendPayload | string): void {
    const content =
      typeof payload === 'string' ? payload : payload.content;
    const transferToCommercialId =
      typeof payload === 'string' ? undefined : payload.transferToCommercialId;
    const transferToDisplayName =
      typeof payload === 'string' ? undefined : payload.transferToDisplayName;

    const chat = this.selectedChat();
    const userId = this.currentUserId();
    if (!chat || !userId || !content.trim()) return;

    if (!this.requireConnected('poder enviar mensajes')) return;

    const chatId = chat.chatId;

    this.chatService
      .sendMessage({
        chatId,
        content: content.trim(),
        type: 'text',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (!transferToCommercialId) return;
          this.transferChatAfterMessage(
            chatId,
            transferToCommercialId,
            transferToDisplayName,
          );
        },
        error: () => this.toastService.error('Error al enviar el mensaje'),
      });
  }

  onSlashCommand(command: SlashCommand): void {
    if (command.id !== 'request-contact') return;

    const chat = this.selectedChat();
    if (!chat) return;

    if (!this.requireConnected('solicitar datos')) return;
    if (this.isCurrentVisitorLead()) {
      this.toastService.info(
        'Este visitante ya es lead. No hace falta volver a pedir los datos.',
      );
      return;
    }
    if (this.contactRequestInFlight) {
      this.toastService.info('Ya se está enviando la solicitud de datos');
      return;
    }

    this.contactRequestInFlight = true;
    this.chatService
      .requestContactData(chat.chatId, { preface: command.preface })
      .pipe(
        finalize(() => {
          this.contactRequestInFlight = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toastService.info('Solicitud de datos enviada al visitante');
        },
        error: (error: { status?: number; error?: { message?: string } }) => {
          const reason = error?.error?.message;
          // 400/409: regla de negocio (p. ej. ya hay una solicitud pendiente).
          // No es un fallo técnico, así que se informa sin alarmar.
          if (error?.status === 400 || error?.status === 409) {
            this.toastService.info(
              reason || 'Ya hay una solicitud de datos pendiente en este chat',
            );
            return;
          }
          this.toastService.error(
            reason
              ? `No se pudo enviar la solicitud de datos: ${reason}`
              : 'No se pudo enviar la solicitud de datos',
          );
        },
      });
  }

  private transferChatAfterMessage(
    chatId: string,
    commercialId: string,
    displayName?: string,
  ): void {
    this.visitorsService
      .transferChat(chatId, commercialId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // Salir de la sala YA: si no, seguimos recibiendo message:new del visitante
          this.releaseChatRealtime(chatId);
          this.mineItems.update((list) =>
            list.filter((item) => item.chatId !== chatId),
          );
          this.clearSelectedChat();
          this.toastService.success(
            displayName
              ? `Transferido a ${displayName}`
              : 'Chat transferido',
          );
          this.refreshAll(true);
        },
        error: (err: unknown) => {
          const message =
            (err as { error?: { message?: string } })?.error?.message ||
            'No se pudo transferir el chat. El mensaje sí se envió.';
          this.toastService.error(message);
        },
      });
  }

  /** Sale de la sala WS y deja de notificar unread para este chat. */
  private releaseChatRealtime(chatId: string): void {
    this.chatService.webSocketService.leaveRoom(chatId);
    this.unreadMessagesService.unregisterChat(chatId);
    this.wiredQueueChatIds.delete(chatId);
    this.presenceByChat.update((map) => {
      if (!(chatId in map)) return map;
      const next = { ...map };
      delete next[chatId];
      return next;
    });
  }

  private setupMentionCandidatesPolling(): void {
    interval(POLL_MS)
      .pipe(
        startWith(0),
        switchMap(() =>
          forkJoin({
            online: this.commercialPresence.getOnlineCommercials().pipe(
              catchError(() => of([])),
            ),
            users: this.companyUsersService.listCompanyUsers().pipe(
              catchError(() => of({ users: [] })),
            ),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ online, users }) => {
        const selfId = this.currentUserId();
        const onlineIds = new Set(online.map((c) => c.id));
        const profileByKeycloak = new Map(
          users.users
            .filter((u) => !!u.keycloakId)
            .map((u) => {
              const fromEmail = u.email?.split('@')[0]?.trim();
              const label = u.name?.trim() || fromEmail || u.email || u.id;
              return [
                u.keycloakId as string,
                {
                  name: label,
                  avatarUrl: u.avatarUrl ?? null,
                },
              ] as const;
            }),
        );

        const candidates = online
          .filter((c) => c.id && c.id !== selfId)
          .map((c) => {
            const profile = profileByKeycloak.get(c.id);
            const resolvedName =
              profile?.name ||
              (c.name && c.name !== c.id ? c.name.trim() : '') ||
              c.id.slice(0, 8);
            return {
              id: c.id,
              name: resolvedName,
              avatarUrl: c.avatarUrl || profile?.avatarUrl || null,
            };
          });

        this.mentionCandidates.set(candidates);
      });
  }

  onLoadMoreMessages(): void {
    // MVP: sin paginación hacia atrás
  }

  private setupLiveSync(): void {
    // Badges de no leídos en vivo (visitante escribe en otro chat)
    this.unreadMessagesService.unreadCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((unreadMap) => {
        this.mineItems.update((list) =>
          list.map((item) =>
            item.chatId
              ? { ...item, unreadCount: unreadMap[item.chatId] ?? 0 }
              : item
          )
        );
        this.pendingItems.update((list) =>
          list.map((item) =>
            item.chatId
              ? { ...item, unreadCount: unreadMap[item.chatId] ?? 0 }
              : item
          )
        );
      });

    // Presencia: visitante conecta / cierra navegador
    this.presenceService.presenceChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.userType !== 'visitor') return;
        this.mineItems().forEach((item) => {
          if (item.visitorId === event.userId && item.chatId) {
            this.presenceByChat.update((map) => ({
              ...map,
              [item.chatId!]: event.status,
            }));
          }
        });
        // En la web = está en el sitio. Al cerrar el navegador sale ya.
        if (event.status === 'offline') {
          this.offlineWebVisitorIds.add(event.userId);
          this.webItems.update((list) =>
            list.filter((item) => item.visitorId !== event.userId)
          );
        } else if (
          event.status === 'online' ||
          event.status === 'away' ||
          event.status === 'chatting'
        ) {
          this.offlineWebVisitorIds.delete(event.userId);
          this.refreshAll(true);
        }
      });

    // Tras reconectar WS: re-join + refresh
    this.chatService.webSocketService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state === 'connected') {
          this.wireQueueRealtime(this.pendingItems(), this.mineItems());
        }
      });

    this.chatService.webSocketService.messageReceived$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((message): message is Message => !!message),
      )
      .subscribe((message) => {
        if (
          message.queue === 'pendientes' ||
          this.pendingItems().some((item) => item.chatId === message.chatId)
        ) {
          this.notifiedPendingChatIds.add(message.chatId);
        }

        const chatId = this.selectedChat()?.chatId;
        if (!chatId || message.chatId !== chatId) {
          return;
        }
        const action = message.systemData?.action;
        const type = String(message.type || '').toUpperCase();
        if (action === 'lead_capture_submission') {
          const visitorId = this.selectedChat()?.visitorId;
          if (visitorId) {
            this.leadContactService.invalidate(visitorId);
            this.loadVisitorContactData(visitorId);
          }
          this.loadMessages(chatId, { silent: true });
          return;
        }
        if (
          action === 'contact_submission' ||
          action === 'contact_cancellation' ||
          action === 'contact_request' ||
          type === 'INTERACTIVE'
        ) {
          this.loadMessages(chatId, { silent: true });
        }
      });

    // Nuevo chat PENDING en el tenant → toast + refresh Pendientes
    this.chatService.webSocketService.on('chat:created', this.onChatCreated);

    // Transferencia recibida (también llega a sala commercial:{id})
    this.chatService.webSocketService.on(
      'chat:commercial-assigned',
      this.onCommercialAssigned,
    );
  }

  private wireMineRealtime(_mine?: AtencionListItem[]): void {
    this.wireQueueRealtime(this.pendingItems(), this.mineItems());
  }

  /**
   * Une salas de Pendientes y Míos para message:new + notificación de escritorio.
   */
  private wireQueueRealtime(
    pending: AtencionListItem[],
    mine: AtencionListItem[]
  ): void {
    const queueItems = [...pending, ...mine];
    const chatIds = queueItems
      .map((item) => item.chatId)
      .filter((id): id is string => !!id);
    const nextIds = new Set(chatIds);

    for (const prevId of this.wiredQueueChatIds) {
      if (!nextIds.has(prevId)) {
        this.releaseChatRealtime(prevId);
      }
    }

    this.wiredQueueChatIds = nextIds;
    this.unreadMessagesService.syncNotifyChats(chatIds);

    if (chatIds.length === 0) return;

    this.unreadMessagesService.registerChatsVisitors(
      queueItems
        .filter((item) => item.chatId)
        .map((item) => ({ chatId: item.chatId!, visitorId: item.visitorId }))
    );
    this.chatService.webSocketService.joinMultipleRooms(chatIds);
    this.unreadMessagesService.refreshUnreadCounts(
      mine.map((item) => item.chatId).filter((id): id is string => !!id)
    );
    chatIds.forEach((id) => this.loadChatPresence(id));
  }

  private loadChatPresence(chatId: string): void {
    if (this.chatService.isSelfChatId(chatId)) return;

    this.presenceService
      .getChatPresence(chatId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (presence) => {
          const userId = this.currentUserId();
          const visitor = presence.participants.find(
            (p) => p.userType === 'visitor' || p.userId !== userId
          );
          this.presenceByChat.update((map) => ({
            ...map,
            [chatId]: visitor?.connectionStatus,
          }));
        },
        error: (err) => {
          console.warn('[Atencion] presencia no disponible', chatId, err);
        },
      });
  }

  private claimAndOpen(
    item: AtencionListItem,
    options?: { withGreeting?: boolean }
  ): void {
    const userId = this.currentUserId();
    const chatId = item.chatId;
    if (!userId || !chatId) return;
    if (!this.requireConnected('atender conversaciones')) return;

    this.isClaiming.set(true);
    this.visitorsService
      .assignChatToCommercial(chatId, userId)
      .pipe(
        // Si ya está asignado (a mí o a otro) el backend devuelve 400: lo
        // resolvemos con el chat real en lugar de abortar la apertura.
        catchError(() => of(null)),
        switchMap(() => this.chatService.getChat(chatId)),
        finalize(() => this.isClaiming.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (chat) => {
          if (chat?.commercialId && chat.commercialId !== userId) {
            this.toastService.info(
              'Otro comercial acaba de tomar esta conversación'
            );
            this.refreshAll(true);
            return;
          }
          this.pendingItems.update((list) =>
            list.filter((i) => i.chatId !== chatId)
          );
          this.webItems.update((list) =>
            list.filter((i) => i.visitorId !== item.visitorId)
          );
          const mineItem: AtencionListItem = {
            ...item,
            id: `mine-${chatId}`,
            kind: 'mine',
            statusLabel: 'Mío',
            rawChat: chat ?? item.rawChat,
            updatedAtMs: Date.now(),
            preview: options?.withGreeting
              ? this.truncatePreview(this.greetingText())
              : item.preview,
            subtitle: options?.withGreeting
              ? this.truncatePreview(this.greetingText())
              : item.subtitle,
          };
          this.mineItems.update((list) => {
            if (list.some((i) => i.chatId === chatId)) return list;
            return [mineItem, ...list];
          });
          this.activeCola.set('mios');
          this.openChat(mineItem, chat);
          this.wireMineRealtime([mineItem]);
          if (options?.withGreeting) {
            this.onSendMessage(this.greetingText());
          }
          this.refreshAll(true);
        },
        error: () => {
          this.toastService.error('No se pudo reclamar el chat');
        },
      });
  }

  private startChatWithVisitor(
    item: AtencionListItem,
    options?: { withGreeting?: boolean }
  ): void {
    const userId = this.currentUserId();
    if (!userId) return;
    if (!this.requireConnected('iniciar una conversación')) return;

    // El visitante suele tener ya un chat de entrada creado por el SDK. Crear
    // otro dejaba al visitante escribiendo en un chat y al comercial en otro,
    // así que se reclama el abierto si existe.
    this.isClaiming.set(true);
    this.visitorsService
      .getVisitorChats(item.visitorId)
      .pipe(
        map((res) => this.findOpenChatId(res)),
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((openChatId) => {
        this.isClaiming.set(false);
        if (openChatId) {
          this.claimAndOpen({ ...item, chatId: openChatId }, options);
          return;
        }
        this.createChatWithVisitor(item, options);
      });
  }

  /** chatId abierto (PENDING/ASSIGNED/ACTIVE) del visitante, si existe. */
  private findOpenChatId(res: { chats?: unknown[] } | null): string | null {
    const openStatuses = new Set(['PENDING', 'ASSIGNED', 'ACTIVE']);
    const chats = (res?.chats ?? []) as Array<{
      chatId?: string;
      id?: string;
      status?: string;
    }>;
    const match = chats.find((chat) =>
      openStatuses.has(String(chat?.status ?? '').toUpperCase())
    );
    return match?.chatId ?? match?.id ?? null;
  }

  private createChatWithVisitor(
    item: AtencionListItem,
    options?: { withGreeting?: boolean }
  ): void {
    const userId = this.currentUserId();
    if (!userId) return;

    this.isClaiming.set(true);
    this.visitorsService
      .createChatWithVisitor({
        visitorId: item.visitorId,
        visitorInfo: {
          visitorId: item.visitorId,
          name: item.rawVisitor?.name,
          email: item.rawVisitor?.email,
        } as {
          name?: string;
          email?: string;
          phone?: string;
          visitorId?: string;
        },
        metadata: {
          source: options?.withGreeting
            ? 'atencion-saludar'
            : 'atencion-en-web',
          department: 'general',
        },
        ...(options?.withGreeting
          ? {
              firstMessage: {
                content: this.greetingText(),
                type: 'TEXT' as const,
              },
            }
          : {}),
      })
      .pipe(
        switchMap((res) =>
          // Crear el chat como comercial ya lo asigna; reasignar devuelve 400
          // ("no puede ser asignado en estado ASSIGNED") y abortaba la apertura.
          this.visitorsService.assignChatToCommercial(res.chatId, userId).pipe(
            catchError(() => of(null)),
            switchMap(() => this.chatService.getChat(res.chatId)),
            map((chat) => ({ chatId: res.chatId, chat }))
          )
        ),
        finalize(() => this.isClaiming.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ chatId, chat }) => {
          if (chat?.commercialId && chat.commercialId !== userId) {
            this.toastService.info(
              'Otro comercial acaba de tomar esta conversación'
            );
            this.refreshAll(true);
            return;
          }
          this.webItems.update((list) =>
            list.filter((i) => i.visitorId !== item.visitorId)
          );
          const mineItem: AtencionListItem = {
            id: `mine-${chatId}`,
            kind: 'mine',
            title: item.title,
            subtitle: options?.withGreeting
              ? this.truncatePreview(this.greetingText())
              : 'Conversación iniciada',
            preview: options?.withGreeting
              ? this.truncatePreview(this.greetingText())
              : undefined,
            pageLabel: item.pageLabel,
            isLead: item.isLead,
            chatId,
            visitorId: item.visitorId,
            unreadCount: 0,
            statusLabel: 'Mío',
            updatedAtMs: Date.now(),
            rawChat: chat ?? undefined,
          };
          this.mineItems.update((list) => [mineItem, ...list]);
          this.activeCola.set('mios');
          this.openChat(mineItem, chat);
          this.wireMineRealtime([mineItem]);
          this.refreshAll(true);
        },
        error: () => this.toastService.error('No se pudo iniciar el chat'),
      });
  }

  private openChat(item: AtencionListItem, chat: Chat | null): void {
    this.selectedItemId.set(item.id);
    const resolved =
      chat ??
      item.rawChat ??
      (item.chatId
        ? ({
            chatId: item.chatId,
            status: 'ASSIGNED',
            priority: 'MEDIUM',
            visitorId: item.visitorId,
            unreadCount: item.unreadCount,
            isTyping: false,
            typingUsers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [
              {
                id: item.visitorId,
                name: item.title,
                role: 'visitor',
                status: 'online',
              },
            ],
            name: item.title,
            archived: false,
            muted: false,
            pinned: false,
          } satisfies Chat)
        : null);

    this.selectedChat.set(resolved);
    if (!resolved) return;

    this.messages.set([]);
    this.chatService.selectChat(resolved.chatId);
    this.unreadMessagesService.setActiveChat(resolved.chatId);
    // Asegurar sala WS del chat abierto (message:new)
    this.chatService.webSocketService.joinMultipleRooms([resolved.chatId]);
    this.loadMessages(resolved.chatId);
    this.loadChatPresence(resolved.chatId);
    this.loadVisitorProfile(item.visitorId, item.rawVisitor);

    // En compact los detalles van en overlay: no abrir por defecto (deja sitio al chat)
    this.showVisitorPanel.set(!this.isCompactLayout());
  }

  private loadVisitorProfile(
    visitorId: string,
    rawVisitor?: VisitorSearchResult
  ): void {
    if (!visitorId || visitorId === 'unknown') {
      this.visitorProfile.set(null);
      this.visitorActivity.set(null);
      return;
    }

    // Preview inmediato desde listado (En la web) mientras llega /activity
    if (rawVisitor) {
      this.visitorProfile.set({
        currentUrl: rawVisitor.currentUrl,
        browser: this.guessBrowser(rawVisitor.lastUserAgent),
        totalSessions: rawVisitor.totalSessionsCount,
        lifecycle: rawVisitor.lifecycle,
      });
    } else {
      this.visitorProfile.set(null);
    }

    this.visitorsService
      .getVisitorActivity(visitorId)
      .pipe(
        catchError((err) => {
          console.warn('[Atencion] activity no disponible', visitorId, err);
          return of(null as VisitorActivity | null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((activity) => {
        if (!activity) return;
        // Solo aplicar si seguimos en el mismo visitante
        if (this.selectedChat()?.visitorId !== visitorId) return;
        this.visitorActivity.set(activity);
        this.visitorProfile.set(this.mapActivityToProfile(activity, rawVisitor));
      });

    this.loadVisitorContactData(visitorId);
    this.loadPageHistory(visitorId);
  }

  private loadPageHistory(visitorId: string): void {
    if (!visitorId || visitorId === 'unknown') {
      this.pageHistory.set([]);
      this.pageHistoryTotal.set(0);
      return;
    }

    this.pageHistoryLoading.set(true);
    this.visitorsService
      .getVisitorPageHistory(visitorId, 50)
      .pipe(
        catchError((err) => {
          console.warn('[Atencion] page-history no disponible', visitorId, err);
          return of({ visitorId, total: 0, pages: [] });
        }),
        finalize(() => this.pageHistoryLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((history) => {
        if (this.selectedChat()?.visitorId !== visitorId) return;
        this.pageHistory.set(history.pages);
        this.pageHistoryTotal.set(history.total);
      });
  }

  private loadVisitorContactData(visitorId: string): void {
    this.leadContactService
      .getContactData(visitorId, { force: true })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((contactData) => {
        if (this.selectedChat()?.visitorId !== visitorId) return;
        this.visitorContactData.set(contactData);
        this.leadContactService.putCache(contactData);
        this.applyContactDisplayName(visitorId, contactData);
      });
  }

  private mapActivityToProfile(
    activity: VisitorActivity,
    rawVisitor?: VisitorSearchResult
  ): VisitorChatProfile {
    return {
      currentUrl: activity.currentUrl || rawVisitor?.currentUrl,
      totalSessions: activity.totalSessions,
      totalPagesVisited: activity.totalPagesVisited,
      totalTimeConnectedMs: activity.totalTimeConnectedMs,
      totalChats: activity.totalChats,
      lifecycle: activity.lifecycle,
      browser: this.guessBrowser(rawVisitor?.lastUserAgent),
      lastActivityAt: activity.lastActivityAt,
    };
  }

  private loadMessages(chatId: string, options?: { silent?: boolean }): void {
    if (options?.silent) {
      this.refreshActiveChatMessages(chatId);
      return;
    }

    const visitorId = this.selectedChat()?.visitorId;
    if (visitorId && visitorId !== 'unknown') {
      this.loadVisitorThread(visitorId, chatId);
      return;
    }

    this.loadSingleChatMessages(chatId, false);
  }

  /** Recarga solo el chat abierto y conserva el historial de otros chats. */
  private refreshActiveChatMessages(chatId: string): void {
    this.chatService
      .getMessages(chatId, { limit: VISITOR_HISTORY_MSG_LIMIT })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          const historical = this.messages().filter((m) => m.chatId !== chatId);
          this.messages.set(this.mergeVisitorMessages([historical, fresh]));
        },
      });
  }

  /**
   * Hilo único: mensajes de los últimos chats del visitante, más antiguos primero.
   * Enviar / WS siguen solo en currentChatId.
   */
  private loadVisitorThread(visitorId: string, currentChatId: string): void {
    this.messagesLoading.set(true);
    this.visitorsService
      .getVisitorChats(visitorId, undefined, VISITOR_HISTORY_CHAT_LIMIT)
      .pipe(
        map((res) => this.collectVisitorChatIds(res, currentChatId)),
        catchError(() => of([currentChatId])),
        switchMap((chatIds) => {
          if (chatIds.length === 0) return of([] as Message[]);
          return forkJoin(
            chatIds.map((id) =>
              this.chatService
                .getMessages(id, { limit: VISITOR_HISTORY_MSG_LIMIT })
                .pipe(catchError(() => of([] as Message[])))
            )
          ).pipe(map((groups) => this.mergeVisitorMessages(groups)));
        }),
        finalize(() => this.messagesLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (messages) => this.messages.set(messages),
        error: () => this.toastService.error('Error al cargar mensajes'),
      });
  }

  private collectVisitorChatIds(
    res: { chats?: Array<Chat & { id?: string; lastMessageDate?: Date | string }> } | null,
    currentChatId: string
  ): string[] {
    const chats = [...(res?.chats ?? [])];
    chats.sort((a, b) => {
      const aMs = new Date(
        a.lastMessageDate ?? a.updatedAt ?? a.createdAt ?? 0
      ).getTime();
      const bMs = new Date(
        b.lastMessageDate ?? b.updatedAt ?? b.createdAt ?? 0
      ).getTime();
      return bMs - aMs;
    });
    const ids = chats
      .map((chat) => chat.chatId || chat.id)
      .filter((id): id is string => !!id);
    if (!ids.includes(currentChatId)) {
      ids.unshift(currentChatId);
    }
    return [...new Set(ids)].slice(0, VISITOR_HISTORY_CHAT_LIMIT);
  }

  private mergeVisitorMessages(groups: Message[][]): Message[] {
    const byId = new Map<string, Message>();
    for (const group of groups) {
      for (const message of group) {
        const id = message.messageId;
        if (!id || byId.has(id)) continue;
        byId.set(id, message);
      }
    }
    return [...byId.values()].sort((a, b) => {
      const aMs = new Date(a.sentAt).getTime();
      const bMs = new Date(b.sentAt).getTime();
      return aMs - bMs;
    });
  }

  private loadSingleChatMessages(chatId: string, silent: boolean): void {
    if (!silent) {
      this.messagesLoading.set(true);
    }
    this.chatService
      .getMessages(chatId, { limit: VISITOR_HISTORY_MSG_LIMIT })
      .pipe(
        finalize(() => {
          if (!silent) this.messagesLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (messages) => this.messages.set(messages),
        error: () => this.toastService.error('Error al cargar mensajes'),
      });
  }

  private preserveSelection(
    pending: AtencionListItem[],
    mine: AtencionListItem[]
  ): void {
    const selectedId = this.selectedItemId();
    if (!selectedId) return;

    const stillThere =
      pending.some((i) => i.id === selectedId) ||
      mine.some((i) => i.id === selectedId) ||
      this.webItems().some((i) => i.id === selectedId);

    if (!stillThere && !this.isClaiming()) {
      const openChatId = this.selectedChat()?.chatId;
      const byChat =
        openChatId &&
        (mine.find((i) => i.chatId === openChatId) ||
          pending.find((i) => i.chatId === openChatId));
      if (byChat) {
        this.selectedItemId.set(byChat.id);
      }
    }
  }

  private isMineActive(item: AtencionListItem): boolean {
    if ((item.unreadCount ?? 0) > 0) return true;
    const p = item.presence;
    if (p === 'online' || p === 'chatting' || p === 'away') return true;
    const updated = item.updatedAtMs ?? 0;
    if (updated && Date.now() - updated < MINE_ACTIVE_MS) return true;
    // Sin presencia aún (cargando): mantener visible
    if (!p && updated === 0) return true;
    if (!p) return true;
    return false;
  }

  private compareMineItems(a: AtencionListItem, b: AtencionListItem): number {
    const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (unreadDiff !== 0) return unreadDiff;
    const rank = (p?: PresenceStatus) => {
      switch (p) {
        case 'chatting':
          return 4;
        case 'online':
          return 3;
        case 'away':
          return 2;
        case 'offline':
          return 0;
        default:
          return 1;
      }
    };
    const presenceDiff = rank(b.presence) - rank(a.presence);
    if (presenceDiff !== 0) return presenceDiff;
    return (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0);
  }

  private presenceLabel(status?: PresenceStatus): string {
    switch (status) {
      case 'online':
        return 'En línea';
      case 'chatting':
        return 'En chat';
      case 'away':
        return 'Ausente';
      case 'offline':
        return 'Desconectado';
      case 'busy':
        return 'Ocupado';
      default:
        return '…';
    }
  }

  private dedupeMineByVisitor(items: AtencionListItem[]): AtencionListItem[] {
    const byVisitor = new Map<string, AtencionListItem>();
    for (const item of items) {
      const prev = byVisitor.get(item.visitorId);
      if (!prev || (item.updatedAtMs ?? 0) >= (prev.updatedAtMs ?? 0)) {
        byVisitor.set(item.visitorId, item);
      }
    }
    return Array.from(byVisitor.values());
  }

  private splitPendingQueue(queue: unknown[]): {
    withMessage: AtencionListItem[];
    silentWeb: AtencionListItem[];
  } {
    const withMessage: AtencionListItem[] = [];
    const silentWeb: AtencionListItem[] = [];
    for (const raw of queue ?? []) {
      const row = raw as Record<string, unknown>;
      if (this.pendingHasVisitorMessage(row)) {
        withMessage.push(this.mapPendingRow(row));
      } else {
        silentWeb.push(this.mapSilentPendingToWeb(row));
      }
    }
    return { withMessage, silentWeb };
  }

  private mapPendingRow(row: Record<string, unknown>): AtencionListItem {
    const chatId = String(row['id'] ?? row['chatId'] ?? '');
    const visitorInfo = (row['visitorInfo'] ?? {}) as Record<string, unknown>;
    const metadata = (row['metadata'] ?? {}) as Record<string, unknown>;
    const visitorId = String(
      visitorInfo['id'] ?? row['visitorId'] ?? 'unknown'
    );
    const name = getVisitorDisplayName({
      id: visitorId,
      name: String(visitorInfo['name'] ?? ''),
      email: String(visitorInfo['email'] ?? ''),
    });
    const lastMessage = row['lastMessage'] as Message | undefined;
    const previewRaw = String(
      row['lastMessagePreview'] ?? row['lastMessageContent'] ?? ''
    ).trim();
    const preview = this.previewFromMessage(
      lastMessage ?? { content: previewRaw },
      'Esperando atención'
    );
    const pageLabel = this.formatPageLabel(
      String(metadata['initialUrl'] ?? metadata['currentUrl'] ?? '')
    );
    if (lastMessage?.systemData?.action === 'lead_capture_submission') {
      this.leadContactService.invalidate(visitorId);
    }
    const cached = this.leadContactService.peekCache(visitorId);
    return {
      id: `pending-${chatId}`,
      kind: 'pending',
      title: getContactDisplayName(cached) || name,
      subtitle: preview,
      preview,
      pageLabel,
      isLead:
        this.contactMeetsLeadCriteria(cached) ||
        lastMessage?.systemData?.action === 'lead_capture_submission',
      chatId,
      visitorId,
      unreadCount: Number(
        row['unreadMessagesCount'] ?? row['unreadCount'] ?? 0
      ),
      statusLabel: 'Pendiente',
      rawChat: undefined,
    };
  }

  private mapSilentPendingToWeb(row: Record<string, unknown>): AtencionListItem {
    const chatId = String(row['id'] ?? row['chatId'] ?? '');
    const visitorInfo = (row['visitorInfo'] ?? {}) as Record<string, unknown>;
    const metadata = (row['metadata'] ?? {}) as Record<string, unknown>;
    const visitorId = String(
      visitorInfo['id'] ?? row['visitorId'] ?? 'unknown'
    );
    const name = getVisitorDisplayName({
      id: visitorId,
      name: String(visitorInfo['name'] ?? ''),
      email: String(visitorInfo['email'] ?? ''),
    });
    const pageLabel = this.formatPageLabel(
      String(metadata['initialUrl'] ?? metadata['currentUrl'] ?? '')
    );
    const cached = this.leadContactService.peekCache(visitorId);
    return {
      id: `web-${visitorId}`,
      kind: 'web',
      title: getContactDisplayName(cached) || name,
      subtitle: pageLabel || 'En el sitio, aún no ha escrito',
      pageLabel,
      isLead: this.contactMeetsLeadCriteria(cached),
      chatId,
      visitorId,
      unreadCount: 0,
      statusLabel: 'En la web',
    };
  }

  private mergeWebItems(
    fromPending: AtencionListItem[],
    fromSearch: AtencionListItem[]
  ): AtencionListItem[] {
    const byVisitor = new Map<string, AtencionListItem>();
    for (const item of fromSearch) {
      byVisitor.set(item.visitorId, item);
    }
    for (const item of fromPending) {
      const prev = byVisitor.get(item.visitorId);
      // PENDING vacío solo enriquece a quien sigue en el sitio (búsqueda).
      // Sin esto, al cerrar la pestaña el chat site-entry reaparece en gris.
      if (!prev) continue;
      byVisitor.set(item.visitorId, {
        ...prev,
        ...item,
        title: prev.title && !prev.title.startsWith('Visitante')
          ? prev.title
          : item.title,
        pageLabel: item.pageLabel || prev.pageLabel,
        statusLabel: prev.statusLabel,
        presence: prev.presence,
        rawVisitor: prev.rawVisitor,
        chatId: item.chatId ?? prev.chatId,
      });
    }
    return Array.from(byVisitor.values()).sort(
      (a, b) =>
        (a.presence === 'away' ? 1 : 0) - (b.presence === 'away' ? 1 : 0)
    );
  }

  /**
   * Pendientes solo si el visitante ya pidió algo (los vacíos de site-entry van
   * a En la web). Dejar sus datos en el asistente de captación cuenta como
   * pedirlo, aunque el mensaje que lo resume lo firme el sistema.
   */
  private pendingHasVisitorMessage(row: Record<string, unknown>): boolean {
    const lastMessage = row['lastMessage'] as
      | (Message & { senderType?: string; sender?: { type?: string } })
      | undefined;
    if (lastMessage?.systemData?.action === 'lead_capture_submission') {
      return true;
    }

    const preview = String(
      row['lastMessagePreview'] ??
        row['lastMessageContent'] ??
        lastMessage?.content ??
        ''
    ).trim();
    if (!preview) return false;

    const sender = String(
      lastMessage?.senderType ?? lastMessage?.sender?.type ?? ''
    ).toUpperCase();
    if (
      sender === 'SYSTEM' ||
      sender === 'COMMERCIAL' ||
      sender === 'AGENT'
    ) {
      return false;
    }
    return true;
  }

  private mapMineChat(chat: Chat): AtencionListItem {
    const updatedAtMs = chat.updatedAt
      ? new Date(chat.updatedAt).getTime()
      : chat.createdAt
        ? new Date(chat.createdAt).getTime()
        : 0;
    const preview = this.previewFromMessage(chat.lastMessage, 'Sin mensajes');
    const meta = (
      chat as Chat & { metadata?: { initialUrl?: string; currentUrl?: string } }
    ).metadata;
    const pageLabel = this.formatPageLabel(
      meta?.initialUrl ?? meta?.currentUrl
    );
    const cached = this.leadContactService.peekCache(chat.visitorId);
    return {
      id: `mine-${chat.chatId}`,
      kind: 'mine',
      title:
        getContactDisplayName(cached) ||
        getVisitorDisplayName({
          id: chat.visitorId,
          name: chat.name || chat.participants?.[0]?.name,
        }),
      subtitle: preview,
      preview,
      pageLabel,
      isLead: this.contactMeetsLeadCriteria(cached),
      chatId: chat.chatId,
      visitorId: chat.visitorId,
      unreadCount: chat.unreadCount ?? 0,
      statusLabel: 'Mío',
      updatedAtMs,
      rawChat: chat,
    };
  }

  private mapWebVisitor(v: VisitorSearchResult): AtencionListItem {
    const cached = this.leadContactService.peekCache(v.id);
    const title =
      getContactDisplayName(cached) ||
      getVisitorDisplayName({
        id: v.id,
        name: v.name,
        email: v.email,
      });
    const pageLabel = this.formatPageLabel(v.currentUrl) ?? v.domain;
    const isLead =
      this.contactMeetsLeadCriteria(cached) ||
      this.isLeadLifecycle(v.lifecycle);
    const idle = this.isIdleOnSite(v);
    return {
      id: `web-${v.id}`,
      kind: 'web',
      title,
      subtitle: pageLabel || 'En el sitio',
      pageLabel: pageLabel || undefined,
      isLead,
      visitorId: v.id,
      unreadCount: 0,
      statusLabel: idle ? 'Leyendo' : 'Navegando',
      presence: idle ? 'away' : 'online',
      rawVisitor: v,
    };
  }

  private notifyPendingDeltas(pending: AtencionListItem[]): void {
    if (!this.pendingToastBaselineReady) {
      pending.forEach((item) => {
        if (item.chatId) this.notifiedPendingChatIds.add(item.chatId);
      });
      this.pendingToastBaselineReady = true;
      return;
    }

    for (const item of pending) {
      if (!item.chatId) continue;
      if (this.notifiedPendingChatIds.has(item.chatId)) continue;
      this.notifyNewPendingChat(item.chatId, item.title);
    }
  }

  private notifyNewPendingChat(chatId: string, visitorName: string): void {
    if (this.notifiedPendingChatIds.has(chatId)) return;
    this.notifiedPendingChatIds.add(chatId);
    this.toastService.info(`Nuevo mensaje de ${visitorName}`);
    this.unreadMessagesService.notifyVisitorSpeech({
      chatId,
      body: `Nuevo mensaje de ${visitorName}`,
      visitorName,
      queue: 'pendientes',
    });
  }

  private enrichRowsWithContacts(visitorIds: string[]): void {
    if (visitorIds.length === 0) return;

    this.leadContactService
      .ensureContacts(visitorIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const patch = (items: AtencionListItem[]): AtencionListItem[] =>
            items.map((item) => {
              const contact = this.leadContactService.peekCache(item.visitorId);
              const displayName = getContactDisplayName(contact);
              const leadFromContact = this.contactMeetsLeadCriteria(contact);
              const leadFromLifecycle = this.isLeadLifecycle(
                item.rawVisitor?.lifecycle
              );
              return {
                ...item,
                title: displayName || item.title,
                isLead: item.isLead || leadFromContact || leadFromLifecycle,
              };
            });

          this.pendingItems.update(patch);
          this.mineItems.update(patch);
          this.webItems.update(patch);
        },
      });
  }

  private isCurrentVisitorLead(): boolean {
    if (this.selectedItem()?.isLead) return true;
    const visitorId = this.selectedChat()?.visitorId;
    const contact =
      this.visitorContactData() ??
      (visitorId ? this.leadContactService.peekCache(visitorId) : null);
    return this.contactMeetsLeadCriteria(contact);
  }

  private contactMeetsLeadCriteria(contact: LeadContactData | null): boolean {
    if (!contact) return false;
    const hasName = !!contact.nombre?.trim();
    const hasContact =
      !!contact.email?.trim() || !!contact.telefono?.trim();
    return hasName && hasContact;
  }

  private isLeadLifecycle(lifecycle?: string | null): boolean {
    const value = String(lifecycle ?? '').toUpperCase();
    return value === 'LEAD' || value === 'CONVERTED';
  }

  private previewFromMessage(
    message?: Pick<Message, 'content' | 'systemData'> | { content?: string } | null,
    fallback = ''
  ): string {
    const action = (message as Message | undefined)?.systemData?.action;
    if (action === 'contact_request') return 'Solicitud de datos';
    if (action === 'contact_submission') return 'Datos recibidos';
    if (action === 'contact_cancellation') return 'Formulario cancelado';
    if (action === 'lead_capture_submission') return 'Datos de contacto recibidos';
    const content = String(message?.content ?? '').trim();
    if (/solicitud de datos/i.test(content)) return 'Solicitud de datos';
    if (/datos de contacto enviados/i.test(content)) return 'Datos recibidos';
    return this.truncatePreview(content) || fallback;
  }

  private truncatePreview(text: string, max = PREVIEW_MAX_CHARS): string {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) return '';
    return normalized.length > max
      ? `${normalized.slice(0, max - 1)}…`
      : normalized;
  }

  private formatPageLabel(url?: string | null): string | undefined {
    if (!url?.trim()) return undefined;
    try {
      const parsed = new URL(url, 'https://local.invalid');
      const path = `${parsed.pathname}${parsed.search || ''}`;
      const label = path === '/' ? parsed.hostname : path;
      return label.length > 40 ? `${label.slice(0, 37)}…` : label;
    } catch {
      return url.length > 40 ? `${url.slice(0, 37)}…` : url;
    }
  }

  private guessBrowser(ua?: string): string {
    if (!ua) return 'Navegador';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    return 'Navegador';
  }
}
