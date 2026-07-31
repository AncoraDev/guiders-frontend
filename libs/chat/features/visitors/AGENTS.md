# AGENTS.md - Chat: Visitors Feature

**Parent Documentation**: [`../../AGENTS.md` (Root)](../../../../AGENTS.md)

## Overview

The visitors feature displays a list of active website visitors, their session information, and allows operators to initiate conversations. Includes filtering and sorting capabilities.

## Feature Structure

```
libs/chat/features/visitors/
├── src/
│   ├── lib/
│   │   ├── components/          # Visitor list and detail components
│   │   ├── services/            # Visitor data and filtering logic
│   │   ├── state/               # Filter and selection state
│   │   └── routes/              # Feature routing
│   └── index.ts                 # Public API
└── project.json
```

## Key Components & Services

- **VisitorsListComponent** - Main visitors table/list view
- **VisitorDetailComponent** - Individual visitor profile with session info
- **VisitorFilterComponent** - Advanced filter UI (location, device, behavior)
- **VisitorsService** - Visitor list and filtering API
- **VisitorSelectionService** - Track selected visitors for bulk actions

## Development Commands

```bash
# Serve with visitors feature
npm run serve                           # Full console app

# Test visitors feature
nx test chat-visitors                   # All tests
nx test chat-visitors --testFile=visitors-list.component.spec.ts
nx test chat-visitors -- --grep "filter"

# Lint and fix
nx lint chat-visitors
nx lint chat-visitors -- --fix

# E2E tests for visitors
nx e2e console-e2e -- --grep "visitor"
```

## Common Tasks

### Adding New Filter Options

1. Update `VisitorFilter` interface in `@guiders-frontend/shared/types`
2. Add UI control in `VisitorFilterComponent`
3. Update `VisitorsService.applyFilter()` method
4. Add tests for new filter logic

### Displaying Visitor Information

```typescript
// Example: Accessing visitor data
visitor$ = this.visitorsService.selectedVisitor$;

// In template:
// {{ visitor().name }}
// {{ visitor().sessionDuration | duration }}
// {{ visitor().location.city }}, {{ visitor().location.country }}
```

### Implementing Real-time Visitor Updates

- Subscribe to visitor events via WebSocket
- Update local signal when visitor status changes
- Reflect active/inactive state visually

### Styling Visitor Cards

```scss
@use '@guiders-frontend/shared/design-tokens' as tokens;

.guiders-visitors__card {
  padding: tokens.$spacing-md;
  border: 1px solid tokens.$color-border-light;
  border-radius: tokens.$border-radius-md;
  background: tokens.$color-bg-primary;

  &__status {
    display: flex;
    align-items: center;
    gap: tokens.$spacing-sm;

    &--active {
      color: tokens.$color-success;

      &::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: tokens.$color-success;
      }
    }

    &--inactive {
      color: tokens.$color-text-secondary;
    }
  }
}
```

## Architecture Rules

Visitors (type: feature) can import from:

- ✅ `@guiders-frontend/shared/ui/*` (UI components)
- ✅ `@guiders-frontend/shared/util/*` (utilities)
- ✅ `@guiders-frontend/chat/data-access/*` (chat services)
- ✅ `@guiders-frontend/shared/types/*` (types)

Visitors CANNOT import from:

- ❌ `@guiders-frontend/admin/*`
- ❌ `@guiders-frontend/analytics/*`
- ❌ Relative paths across domain boundaries

## Testing Guidelines

```typescript
// Test visitor filtering
it('should filter visitors by location', fakeAsync(() => {
  const filter: VisitorFilter = { location: 'New York' };

  component.applyFilter(filter);
  tick();

  expect(component.filteredVisitors()).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ location: { city: 'New York' } })]));
}));

// Test visitor selection
it('should select visitor and emit event', () => {
  spyOn(component.visitorSelected, 'emit');
  const visitor = mockVisitor();

  component.selectVisitor(visitor);

  expect(component.visitorSelected.emit).toHaveBeenCalledWith(visitor);
});

// Test loading state
it('should show loading indicator when fetching visitors', () => {
  component.loadVisitors();

  expect(component.isLoading()).toBe(true);

  tick();

  expect(component.isLoading()).toBe(false);
});
```

## Key Files to Know

| File                                                            | Purpose                  |
| --------------------------------------------------------------- | ------------------------ |
| `src/lib/components/visitors-list/visitors-list.component.ts`   | Main visitors table/list |
| `src/lib/components/visitor-detail/visitor-detail.component.ts` | Visitor profile view     |
| `src/lib/components/visitor-filter/visitor-filter.component.ts` | Filter controls          |
| `src/lib/services/visitors.service.ts`                          | Visitor data and API     |
| `src/lib/services/visitor-selection.service.ts`                 | Selection tracking       |
| `src/index.ts`                                                  | Public API exports       |

## Performance Considerations

- **Large Visitor Lists**: Implement virtual scrolling for 1000+ visitors
- **Filtering**: Debounce filter input to avoid excessive API calls
- **Change Detection**: Use `ChangeDetectionStrategy.OnPush` everywhere
- **Memory**: Unsubscribe from observables in component cleanup

## Debugging

**Visitors Not Loading**:

- Check browser network tab for API requests
- Verify API endpoint in environment configuration
- Check browser console for CORS errors

**Filter Not Working**:

- Verify filter parameters are sent correctly
- Check API response format matches expected type
- Use Redux DevTools to inspect filter state

**Real-time Updates Not Appearing**:

- Verify WebSocket connection is active
- Check that subscription is to correct channel
- Verify server is sending visitor update events

## Complex Filtering Example

```typescript
// Advanced filtering with multiple criteria
applyComplexFilter(criteria: VisitorFilterCriteria): void {
  const filter: VisitorFilter = {
    location: criteria.location,
    device: criteria.deviceType,
    behavior: {
      pageViews: criteria.minPageViews,
      timeOnSite: criteria.minDuration,
      customEvents: criteria.events,
    },
    dateRange: {
      start: criteria.startDate,
      end: criteria.endDate,
    },
  };

  this.visitorsService.applyFilter(filter).subscribe({
    next: (visitors) => this.filteredVisitors.set(visitors),
    error: (err) => this.handleFilterError(err),
  });
}
```

## Related Features

- **Inbox** (`libs/chat/features/inbox`) - Start conversations
- **Contacts** (`libs/chat/features/contacts`) - Manage visitor contacts
- **Chat Data Access** (`libs/chat/data-access`) - API communication

## Common Workflows

### Starting a Conversation with a Visitor

1. View visitor in list
2. Click "Start Conversation" or double-click visitor
3. Route to Inbox with pre-selected conversation
4. Load conversation history if exists

### Filtering Complex Visitor Segments

1. Click filter icon in header
2. Select multiple filter criteria
3. System applies filters server-side
4. Results update in real-time

### Monitoring Visitor Activity

1. Visitor status shows active/inactive with timestamp
2. Session duration auto-updates
3. Page changes reflected in "Current Page" field
4. Activity events appear in timeline

## See Also

- [Root AGENTS.md](../../../../AGENTS.md) - General guidelines
- [Inbox Feature](../inbox/AGENTS.md) - Conversation management
- [Chat Data Access](../../../../libs/chat/data-access/) - API documentation
- [Shared UI](../../../../libs/shared/ui/) - Component library
- [TypeScript Guidelines](../../../../.claude/rules/typescript.md) - Type definitions
