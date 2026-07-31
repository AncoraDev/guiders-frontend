import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from '@guiders-frontend/chat-service';
import { SelfChatService } from '@guiders-frontend/self-chat';
import type { Chat } from '@guiders-frontend/shared/types';
import {
  ChatTourSandboxLifecycleHook,
  CHAT_TOUR_SANDBOX_HOOK_PROVIDER,
} from './chat-tour-sandbox.hook';
import { DEMO_VISITOR_ID, TourSandboxService } from './tour-sandbox';
import { TourUiBridgeService } from './tour-ui-bridge';
import { TOUR_LIFECYCLE_HOOKS } from '@guiders-frontend/shared/util/tour';

/**
 * The hook must:
 * - Activate the sandbox (still needed for the demo visitor in the
 *   visitors panel) on console tour start; deactivate on end.
 * - Drive the inbox UI by selecting / deselecting the user's SELF chat
 *   (no longer the DEMO chat). The self chat is created by SessionService
 *   on login and bridged into ChatService.chats$ via SelfChatService.
 * - Be a no-op for tour ids other than 'console'.
 */
describe('ChatTourSandboxLifecycleHook', () => {
  let hook: ChatTourSandboxLifecycleHook;
  let sandbox: TourSandboxService;
  let chatService: {
    selectChat: ReturnType<typeof vi.fn>;
    isSelfChatId: ReturnType<typeof vi.fn>;
  };
  let selfChat: { currentChat: Chat | null };

  const SELF_CHAT_ID = 'self-user-1';
  const buildSelfChat = (): Chat => ({
    chatId: SELF_CHAT_ID,
    status: 'ACTIVE',
    priority: 'NORMAL',
    visitorId: 'user-1',
    unreadCount: 0,
    isTyping: false,
    typingUsers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [
      {
        id: 'user-1',
        name: 'Op (Tú)',
        email: 'op@example.com',
        role: 'commercial',
        status: 'online',
      },
    ],
    archived: false,
    muted: false,
    pinned: true,
  });

  beforeEach(() => {
    chatService = {
      selectChat: vi.fn(),
      isSelfChatId: vi.fn((id: string) => id?.startsWith('self-')),
    };
    selfChat = { currentChat: buildSelfChat() };

    TestBed.configureTestingModule({
      providers: [
        TourSandboxService,
        TourUiBridgeService,
        { provide: ChatService, useValue: chatService },
        { provide: SelfChatService, useValue: selfChat },
        ChatTourSandboxLifecycleHook,
      ],
    });

    sandbox = TestBed.inject(TourSandboxService);
    hook = TestBed.inject(ChatTourSandboxLifecycleHook);
  });

  describe('onTourStart', () => {
    it('activates the sandbox for the console tour', async () => {
      await hook.onTourStart('console', 'user-1');
      expect(sandbox.isActive()).toBe(true);
    });

    it('does NOT seed any demo chat into ChatService (self-chat is bridged by SelfChatService)', async () => {
      await hook.onTourStart('console', 'user-1');
      expect(chatService.selectChat).not.toHaveBeenCalled();
    });

    it('is a no-op for the admin tour', async () => {
      await hook.onTourStart('admin', 'user-1');
      expect(sandbox.isActive()).toBe(false);
      expect(chatService.selectChat).not.toHaveBeenCalled();
    });
  });

  describe('onTourEnd', () => {
    it('deselects the active chat and deactivates the sandbox', async () => {
      await hook.onTourStart('console', 'user-1');
      await hook.onTourEnd('console', 'user-1');

      expect(chatService.selectChat).toHaveBeenCalledWith(null);
      expect(sandbox.isActive()).toBe(false);
    });

    it('resets the TourUiBridgeService so the visitor panel does not stay open', async () => {
      const bridge = TestBed.inject(TourUiBridgeService);
      bridge.requestOpenVisitorPanel(true);

      await hook.onTourEnd('console', 'user-1');

      expect(bridge.visitorPanelOpenRequested()).toBe(false);
    });

    it('is idempotent: calling onTourEnd without onTourStart does not throw', async () => {
      await expect(hook.onTourEnd('console', 'user-1')).resolves.toBeUndefined();
    });

    it('is a no-op for the admin tour', async () => {
      await hook.onTourEnd('admin', 'user-1');
      expect(chatService.selectChat).not.toHaveBeenCalled();
    });
  });

  describe('onBeforeStep — auto-prepare UI for each step', () => {
    // Step indices that need auto-setup so the user actually SEES what the
    // tooltip is talking about:
    //   - step 3 (atencion-main): auto-select the SELF chat so the
    //     conversation thread is rendered behind the tooltip.
    //   - step 4 (message-input): SELF chat must remain selected.
    //   - step 5 (visitor-detail-panel): re-assert selection + open panel.
    //   - step 6 (nav-visitors): close visitor panel.
    // Other steps are pure orientation and need no setup.

    it('selects the SELF chat before step 3 (inbox-main)', async () => {
      await hook.onTourStart('console', 'user-1');
      chatService.selectChat.mockClear();

      await hook.onBeforeStep(3, 'console', 'user-1');

      expect(chatService.selectChat).toHaveBeenCalledWith(SELF_CHAT_ID);
    });

    it('keeps the SELF chat selected before step 4 (message-input)', async () => {
      await hook.onTourStart('console', 'user-1');
      chatService.selectChat.mockClear();

      await hook.onBeforeStep(4, 'console', 'user-1');

      expect(chatService.selectChat).toHaveBeenCalledWith(SELF_CHAT_ID);
    });

    it('opens the visitor panel before step 5 (visitor-detail-panel)', async () => {
      const bridge = TestBed.inject(TourUiBridgeService);
      await hook.onTourStart('console', 'user-1');

      await hook.onBeforeStep(5, 'console', 'user-1');

      expect(bridge.visitorPanelOpenRequested()).toBe(true);
    });

    it('also re-asserts the SELF chat selection on step 5', async () => {
      await hook.onTourStart('console', 'user-1');
      chatService.selectChat.mockClear();

      await hook.onBeforeStep(5, 'console', 'user-1');

      expect(chatService.selectChat).toHaveBeenCalledWith(SELF_CHAT_ID);
    });

    it('closes the visitor panel before step 6 (nav-visitors)', async () => {
      const bridge = TestBed.inject(TourUiBridgeService);
      bridge.requestOpenVisitorPanel(true);
      await hook.onTourStart('console', 'user-1');

      await hook.onBeforeStep(6, 'console', 'user-1');

      expect(bridge.visitorPanelOpenRequested()).toBe(false);
    });

    it('is a no-op for steps without setup needs (e.g. step 0 sidebar-header)', async () => {
      const bridge = TestBed.inject(TourUiBridgeService);
      await hook.onTourStart('console', 'user-1');
      chatService.selectChat.mockClear();

      await hook.onBeforeStep(0, 'console', 'user-1');

      expect(chatService.selectChat).not.toHaveBeenCalled();
      expect(bridge.visitorPanelOpenRequested()).toBe(false);
    });

    it('is a no-op for the admin tour', async () => {
      const bridge = TestBed.inject(TourUiBridgeService);

      await hook.onBeforeStep(3, 'admin', 'user-1');
      await hook.onBeforeStep(5, 'admin', 'user-1');

      expect(chatService.selectChat).not.toHaveBeenCalled();
      expect(bridge.visitorPanelOpenRequested()).toBe(false);
    });

    it('does not crash on step 3 if SELF chat is not yet initialized (silent no-op)', async () => {
      selfChat.currentChat = null;
      await hook.onTourStart('console', 'user-1');
      chatService.selectChat.mockClear();

      await expect(hook.onBeforeStep(3, 'console', 'user-1')).resolves.toBeUndefined();
      expect(chatService.selectChat).not.toHaveBeenCalled();
    });
  });

  describe('sandbox observable state', () => {
    it('exposes the demo visitor through the sandbox after onTourStart (visitors panel still uses it)', async () => {
      await hook.onTourStart('console', 'user-1');
      const visitors = await firstValueFrom(sandbox.visitors$);
      expect(visitors).toHaveLength(1);
      expect(visitors[0].id).toBe(DEMO_VISITOR_ID);
    });
  });
});

describe('CHAT_TOUR_SANDBOX_HOOK_PROVIDER', () => {
  it('registers ChatTourSandboxLifecycleHook as a TOUR_LIFECYCLE_HOOKS multi-provider', () => {
    const chatServiceStub = {
      selectChat: vi.fn(),
      isSelfChatId: vi.fn(() => false),
    };
    const selfChatStub = { currentChat: null };

    TestBed.configureTestingModule({
      providers: [
        TourSandboxService,
        TourUiBridgeService,
        { provide: ChatService, useValue: chatServiceStub },
        { provide: SelfChatService, useValue: selfChatStub },
        CHAT_TOUR_SANDBOX_HOOK_PROVIDER,
      ],
    });

    const hooks = TestBed.inject(TOUR_LIFECYCLE_HOOKS);
    expect(hooks).toBeTruthy();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    expect(hooks.some((h) => h instanceof ChatTourSandboxLifecycleHook)).toBe(
      true,
    );
  });
});
