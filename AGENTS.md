# AGENTS.md - Guiders Frontend

Instructions for AI coding agents working in this Angular 20 + Nx 21 monorepo.

## Build/Lint/Test Commands

### Development Servers

```bash
npm run serve          # Console app on port 4200
npm run serve:admin    # Admin app on port 4201
npm run serve:mock     # Console with mock data (VITE_USE_MOCK_DATA=true)
```

### Build

```bash
npm run build          # Build console
npm run build:admin    # Build admin
npm run build:all      # Build both apps in parallel
npm run build:prod     # Production builds
nx build <project>     # Build specific project
```

### Linting

```bash
npm run lint           # Lint all projects
npm run lint:fix       # Lint with auto-fix
nx lint <project>      # Lint specific project
```

### Testing (Vitest)

```bash
npm run test                              # Run all tests
npm run test:coverage                     # Tests with coverage (CI)
nx test <project>                         # Test specific project
nx test <project> --testFile=<filename>   # Run single test file
nx test <project> -- --grep "<pattern>"   # Run tests matching pattern
```

### E2E Testing (Playwright)

```bash
npm run e2e                  # All E2E tests
nx e2e console-e2e           # Console E2E only
nx e2e admin-e2e             # Admin E2E only
nx e2e <project> --ui        # Open Playwright UI
```

### Nx Utilities

```bash
nx graph                     # Visualize dependencies
nx affected -t build         # Build only affected projects
nx affected -t test          # Test only affected projects
nx show projects             # List all projects
nx show project <name>       # Show project details
```

## Project Structure

```
apps/
├── admin/              # Administration dashboard (port 4201)
├── admin-e2e/          # Playwright E2E for admin
├── console/            # Operator console (port 4200)
└── console-e2e/        # Playwright E2E for console

libs/{domain}/{type}/{name}/
├── auth/               # Authentication domain
├── chat/               # Conversations domain
├── analytics/          # Metrics domain
├── admin/              # Administration domain
└── shared/             # Cross-domain resources
    ├── types/          # TypeScript interfaces
    ├── design-tokens/  # SCSS variables
    └── ui/             # Shared UI components
```

### Library Types

- `features/` - Smart components with routing (tag: `type:feature`)
- `ui/` - Presentational components (tag: `type:ui`)
- `data-access/` - HTTP services (tag: `type:data-access`)
- `util/` - Utilities and helpers (tag: `type:util`)

## Code Style Guidelines

### Imports

```typescript
// ✅ Use path aliases for cross-library imports
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { Badge } from '@guiders-frontend/shared/ui/badge';

// ❌ Never use relative paths between libraries
import { Badge } from '../../../shared/ui/badge/src/lib/badge';
```

### Formatting

- **Prettier**: Single quotes (`'`), 2-space indent
- **EditorConfig**: UTF-8, space indent, final newline
- **SCSS**: BEM naming (`.component__element--modifier`)

### TypeScript

- `moduleResolution: "bundler"`, `target: "es2022"`
- Strict mode enabled
- All types in `@guiders-frontend/shared/types`

### Angular Components

```typescript
@Component({
  selector: 'guiders-my-component', // Prefix: guiders-* (UI) or lib-* (features)
  standalone: true, // Always standalone, no NgModules
  imports: [CommonModule], // Direct imports
  changeDetection: ChangeDetectionStrategy.OnPush, // Always OnPush
})
export class MyComponent {
  // Signal inputs (not @Input decorators)
  readonly variant = input<string>('default');
  readonly required = input.required<string>();

  // Computed values
  readonly classes = computed(() => `variant-${this.variant()}`);

  // Outputs
  readonly clicked = output<void>();

  // Dependency injection (not constructor injection)
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
}
```

### HTTP Services

```typescript
@Injectable({ providedIn: 'root' })
export class MyDataService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  getData(): Observable<Data[]> {
    return this.http
      .get<Data[]>(
        `${this.environment.api.baseUrl}/endpoint`,
        { withCredentials: true } // Always include
      )
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }
}
```

### State Management

- **Signals**: Simple synchronous state
- **BehaviorSubject + Observable**: Async streams, RxJS integration

```typescript
private readonly _data = new BehaviorSubject<Data[]>([]);
readonly data$ = this._data.asObservable();
```

### Design Tokens (SCSS)

```scss
@use '@guiders-frontend/shared/design-tokens' as tokens;

.component {
  padding: tokens.$spacing-md; // 16px (4px scale)
  color: tokens.$color-text-primary;
  font-size: tokens.$font-size-base; // 13px
  border-radius: tokens.$border-radius-md;
  transition: tokens.$transition-normal;
}
```

### Naming Conventions

| Type         | Convention                  | Example                         |
| ------------ | --------------------------- | ------------------------------- |
| Components   | PascalCase                  | `VisitorCard`                   |
| Services     | PascalCase + Service suffix | `ChatService`                   |
| Interfaces   | PascalCase                  | `Visitor`, `ChatMessage`        |
| Files        | kebab-case                  | `visitor-card.ts`               |
| SCSS classes | BEM                         | `.guiders-card__header--active` |
| Selectors    | kebab-case with prefix      | `guiders-badge`, `lib-inbox`    |

### Error Handling

- HTTP errors: Use RxJS `catchError` operator
- Guards: Return `of(false)` and redirect on auth failure
- Services: Log errors, don't throw in initialization

## Project Tags and Boundaries

```json
{
  "tags": ["scope:chat", "type:feature"]
}
```

**Rules**:

- `type:feature` can import `ui`, `data-access`, `util`
- `type:ui` can only import other `ui` and `util`
- `scope:shared` can be imported by all domains

## Key Configuration Files

| File                 | Purpose                              |
| -------------------- | ------------------------------------ |
| `tsconfig.base.json` | Path aliases (`@guiders-frontend/*`) |
| `nx.json`            | Nx config, generator defaults        |
| `eslint.config.mjs`  | ESLint 9 flat config                 |
| `.prettierrc`        | Prettier config                      |
| `.claude/rules/`     | Detailed architecture rules          |

## Feature Documentation

Each feature has its own `AGENTS.md` with specific guidelines. Use these as your primary reference when working on each feature:

### Auth Domain

- **[Login Feature](libs/auth/features/login/AGENTS.md)** - OAuth 2.0 authentication, PKCE flow, session management

**Commercial presence (Console):** Login leaves the agent **Desconectado**. Toggle Conectado/Desconectado lives in **Atención** (between title and queue menu) via `guiders-status-selector` (`CommercialPresenceService`). No auto-connect / auto-reconnect. Logout and `beforeunload` call `disconnect({ reason })`. Tenant availability for the web is `onlineCount ≥ 1` (SDK `commercialAvailability`).

### Chat Domain

- **[Inbox Feature](libs/chat/features/inbox/AGENTS.md)** - Main messaging interface, conversation management, message handling
- **[Visitors Feature](libs/chat/features/visitors/AGENTS.md)** - Active visitor list, filtering, visitor selection
- **[Contacts Feature](libs/chat/features/contacts/AGENTS.md)** - Contact management, CRM, contact groups
- **[Escalations Feature](libs/chat/features/escalations/AGENTS.md)** - Escalation workflow, SLA tracking, assignment

### Admin Domain

- **[Dashboard Feature](libs/admin/features/dashboard/AGENTS.md)** - System overview, metrics widgets, team monitoring
- **[Users Feature](libs/admin/features/users/AGENTS.md)** - User management, roles, permissions
- **[AI Config Feature](libs/admin/features/ai-config/AGENTS.md)** - AI model selection, prompt customization, behavior tuning
- **[Integrations Feature](libs/admin/features/integrations/AGENTS.md)** - OAuth setup, API key management, webhook configuration
- **[White Label Config Feature](libs/admin/features/white-label-config/AGENTS.md)** - Branding, color schemes, custom domains

### Analytics Domain

- **[Admin Dashboard Feature](libs/analytics/features/admin-dashboard/AGENTS.md)** - Metrics, reporting, trend analysis, performance tracking

## How to Use This Documentation System

1. **Start with this file** for general guidelines, build commands, and code style
2. **Go to feature AGENTS.md** when working on a specific feature (inbox, dashboard, etc.)
3. **Check feature-specific commands** for testing, linting, and debugging
4. **Follow feature-specific examples** for component structure and service patterns
5. **Use architecture rules** section to understand import boundaries

### Quick Feature Navigation

```
Need to work on...                        → Go to...
Messaging & conversations                 → Inbox or Escalations
Visitor management & filtering            → Visitors
Customer contact information              → Contacts
User accounts & permissions               → Users
System overview & metrics                 → Dashboard
AI/ML configuration                       → AI Config
Third-party services                      → Integrations
Branding & white label                    → White Label Config
Performance reporting & analytics         → Admin Dashboard (Analytics)
User authentication                       → Login
```

## QA (Quality Assurance)

When the user asks about QA, testing, or test-related topics, **always use the `qa-testing` skill**.

Load the skill using: `skill(name: "qa-testing")`

This applies when the user asks about:
- Writing tests (unit, integration, E2E)
- Test strategy and patterns
- Debugging test failures
- Test coverage
- Playwright or Vitest configuration
- Any QA-related questions

---

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- When running tasks (build, lint, test, e2e), always prefer `nx` commands over underlying tooling
- Use `nx_workspace` tool to understand workspace architecture
- Use `nx_project_details` tool for specific project analysis
- Use `nx_docs` tool for Nx configuration questions
- Use `nx_workspace` tool to debug project graph errors

<!-- nx configuration end-->
