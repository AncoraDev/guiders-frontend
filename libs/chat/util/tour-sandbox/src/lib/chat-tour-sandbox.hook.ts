/**
 * ChatTourSandboxLifecycleHook bridges the shared tour engine with the
 * chat domain's sandbox + the user's self chat. It is the only place that
 * knows about both `TourSandboxService`, `ChatService` and `SelfChatService`,
 * keeping `shared/util/tour` free of `scope:chat` imports.
 *
 * Responsibilities:
 * - On `console` tour start: activate the sandbox so the demo VISITOR is
 *   exposed (used by the visitors panel step). The chat used by the tour
 *   is the user's own SELF chat (created by SessionService on login and
 *   bridged into ChatService via SelfChatService) — no demo chat is seeded.
 * - On `console` tour end (or driver close): deselect the active chat,
 *   reset the UI bridge and deactivate the sandbox.
 * - During `console` tour steps: auto-select the SELF chat for inbox-related
 *   steps and toggle the visitor detail panel via TourUiBridgeService.
 * - The `admin` tour is a no-op for chat data.
 *
 * Registered globally via {@link CHAT_TOUR_SANDBOX_HOOK_PROVIDER}.
 */
import { Injectable, Provider, inject } from '@angular/core';
import { ChatService } from '@guiders-frontend/chat-service';
import { SelfChatService } from '@guiders-frontend/self-chat';
import {
  TOUR_LIFECYCLE_HOOKS,
  TourId,
  TourLifecycleHook,
} from '@guiders-frontend/shared/util/tour';
import { TourSandboxService } from './tour-sandbox';
import { TourUiBridgeService } from './tour-ui-bridge';

@Injectable({ providedIn: 'root' })
export class ChatTourSandboxLifecycleHook implements TourLifecycleHook {
  private readonly sandbox = inject(TourSandboxService);
  private readonly chatService = inject(ChatService);
  private readonly selfChat = inject(SelfChatService);
  private readonly bridge = inject(TourUiBridgeService);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onTourStart(tourId: TourId, _userId: string): Promise<void> {
    if (tourId !== 'console') return;

    // Activate sandbox so its observables emit the demo visitor (used by
    // step 7 nav-visitors) and `isActive` flips for any consumer that
    // branches on it. The chat used by the tour is the user's self chat,
    // which is already in ChatService.chats$ via SelfChatService bridge.
    this.sandbox.activate();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onTourEnd(tourId: TourId, _userId: string): Promise<void> {
    if (tourId !== 'console') return;

    // Order matters:
    // 1. Deselect the active chat so the inbox stops pointing at the
    //    self chat once the tour finishes.
    this.chatService.selectChat(null);
    // 2. Reset the UI bridge so any panel opened by the tour collapses.
    this.bridge.reset();
    // 3. Deactivate sandbox so demo visitor disappears from visitors$.
    this.sandbox.deactivate();
  }

  /**
   * Auto-prepares the inbox UI for steps that require it so the user
   * actually sees what the tooltip is talking about. Steps not listed
   * are pure orientation and require no setup.
   *
   * Step layout (see `console.tour.ts`):
   *   3 atencion-main          → select self chat
   *   4 message-input          → keep self chat selected
   *   5 visitor-detail-panel   → re-assert selection + open visitor panel
   *   6 nav-visitors           → close visitor panel
   */
  async onBeforeStep(
    stepIndex: number,
    tourId: TourId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: string
  ): Promise<void> {
    if (tourId !== 'console') return;

    const selfChatId = this.selfChat.currentChat?.chatId ?? null;

    switch (stepIndex) {
      case 3:
      case 4:
        if (selfChatId) {
          this.chatService.selectChat(selfChatId);
        }
        return;
      case 5:
        if (selfChatId) {
          this.chatService.selectChat(selfChatId);
        }
        this.bridge.requestOpenVisitorPanel(true);
        // Wait for Angular CD + DOM update so Shepherd can find the
        // [data-tour="visitor-detail-panel"] element on attach.
        await waitForDomUpdate();
        return;
      case 6:
        this.bridge.requestOpenVisitorPanel(false);
        await waitForDomUpdate();
        return;
      default:
        return;
    }
  }
}

/**
 * Waits for the next animation frame + a microtask flush so any signal
 * write (and its dependent effects) has had time to propagate through
 * Angular change detection and update the DOM. Required when a tour step
 * needs an element that only renders conditionally based on a signal.
 */
function waitForDomUpdate(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/**
 * Convenience provider to register the hook into the shared tour engine.
 * Add this to `app.config.ts` providers array of any app that should run
 * the console tour with chat sandbox integration (currently: console).
 */
export const CHAT_TOUR_SANDBOX_HOOK_PROVIDER: Provider = {
  provide: TOUR_LIFECYCLE_HOOKS,
  useExisting: ChatTourSandboxLifecycleHook,
  multi: true,
};
