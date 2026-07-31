import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { Inbox } from './inbox';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/auth/data-access/session';
import { Environment } from '@guiders-frontend/shared/types';
import { ChatService } from '@guiders-frontend/chat-service';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';

describe('Inbox', () => {
  let component: Inbox;
  let fixture: ComponentFixture<Inbox>;

  const mockEnvironment: Environment = {
    production: false,
    auth: {
      authority: 'https://test.com',
      clientId: 'test-client',
      scope: 'openid',
      secureRoutes: [],
    },
    api: {
      baseUrl: 'http://localhost:3000/api',
    },
  };

  const mockCommercialPresence = {
    isConnected$: of(true),
    connectionStatus$: of('online'),
    getCurrentStatus: () => ({
      isConnected: true,
      status: 'online' as const,
      lastActivity: null,
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Inbox],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT_TOKEN, useValue: mockEnvironment },
        { provide: CommercialPresenceService, useValue: mockCommercialPresence },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Inbox);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onSendMessage', () => {
    let chatService: ChatService;
    let sendMessageSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      chatService = TestBed.inject(ChatService);
      sendMessageSpy = vi
        .spyOn(chatService, 'sendMessage')
        .mockReturnValue(of({} as never));
    });

    it('routes the message through ChatService.sendMessage for any chatId', () => {
      component.selectedConversationId.set('real-chat-123');

      component.onSendMessage('hello');

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chatId: 'real-chat-123',
        content: 'hello',
        type: 'text',
      });
    });

    it('routes self chats through ChatService.sendMessage too (which will internally delegate to SelfChatService)', () => {
      component.selectedConversationId.set('self-user-1');

      component.onSendMessage('mensaje self');

      expect(sendMessageSpy).toHaveBeenCalledWith({
        chatId: 'self-user-1',
        content: 'mensaje self',
        type: 'text',
      });
    });

    it('does nothing when there is no selected chat', () => {
      component.selectedConversationId.set(null);

      component.onSendMessage('hello');

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('onUserSelected', () => {
    let chatService: ChatService;
    let getMessagesV2Spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      chatService = TestBed.inject(ChatService);
      getMessagesV2Spy = vi
        .spyOn(chatService, 'getMessagesV2')
        .mockReturnValue(
          of({ messages: [], total: 0, hasMore: false, nextCursor: null }) as never
        );
    });

    it('calls getMessagesV2 for real chats', () => {
      const realChat = { chatId: 'real-chat-999', participants: [] } as never;
      component.onUserSelected(realChat);

      expect(getMessagesV2Spy).toHaveBeenCalledWith(
        'real-chat-999',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('does not call getMessagesV2 for self chats (messages are bridged via ChatService.messages$)', () => {
      vi.spyOn(chatService, 'isSelfChatId').mockReturnValue(true);
      const selfChat = { chatId: 'self-user-1', participants: [] } as never;

      component.onUserSelected(selfChat);

      expect(getMessagesV2Spy).not.toHaveBeenCalled();
      expect(component.selectedConversationId()).toBe('self-user-1');
    });
  });
});
