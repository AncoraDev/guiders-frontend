# AGENTS.md - Auth: Login Feature

**Parent Documentation**: [`../../AGENTS.md` (Root)](../../../../AGENTS.md)

## Overview

The login feature handles user authentication and session initialization for Guiders Frontend. This feature is responsible for OAuth 2.0 PKCE flow integration and session management.

## Feature Structure

```
libs/auth/features/login/
├── src/
│   ├── lib/
│   │   ├── components/          # Login UI components
│   │   ├── services/            # Login logic services
│   │   └── routes/              # Routing configuration
│   └── index.ts                 # Public API
└── project.json
```

## Key Components & Services

- **LoginComponent** - Main login page with OAuth flow handling
- **SessionService** - Session state and authentication persistence
- **AuthGuard** - Route protection for authenticated areas

## Development Commands

```bash
# Serve auth login in context
npm run serve                    # Console app includes login at /login

# Test login feature
nx test auth-login              # Unit tests
nx test auth-login --testFile=login.component.spec.ts

# Lint login feature
nx lint auth-login
nx lint auth-login -- --fix
```

## Common Tasks

### Modifying OAuth Flow

- Update OAuth endpoints in environment configuration
- Modify PKCE challenge generation if needed
- Test with `npm run serve:mock` for mock data

### Updating Login UI

- Components are standalone Angular components
- Use signals for state management
- Follow BEM naming for SCSS classes
- Import UI components from `@guiders-frontend/shared/ui/*`

### Handling Authentication Errors

- Use `catchError` operator in observables
- Log authentication failures appropriately
- Redirect to login on 401/403 responses

## Architecture Rules

- `login` (type: feature) can import from:

  - `@guiders-frontend/shared/ui/*` (UI components)
  - `@guiders-frontend/shared/util/*` (utilities)
  - `@guiders-frontend/auth/data-access/*` (session service)
  - `@guiders-frontend/shared/types/*` (types)

- `login` (type: feature) CANNOT import from:
  - `@guiders-frontend/chat/*` (other domains)
  - `@guiders-frontend/admin/*` (other domains)

## Testing Guidelines

```typescript
// Login component test example
import { LoginComponent } from './login.component';
import { SessionService } from '@guiders-frontend/auth/data-access/session';

describe('LoginComponent', () => {
  it('should navigate after successful authentication', () => {
    // Test OAuth callback handling
    // Test session persistence
  });
});
```

## Key Files to Know

| File                                          | Purpose                       |
| --------------------------------------------- | ----------------------------- |
| `src/lib/components/login/login.component.ts` | Main login UI component       |
| `src/lib/services/login.service.ts`           | OAuth flow logic              |
| `src/lib/routes/login.routes.ts`              | Feature routing configuration |
| `src/index.ts`                                | Public API exports            |

## Performance Considerations

- **OAuth Flow**: Minimize network round-trips during authentication
- **Token Storage**: Store tokens securely (not localStorage for sensitive data)
- **Session Cache**: Cache session state to avoid repeated API calls
- **Change Detection**: Use `ChangeDetectionStrategy.OnPush` on login component
- **Memory**: Clean up subscriptions in components on logout

## Debugging

**OAuth Flow Issues**:

- Check browser console for PKCE token errors
- Verify environment API URLs in `environment.ts`
- Ensure `withCredentials: true` is set in HTTP requests

**Session Persistence**:

- Check localStorage for session tokens
- Verify SessionService initialization on app bootstrap
- Check network tab for failed authentication requests

## Commercial presence (after login)

Console boot does **not** call `presenceService.connect()`. Agents stay offline until they use the Atención toggle (`guiders-status-selector` → `CommercialPresenceService.connect()` / `disconnect()`). See root `AGENTS.md` Auth notes.

## Related Features

- **Admin Dashboard** (`libs/admin/features/dashboard`) - Admin authentication
- **Session Management** (`libs/auth/data-access/session`) - Global session service
- **Commercial Presence** (`libs/auth/data-access/commercial-presence`) - Manual online/offline

## See Also

- [Root AGENTS.md](../../../../AGENTS.md) - General guidelines
- [Shared UI Components](../../../../libs/shared/ui/) - Available components
- [TypeScript Guidelines](../../../../.claude/rules/typescript.md) - Type safety rules
