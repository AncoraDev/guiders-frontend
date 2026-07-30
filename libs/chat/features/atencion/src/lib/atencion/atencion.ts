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
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { ChatService } from '@guiders-frontend/chat-service';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { UnreadMessagesService } from '@guiders-frontend/unread-messages-service';
import { PresenceService } from '@guiders-frontend/presence-service';
import {
  VisitorsDataService,
  VisitorActivity,
} from '@guiders-frontend/visitors-data-service';
import { GuidersChatPlaceholderComponent } from '@guiders-frontend/chat/ui/chat-placeholder';
import type { VisitorChatProfile } from '@guiders-frontend/chat/ui/chat-placeholder';
import { GuidersChatWelcomeStateComponent } from '@guiders-frontend/chat/ui/chat-welcome-state';
import { VisitorDetailPanel } from '@guiders-frontend/visitor-detail-panel';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { getVisitorDisplayName } from '@guiders-frontend/visitor-display-name';
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

/** Segundos máximos desde última actividad para considerar "en la web ahora". */
const WEB_FRESHNESS_MS = 2 * 60 * 1000;
/** Offline sin no-leídos más antiguos que esto → sección inactivos. */
const MINE_ACTIVE_MS = 48 * 60 * 60 * 1000;
/** Polling silencioso para colas (presencia/unread van por WebSocket). */
const POLL_MS = 4000;

export type AtencionCola = 'pendientes' | 'mios' | 'en-web';

export interface AtencionListItem {
  id: string;
  kind: 'pending' | 'mine' | 'web';
  title: string;
  subtitle: string;
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
  private readonly unreadMessagesService = inject(UnreadMessagesService);
  private readonly presenceService = inject(PresenceService);
  private readonly visitorsService = inject(VisitorsDataService);
  private readonly leadContactService = inject(LeadContactService);
  private readonly route = inject(ActivatedRoute);

  readonly activeCola = signal<AtencionCola>('pendientes');
  readonly isLoading = signal(false);
  readonly isClaiming = signal(false);
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
  readonly showVisitorPanel = signal(false);
  readonly pageHistory = signal<VisitorPageHistoryItem[]>([]);
  readonly pageHistoryTotal = signal(0);
  readonly pageHistoryLoading = signal(false);

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
    const contactName = [contact?.nombre, contact?.apellidos]
      .filter(Boolean)
      .join(' ')
      .trim();

    const displayName = getVisitorDisplayName({
      id: visitorId,
      name: contactName || participant?.name,
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

  ngOnInit(): void {
    const userId = this.currentUserId();
    if (userId) {
      this.unreadMessagesService.setCurrentUser(userId);
    }

    const colaParam = this.route.snapshot.queryParamMap.get('cola');
    if (
      colaParam === 'mios' ||
      colaParam === 'en-web' ||
      colaParam === 'pendientes'
    ) {
      this.activeCola.set(colaParam);
    }

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
          if (last?.content) {
            this.mineItems.update((list) =>
              list.map((item) =>
                item.chatId === chatId
                  ? {
                      ...item,
                      subtitle: String(last.content).slice(0, 80),
                      updatedAtMs: Date.now(),
                    }
                  : item
              )
            );
          }
        });
      });

    this.setupLiveSync();
    this.refreshAll();

    interval(POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshAll(true));
  }

  ngOnDestroy(): void {
    this.unreadMessagesService.setActiveChat(null);
    this.chatService.selectChat(null);
  }

  selectCola(cola: AtencionCola): void {
    this.activeCola.set(cola);
    this.clearSelectedChat();
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

  onSaveContactData(request: SaveContactDataRequest): void {
    const visitorId = this.selectedVisitor()?.id;
    if (!visitorId) return;

    this.savingContactData.set(true);
    this.leadContactService
      .saveContactData(visitorId, request)
      .pipe(
        finalize(() => this.savingContactData.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          const now = new Date().toISOString();
          const updated: LeadContactData = {
            id: this.visitorContactData()?.id || `temp-${Date.now()}`,
            visitorId,
            companyId:
              this.visitorContactData()?.companyId ||
              this.companyId() ||
              'unknown',
            nombre: request.nombre,
            apellidos: request.apellidos,
            email: request.email,
            telefono: request.telefono,
            poblacion: request.poblacion,
            extractedFromChatId: request.extractedFromChatId,
            additionalData: request.additionalData,
            extractedAt: this.visitorContactData()?.extractedAt || now,
            updatedAt: now,
          };
          this.visitorContactData.set(updated);
          this.applyContactDisplayName(visitorId, updated);
        },
        error: () => this.error.set('No se pudieron guardar los datos de contacto'),
      });
  }

  /** Actualiza título del chat abierto y de las listas con nombre real del contacto. */
  private applyContactDisplayName(
    visitorId: string,
    contact: LeadContactData | null
  ): void {
    if (!contact) return;

    const personName = [contact.nombre, contact.apellidos]
      .filter(Boolean)
      .join(' ')
      .trim();
    const displayName =
      personName ||
      contact.email ||
      contact.telefono ||
      null;
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

    const rename = (items: AtencionListItem[]): AtencionListItem[] =>
      items.map((item) =>
        item.visitorId === visitorId ? { ...item, title: displayName } : item
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
        map((res) => this.mapPendingQueue(res.queue)),
        catchError((err) => {
          console.error('[Atencion] pending queue error', err);
          return of([] as AtencionListItem[]);
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
            connectionStatus: ['online', 'chatting'],
            hasActiveSessions: true,
            isInternal: false,
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
          this.pendingItems.set(pending);
          this.mineItems.set(mine);
          const mineVisitorIds = new Set(mine.map((m) => m.visitorId));
          const pendingVisitorIds = new Set(pending.map((p) => p.visitorId));
          this.webItems.set(
            web
              .filter((v) =>
                this.isEligibleForWebQueue(v, mineVisitorIds, pendingVisitorIds)
              )
              .map((v) => this.mapWebVisitor(v))
          );

          this.wireMineRealtime(mine);
          this.preserveSelection(pending, mine);

          const contact = this.visitorContactData();
          const visitorId = this.selectedChat()?.visitorId;
          if (contact && visitorId) {
            this.applyContactDisplayName(visitorId, contact);
          }

          // Deep-link ?chat=… (p. ej. click en notificación)
          const chatParam = this.route.snapshot.queryParamMap.get('chat');
          if (chatParam && !this.selectedChat()) {
            const item = mine.find((i) => i.chatId === chatParam);
            if (item) {
              this.activeCola.set('mios');
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
   * - no soy yo / no interno
   * - sin chat previo ni pendiente
   * - no está ya en Míos
   * - actividad reciente (evita fantasmas online en Redis)
   */
  private isEligibleForWebQueue(
    v: VisitorSearchResult,
    mineVisitorIds: Set<string>,
    pendingVisitorIds: Set<string>
  ): boolean {
    if (v.isMe || v.isInternal) return false;
    if ((v.totalChatsCount ?? 0) > 0) return false;
    if (v.pendingChatIds && v.pendingChatIds.length > 0) return false;
    if (mineVisitorIds.has(v.id) || pendingVisitorIds.has(v.id)) return false;
    if ((v.activeSessionsCount ?? 0) < 1) return false;

    const lastSeen = Date.parse(v.updatedAt || v.createdAt || '');
    if (!Number.isNaN(lastSeen) && Date.now() - lastSeen > WEB_FRESHNESS_MS) {
      return false;
    }
    return true;
  }

  onSelectItem(item: AtencionListItem): void {
    if (this.isClaiming()) return;

    if (item.kind === 'pending' && item.chatId) {
      this.claimAndOpen(item);
      return;
    }

    if (item.kind === 'mine' && item.chatId) {
      this.openChat(item, item.rawChat ?? null);
      return;
    }

    if (item.kind === 'web') {
      this.startChatWithVisitor(item);
    }
  }

  onSendMessage(content: string): void {
    const chat = this.selectedChat();
    const userId = this.currentUserId();
    if (!chat || !userId || !content.trim()) return;

    this.chatService
      .sendMessage({
        chatId: chat.chatId,
        content: content.trim(),
        type: 'text',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.error.set('Error al enviar el mensaje'),
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
      });

    // Tras reconectar WS: re-join + refresh
    this.chatService.webSocketService.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state === 'connected') {
          this.wireMineRealtime(this.mineItems());
        }
      });
  }

  private wireMineRealtime(mine: AtencionListItem[]): void {
    const chatIds = mine
      .map((m) => m.chatId)
      .filter((id): id is string => !!id);

    if (chatIds.length === 0) return;

    this.unreadMessagesService.registerChatsVisitors(
      mine
        .filter((m) => m.chatId)
        .map((m) => ({ chatId: m.chatId!, visitorId: m.visitorId }))
    );
    this.chatService.webSocketService.joinMultipleRooms(chatIds);
    this.unreadMessagesService.refreshUnreadCounts(chatIds);
    chatIds.forEach((chatId) => this.loadChatPresence(chatId));
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

  private claimAndOpen(item: AtencionListItem): void {
    const userId = this.currentUserId();
    const chatId = item.chatId;
    if (!userId || !chatId) return;

    this.isClaiming.set(true);
    this.visitorsService
      .assignChatToCommercial(chatId, userId)
      .pipe(
        switchMap(() => this.chatService.getChat(chatId)),
        finalize(() => this.isClaiming.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (chat) => {
          this.pendingItems.update((list) =>
            list.filter((i) => i.chatId !== chatId)
          );
          const mineItem: AtencionListItem = {
            ...item,
            id: `mine-${chatId}`,
            kind: 'mine',
            statusLabel: 'Mío',
            rawChat: chat ?? item.rawChat,
            updatedAtMs: Date.now(),
          };
          this.mineItems.update((list) => {
            if (list.some((i) => i.chatId === chatId)) return list;
            return [mineItem, ...list];
          });
          this.activeCola.set('mios');
          this.openChat(mineItem, chat);
          this.wireMineRealtime([mineItem]);
          this.refreshAll(true);
        },
        error: () => {
          this.error.set('No se pudo reclamar el chat');
        },
      });
  }

  private startChatWithVisitor(item: AtencionListItem): void {
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
        metadata: { source: 'atencion-en-web', department: 'general' },
      })
      .pipe(
        switchMap((res) =>
          this.visitorsService.assignChatToCommercial(res.chatId, userId).pipe(
            switchMap(() => this.chatService.getChat(res.chatId)),
            map((chat) => ({ chatId: res.chatId, chat }))
          )
        ),
        finalize(() => this.isClaiming.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ chatId, chat }) => {
          this.webItems.update((list) =>
            list.filter((i) => i.visitorId !== item.visitorId)
          );
          const mineItem: AtencionListItem = {
            id: `mine-${chatId}`,
            kind: 'mine',
            title: item.title,
            subtitle: 'Conversación iniciada',
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
        error: () => this.error.set('No se pudo iniciar el chat'),
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

    this.chatService.selectChat(resolved.chatId);
    this.unreadMessagesService.setActiveChat(resolved.chatId);
    // Asegurar sala WS del chat abierto (message:new)
    this.chatService.webSocketService.joinMultipleRooms([resolved.chatId]);
    this.loadMessages(resolved.chatId);
    this.loadChatPresence(resolved.chatId);
    this.loadVisitorProfile(item.visitorId, item.rawVisitor);

    // Panel de detalles abierto por defecto al seleccionar visitante/chat
    this.showVisitorPanel.set(true);
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
      .getContactData(visitorId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((contactData) => {
        if (this.selectedChat()?.visitorId !== visitorId) return;
        this.visitorContactData.set(contactData);
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

  private loadMessages(chatId: string): void {
    this.messagesLoading.set(true);
    // getMessages (no V2): sincroniza el historial en ChatService para que
    // message:new del WebSocket se añada al mismo array y el panel se actualice.
    this.chatService
      .getMessages(chatId, { limit: 50 })
      .pipe(
        finalize(() => this.messagesLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (messages) => {
          this.messages.set(messages);
        },
        error: () => this.error.set('Error al cargar mensajes'),
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

  private mapPendingQueue(queue: unknown[]): AtencionListItem[] {
    return (queue ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const chatId = String(row['id'] ?? row['chatId'] ?? '');
      const visitorInfo = (row['visitorInfo'] ?? {}) as Record<string, unknown>;
      const visitorId = String(
        visitorInfo['id'] ?? row['visitorId'] ?? 'unknown'
      );
      const name =
        String(visitorInfo['name'] ?? visitorInfo['email'] ?? '') ||
        `Visitante ${visitorId.slice(0, 8)}`;
      const preview = String(
        row['lastMessagePreview'] ?? row['lastMessageContent'] ?? ''
      );
      return {
        id: `pending-${chatId}`,
        kind: 'pending' as const,
        title: name,
        subtitle: preview || 'Esperando atención',
        chatId,
        visitorId,
        unreadCount: Number(
          row['unreadMessagesCount'] ?? row['unreadCount'] ?? 0
        ),
        statusLabel: 'Pendiente',
        rawChat: undefined,
      };
    });
  }

  private mapMineChat(chat: Chat): AtencionListItem {
    const updatedAtMs = chat.updatedAt
      ? new Date(chat.updatedAt).getTime()
      : chat.createdAt
        ? new Date(chat.createdAt).getTime()
        : 0;
    return {
      id: `mine-${chat.chatId}`,
      kind: 'mine',
      title: chat.name || chat.participants?.[0]?.name || 'Visitante',
      subtitle: chat.lastMessage?.content?.slice(0, 80) || 'Sin mensajes',
      chatId: chat.chatId,
      visitorId: chat.visitorId,
      unreadCount: chat.unreadCount ?? 0,
      statusLabel: 'Mío',
      updatedAtMs,
      rawChat: chat,
    };
  }

  private mapWebVisitor(v: VisitorSearchResult): AtencionListItem {
    const browser = this.guessBrowser(v.lastUserAgent);
    const shortId = v.id.slice(0, 8);
    const title = v.name || v.email || `Visitante · ${browser} · ${shortId}`;
    const page = v.currentUrl || v.domain || 'En el sitio';
    return {
      id: `web-${v.id}`,
      kind: 'web',
      title,
      subtitle: page,
      visitorId: v.id,
      unreadCount: 0,
      statusLabel: browser,
      rawVisitor: v,
    };
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
