# AGENTS.md - Chat: Inbox Feature

**Parent Documentation**: [`../../AGENTS.md` (Root)](../../../../AGENTS.md)

## Overview

The inbox feature is the main messaging interface for operators. It displays conversations with visitors, allows message composition, and manages conversation states (open, closed, escalated).

## Feature Structure

```
libs/chat/features/inbox/
├── src/
│   ├── lib/
│   │   ├── components/          # Inbox UI components
│   │   ├── services/            # Inbox-specific logic
│   │   ├── state/               # State management (signals/BehaviorSubject)
│   │   └── routes/              # Feature routing
│   └── index.ts                 # Public API
└── project.json
```

## Key Components & Services

- **InboxComponent** - Main inbox container with conversation list
- **ConversationPanelComponent** - Conversation detail view
- **MessageListComponent** - Message rendering with virtualization
- **MessageInputComponent** - Message composition UI
- **InboxService** - Inbox state management and API calls
- **ConversationService** - Individual conversation logic

## Development Commands

```bash
# Serve console with inbox feature
npm run serve                    # Port 4200 with full inbox

# Test inbox feature
nx test chat-inbox              # All tests
nx test chat-inbox --testFile=inbox.component.spec.ts
nx test chat-inbox -- --grep "message.*sent"

# Lint and fix
nx lint chat-inbox
nx lint chat-inbox -- --fix

# Build only inbox
nx build chat-inbox
```

## Common Tasks

### Adding New Message Types

1. Define type in `@guiders-frontend/shared/types`
2. Add message renderer component in `components/`
3. Update `MessageListComponent` to handle new type
4. Add tests for message rendering

### Updating Conversation List

- Use `InboxService.conversations$` for reactive updates
- Implement virtual scrolling for large lists
- Use trackBy functions for performance

### Real-time Message Updates

- Messages use WebSocket via `ChatService` from data-access
- Subscribe to message events in component
- Unsubscribe in ngOnDestroy

### Styling Conversation Cards

```scss
@use '@guiders-frontend/shared/design-tokens' as tokens;

.guiders-inbox__conversation {
  padding: tokens.$spacing-md;
  border-bottom: 1px solid tokens.$color-border-light;
  transition: tokens.$transition-normal;

  &:hover {
    background-color: tokens.$color-bg-hover;
  }

  &--active {
    background-color: tokens.$color-bg-selected;
  }
}
```

## Architecture Rules

Inbox (type: feature) can import from:

- ✅ `@guiders-frontend/shared/ui/*` (UI components)
- ✅ `@guiders-frontend/shared/util/*` (utilities)
- ✅ `@guiders-frontend/chat/data-access/*` (chat services)
- ✅ `@guiders-frontend/chat/ui/*` (chat-specific UI)
- ✅ `@guiders-frontend/shared/types/*` (types)

Inbox CANNOT import from:

- ❌ `@guiders-frontend/admin/*` (different domain)
- ❌ `@guiders-frontend/analytics/*` (different domain)
- ❌ Relative paths across domain boundaries

## Testing Guidelines

```typescript
// Example: Test message sending
it('should send message and update conversation', fakeAsync(() => {
  const message = 'Hello';
  component.onMessageSend(message);

  tick();

  expect(inboxService.sendMessage).toHaveBeenCalledWith(message);
  expect(component.messages()).toContain(jasmine.objectContaining({ text: message }));
}));

// Example: Test conversation selection
it('should load conversation details when selected', fakeAsync(() => {
  const conversationId = '123';
  component.selectConversation(conversationId);

  tick();

  expect(component.selectedConversation()).toBe(conversationId);
  expect(conversationService.loadMessages).toHaveBeenCalled();
}));
```

## Key Files to Know

| File                                                                    | Purpose                  |
| ----------------------------------------------------------------------- | ------------------------ |
| `src/lib/components/inbox/inbox.component.ts`                           | Main inbox container     |
| `src/lib/components/conversation-panel/conversation-panel.component.ts` | Single conversation view |
| `src/lib/components/message-list/message-list.component.ts`             | Scrollable message list  |
| `src/lib/services/inbox.service.ts`                                     | Inbox state & API        |
| `src/lib/services/conversation.service.ts`                              | Conversation logic       |
| `src/index.ts`                                                          | Public API exports       |

## Performance Considerations

- **Message Virtualization**: Use virtual scrolling for conversations with many messages
- **Change Detection**: All components use `ChangeDetectionStrategy.OnPush`
- **Memory Leaks**: Always unsubscribe from observables in ngOnDestroy
- **API Calls**: Use `shareReplay()` on observable data-access methods

## Debugging

**WebSocket Not Connecting**:

- Check `WEBSOCKET_URL` environment variable
- Verify socket subscription in `ChatService`
- Check browser console for connection errors

**Messages Not Appearing**:

- Verify message service is called correctly
- Check that component is subscribed to message updates
- Look for failed HTTP requests in network tab

**Performance Issues**:

- Use Chrome DevTools Performance tab
- Check for excessive change detection cycles
- Profile virtual scrolling with large message lists

## Related Features

- **Visitors** (`libs/chat/features/visitors`) - Visitor management
- **Contacts** (`libs/chat/features/contacts`) - Contact information
- **Chat Data Access** (`libs/chat/data-access`) - API communication

## Common Workflows

### Handling a New Conversation

1. User clicks visitor/conversation in list
2. `ConversationPanelComponent` loads messages
3. WebSocket subscribes to real-time updates
4. Operator can compose and send messages

### Implementing Message Filters

1. Add filter UI in inbox header
2. Store filter state in signal
3. Pass to service as query parameter
4. Update message list subscription

## See Also

- [Root AGENTS.md](../../../../AGENTS.md) - General guidelines
- [Chat Data Access](../../../../libs/chat/data-access/) - Service documentation
- [Visitors Feature](../visitors/AGENTS.md) - Related visitor feature
- [Shared Types](../../../../libs/shared/types/) - Type definitions
