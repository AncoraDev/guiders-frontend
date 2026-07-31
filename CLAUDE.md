# CLAUDE.md

This documentation provides comprehensive guides for working with the guiders-frontend project using Claude Code (claude.ai/code).

## Table of Contents

- [Quick Start](#quick-start)
- [Development Commands](#development-commands)
- [Project Architecture](#project-architecture)
- [Architecture Rules](#architecture-rules)
- [Angular Patterns](#angular-patterns)
- [Code Generation](#code-generation)
- [Design System](#design-system)
- [Project-Specific Patterns](#project-specific-patterns) ⭐
- [Common Tasks](#common-tasks)
- [Testing](#testing)
- [Important References](#important-references)

---

## Quick Start

```bash
# Install dependencies
npm install

# Start Console (port 4200)
npm run serve

# Start Admin (port 4201)
npm run serve:admin

# Run tests
npm run test

# View dependency graph
nx graph
```

---

## Development Commands

### Applications

| Command | Description | Port |
|---------|-------------|------|
| `npm run serve` | Console app (development) | 4200 |
| `npm run serve:admin` | Admin app (development) | 4201 |
| `npm run dev` | Console with hot reload | 4200 |
| `npm run dev:admin` | Admin with hot reload | 4201 |
| `npm run serve:mock` | Console with mock data | 4200 |

**Mock Data**: Use `VITE_USE_MOCK_DATA=true` for development without backend.

### Affected Commands (CI/CD)

```bash
npm run affected:build    # Build only affected projects
npm run affected:test     # Test only affected projects
npm run affected:lint     # Lint only affected projects
npm run affected:e2e      # E2E only affected projects
```

### Build

```bash
npm run build:all      # Build both apps in parallel
npm run build:prod     # Production builds
npm run build:staging  # Staging builds (pre-production)
nx build console       # Build console only
nx build admin         # Build admin only
```

**Available configurations**: `development`, `production`, `staging`

### Testing

```bash
npm run test           # Tests for all projects (parallel)
npm run test:coverage  # Tests with coverage for CI
npm run e2e            # E2E tests for all apps
nx test {project}      # Test specific project
nx e2e console-e2e     # E2E for console
```

### Linting

```bash
npm run lint           # Lint all projects
npm run lint:fix       # Lint with auto-fix
nx lint {project}      # Lint specific project
```

### Nx Commands

```bash
nx graph                    # Visualize dependencies
nx affected -t build        # Build only affected projects
nx affected -t test         # Test only affected projects
nx affected -t lint         # Lint only affected projects
nx show projects            # List all projects
nx show project {name}      # Project details
```

---

## Project Architecture

### Tech Stack

- **Framework**: Angular 20 (standalone components)
- **Monorepo**: Nx 21.4.1
- **Build**: Vite 6
- **Testing**: Vitest 3 (unit) + Playwright (E2E)
- **Styles**: SCSS + Design Tokens
- **Linting**: ESLint 9

### Workspace Structure

```
guiders-frontend/
├── apps/
│   ├── admin/              # Administration dashboard (4201)
│   ├── admin-e2e/          # E2E tests admin
│   ├── console/            # Operator console (4200)
│   └── console-e2e/        # E2E tests console
├── libs/
│   ├── auth/               # Authentication and session
│   │   ├── features/       # Login, guards
│   │   ├── ui/             # User avatar, etc.
│   │   └── data-access/    # Session service
│   ├── chat/               # Conversations
│   │   ├── features/       # Inbox, conversation
│   │   ├── ui/             # Message bubble, visitor card
│   │   └── data-access/    # Visitors, messages, websocket
│   ├── analytics/          # Metrics and reports
│   ├── admin/              # Administration
│   └── shared/             # Shared
│       ├── types/          # TypeScript interfaces
│       ├── design-tokens/  # SCSS variables
│       └── ui/             # UI components (badge, button, etc.)
└── .claude/
    └── rules/              # Architecture rules
```

### Domain-Driven Design (DDD)

The project is organized by **business domains**:

| Domain | Responsibility | Examples |
|---------|----------------|----------|
| `auth` | Authentication and session | Login, guards, session service |
| `chat` | Conversations and messages | Inbox, visitor card, websocket |
| `analytics` | Metrics and reports | Dashboard, charts |
| `admin` | System administration | Settings, integrations |
| `shared` | Cross-domain resources | Types, design tokens, UI components |

### Library Types

```
libs/{domain}/{type}/{name}

Types:
- features/      → Smart components with routing
- ui/            → Presentational components (guiders-*)
- data-access/   → HTTP services
- util/          → Utilities and helpers
```

**Example**:
- `libs/chat/features/inbox` → Feature with routing
- `libs/chat/ui/visitor-card` → Presentational UI component
- `libs/chat/data-access/visitors-data-service` → HTTP service

### Import Paths

All imports use **TypeScript aliases** mapped in `tsconfig.base.json`:

```typescript
// ✅ Correct
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { Badge } from '@guiders-frontend/shared/ui/badge';
import { VisitorCard } from '@guiders-frontend/chat/ui/visitor-card';

// ❌ Incorrect - Don't use relative paths between libs
import { Badge } from '../../../shared/ui/badge/src/lib/badge';
```

---

## Architecture Rules

🎯 **This project follows strict architecture rules documented in `.claude/rules/`**

### Rules Structure

```
.claude/rules/
├── index.md                      # Overview
├── angular/
│   ├── components.md             # Standalone components with signals
│   ├── services.md               # Services with inject()
│   ├── guards-interceptors.md    # Functional guards
│   └── directives-pipes.md       # Directives and pipes
├── architecture/
│   ├── library-types.md          # Features, UI, Data Access
│   ├── domain-structure.md       # DDD organization
│   ├── dependency-rules.md       # Tags and boundaries
│   └── module-resolution.md      # Path mappings
├── state-management/
│   ├── behavior-subject-pattern.md
│   ├── http-services.md
│   └── websocket-integration.md
├── design-system/
│   ├── design-tokens.md
│   ├── component-standards.md
│   └── ui-patterns.md
├── testing/
│   ├── vitest-patterns.md
│   ├── testing-services.md
│   └── playwright-e2e.md
└── nx/
    ├── workspace-structure.md
    ├── generators.md
    └── commands.md
```

### Fundamental Principles

#### 1. Standalone Components (No NgModules)

```typescript
@Component({
  selector: 'guiders-badge',
  standalone: true,           // ✅ Always standalone
  imports: [CommonModule],    // ✅ Direct imports
  changeDetection: ChangeDetectionStrategy.OnPush, // ✅ OnPush
})
export class Badge { }
```

#### 2. Signal Inputs (No @Input decorators)

```typescript
export class Badge {
  // ✅ Signal inputs
  readonly variant = input<BadgeVariant>('default');
  readonly text = input<string>('');

  // ✅ Computed values
  readonly classes = computed(() => ({
    'badge': true,
    [`badge--${this.variant()}`]: true,
  }));

  // ✅ Outputs
  readonly clicked = output<void>();
}
```

#### 3. Function Injection (No constructor injection)

```typescript
export class MyComponent {
  // ✅ Function injection
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // ❌ Avoid constructor injection
  // constructor(private http: HttpClient) { }
}
```

#### 4. Dependency Enforcement (Tags)

```json
// project.json
{
  "tags": ["scope:chat", "type:feature"]
}
```

**Rules**:
- `type:feature` can import `ui`, `data-access`, `util`
- `type:ui` can only import other `ui` and `util`
- `type:data-access` can only import other `data-access` and `util`
- `scope:shared` can be imported by all
- Other domains should NOT import from each other directly

### When to Consult the Rules

✅ **ALWAYS consult the rules before**:
- Creating new components or services
- Modifying existing architecture
- Implementing new features
- Performing major refactorings
- Changing dependencies between libraries

📚 **Main rule**: [.claude/rules/index.md](.claude/rules/index.md)

---

## Angular Patterns

### Components

```typescript
import { Component, computed, input, output, inject } from '@angular/core';

@Component({
  selector: 'guiders-visitor-card',
  standalone: true,
  imports: [CommonModule, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visitor-card.html',
  styleUrl: './visitor-card.scss',
})
export class VisitorCard {
  // Inputs
  readonly visitor = input.required<Visitor>();
  readonly selected = input<boolean>(false);

  // Computed
  readonly statusColor = computed(() => {
    const status = this.visitor().status;
    return status === 'active' ? 'success' : 'default';
  });

  // Outputs
  readonly clicked = output<Visitor>();

  // Methods
  onClick(): void {
    this.clicked.emit(this.visitor());
  }
}
```

### HTTP Services

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { ENVIRONMENT_TOKEN } from '@guiders-frontend/shared/types';

@Injectable({ providedIn: 'root' })
export class VisitorsDataService {
  private readonly http = inject(HttpClient);
  private readonly environment = inject(ENVIRONMENT_TOKEN);

  private visitorsCache$?: Observable<Visitor[]>;

  getVisitors(): Observable<Visitor[]> {
    if (!this.visitorsCache$) {
      this.visitorsCache$ = this.http.get<Visitor[]>(
        `${this.environment.api.baseUrl}/visitors`,
        { withCredentials: true }  // ✅ Always include
      ).pipe(
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.visitorsCache$;
  }
}
```

### Guards

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '@guiders-frontend/auth/data-access/session';

export const authGuard: CanActivateFn = () => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  return sessionService.ensureSession$().pipe(
    map(user => !!user),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};
```

### Lazy Routes

```typescript
// app.routes.ts
export const routes: Route[] = [
  {
    path: 'inbox',
    loadChildren: () =>
      import('@guiders-frontend/chat/features/inbox').then(m => m.routes),
    canActivate: [authGuard],
  },
];
```

---

## Code Generation

### Features

```bash
nx g @nx/angular:lib inbox \
  --directory=libs/chat/features/inbox \
  --tags=scope:chat,type:feature
```

### UI Components

```bash
# With guiders- prefix
nx g @nx/angular:lib badge \
  --directory=libs/shared/ui/badge \
  --tags=scope:shared,type:ui \
  --prefix=guiders
```

### Data Access Services

```bash
nx g @nx/angular:lib visitors-data-service \
  --directory=libs/chat/data-access/visitors-data-service \
  --tags=scope:chat,type:data-access
```

### Component in Existing Library

```bash
nx g @nx/angular:component visitor-card \
  --project=chat-ui-visitor-card \
  --changeDetection=OnPush
```

### Defaults (nx.json)

The workspace has **defaults** configured for:
- `standalone: true`
- `style: scss`
- `changeDetection: OnPush`
- `unitTestRunner: vitest`

Therefore, many options are automatic.

---

## Design System

### Design Tokens

Use SCSS tokens for **all** styles:

```scss
@use '@guiders-frontend/shared/design-tokens' as tokens;

.my-component {
  // Colors
  background: tokens.$color-surface-primary;
  color: tokens.$color-text-primary;
  border-color: tokens.$color-border-subtle;

  // Spacing (4px scale)
  padding: tokens.$spacing-md;    // 16px
  margin: tokens.$spacing-sm;     // 8px
  gap: tokens.$spacing-lg;        // 24px

  // Typography
  font-family: tokens.$font-family-ui;
  font-size: tokens.$font-size-base;   // 13px
  font-weight: tokens.$font-weight-medium;

  // Border radius
  border-radius: tokens.$border-radius-md;

  // Shadows
  box-shadow: tokens.$shadow-md;

  // Transitions
  transition: tokens.$transition-normal;
}
```

### Mixins

```scss
.my-button {
  @include tokens.button-base;

  &:focus-visible {
    @include tokens.focus-ring;
  }
}

.title {
  @include tokens.typography('heading-2xl');
}
```

### BEM Naming

```scss
// Block
.guiders-card { }

// Element
.guiders-card__header { }
.guiders-card__body { }

// Modifier
.guiders-card--elevated { }
.guiders-card--compact { }
```

---

## Project-Specific Patterns

### Selector Prefixes

The project uses **TWO different prefixes** depending on component type:

| Prefix | Usage | Examples |
|---------|-----|----------|
| `guiders-` | Shared UI components | `guiders-badge`, `guiders-button`, `guiders-sidebar` |
| `lib-` | Specific features | `lib-inbox`, `lib-visitors`, `lib-dashboard` |

**Rule**:
- Components in `libs/shared/ui/` → `guiders-`
- Components in `libs/{domain}/features/` → `lib-`
- Specify in `project.json`: `"prefix": "guiders"` or `"prefix": "lib"`

### Environment Configuration

#### Environment Variables per App

```typescript
// Console (apps/console/src/environments/)
interface Environment {
  production: boolean;
  auth: { domain: string; clientId: string; audience: string };
  api: {
    baseUrl: string;
    wsUrl: string;  // ⚠️ Separate WebSocket URL (without /api)
  };
  adminUrl: string;  // URL for app switcher
}

// Admin (apps/admin/src/environments/)
interface Environment {
  production: boolean;
  auth: { domain: string; clientId: string; audience: string };
  api: {
    baseUrl: string;
    wsUrl: string;
  };
  consoleUrl?: string;  // URL to return to console
}
```

**Critical**: WebSocket uses base URL **without** `/api`:
```typescript
api: {
  baseUrl: 'http://localhost:3000/api',  // HTTP requests
  wsUrl: 'http://localhost:3000'         // WebSocket ⚠️
}
```

#### Configuration Files

Three environments per application:
- `environment.ts` → Development
- `environment.staging.ts` → Staging (pre-production)
- `environment.prod.ts` → Production

### Application Initialization (APP_INITIALIZER)

The project uses **complex initialization** in `app.config.ts` with two providers:

#### 1. initializeApp() - Main Orchestration
```typescript
// apps/console/src/app/app.config.ts (~280 lines)
function initializeApp(): () => Observable<void> {
  return () => {
    // 1. Load user
    // 2. Load white-label theme
    // 3. Connect commercial presence
    // 4. Start status polling
    // 5. Connect WebSocket (with 3s timeout)
    // 6. Join WebSocket rooms
    // 7. Load chats and unread counters
    // 8. Detailed logging of each step
  };
}
```

#### 2. initializeSessionGuardian() - Session Protection
```typescript
function initializeSessionGuardian(): () => void {
  return () => {
    // Automatic refresh on inactivity
    // Session expiration
    // 401 interceptor
  };
}
```

**Important**:
- The app **DOES NOT start** until completing these initializations
- Handles errors **without throwing exceptions** (doesn't block bootstrap)
- Extensive logging with timestamps for debugging

### State Management: Signals vs BehaviorSubject

The project **mixes two patterns** depending on use case:

#### Use Signals for:
```typescript
// Simple synchronous state
private readonly _config = signal<Config | null>(null);
private readonly _loading = signal<boolean>(false);

// Computed values
readonly isReady = computed(() =>
  this._config() !== null && !this._loading()
);
```

#### Use BehaviorSubject for:
```typescript
// State consumed as Observable
private readonly _chats = new BehaviorSubject<Chat[]>([]);
readonly chats$ = this._chats.asObservable();

// Complex async operations with RxJS
readonly filteredChats$ = this.chats$.pipe(
  switchMap(chats => this.applyFilters(chats)),
  shareReplay(1)
);
```

**General rule**:
- Signals → Synchronous state, template integration
- BehaviorSubject → Data streams, RxJS integration

### Data Access Services as Libraries

⚠️ **Different from standard projects**: Each service is a **complete library** in Nx:

```
libs/chat/data-access/
├── chat-service/              # Independent library
│   ├── src/
│   │   ├── lib/
│   │   │   └── chat.service.ts
│   │   └── index.ts
│   ├── project.json
│   └── tsconfig.json
├── visitors-data-service/     # Another independent library
│   ├── src/
│   └── project.json
└── websocket-service/         # Another one
```

**Implication**:
- Generate service = generate complete library
- Automatic path mapping: `@guiders-frontend/chat/data-access/chat-service`
- Independent testing per service

### Path Mappings: Inconsistent Convention

⚠️ The project has **two patterns** of path mappings:

#### Pattern 1: With complete sub-routes
```json
{
  "@guiders-frontend/chat/features/inbox": ["libs/chat/features/inbox/src/index.ts"],
  "@guiders-frontend/auth/data-access/session": ["libs/auth/data-access/session/src/index.ts"]
}
```

#### Pattern 2: Flat (without domain)
```json
{
  "@guiders-frontend/badge": ["libs/shared/ui/badge/src/index.ts"],
  "@guiders-frontend/button": ["libs/shared/ui/button/src/index.ts"],
  "@guiders-frontend/dashboard": ["libs/admin/features/dashboard/src/index.ts"]
}
```

**Observed rule** (not strict):
- Libraries in `shared/ui/` → Flat
- Rest → With complete sub-routes

**Generation**: Nx automatically adds path mapping when creating a library.

### ESLint: Flat Config (ESLint 9+)

⚠️ The project uses **flat config**, not `.eslintrc.json`:

```javascript
// eslint.config.mjs
export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': ['error', { /* ... */ }]
    }
  }
];
```

**Don't use** `.eslintrc.json` or legacy configuration.

### Auto-configured Nx Plugins

The project uses **automatic plugins** in `nx.json`:

```json
{
  "plugins": [
    { "plugin": "@nx/playwright/plugin", "options": { "targetName": "e2e" } },
    { "plugin": "@nx/eslint/plugin", "options": { "targetName": "lint" } }
  ]
}
```

**Implication**:
- `e2e` and `lint` targets are created **automatically** for each project
- Don't configure manually in `project.json` unless specific need

### Service Wrapper Pattern

Some services act as **facades** that orchestrate multiple operations:

```typescript
@Injectable({ providedIn: 'root' })
export class ChatFacadeService {
  // Injects multiple services
  private readonly chatService = inject(ChatService);
  private readonly websocketService = inject(WebSocketService);
  private readonly unreadService = inject(UnreadMessagesService);

  // Exposes complex operations
  async initializeChat(chatId: string): Promise<void> {
    await this.chatService.loadChat(chatId);
    this.websocketService.joinRoom(`chat:${chatId}`);
    await this.unreadService.refreshUnreadCount(chatId);
  }
}
```

**Non-explicit pattern**: There is no formal separation between "facade" and "base service".

---

## Common Tasks

### 1. Create a New Feature

```bash
# 1. Generate library
nx g @nx/angular:lib my-feature \
  --directory=libs/chat/features/my-feature \
  --tags=scope:chat,type:feature

# 2. Create routes (my-feature.routes.ts)
export const routes: Route[] = [
  {
    path: '',
    component: MyFeature,
  },
];

# 3. Export in index.ts
export { routes } from './lib/my-feature.routes';

# 4. Add to app.routes.ts
{
  path: 'my-feature',
  loadChildren: () => import('@guiders-frontend/chat/features/my-feature').then(m => m.routes),
  canActivate: [authGuard],
}
```

### 2. Create Reusable UI Component

```bash
# 1. Generate library
nx g @nx/angular:lib my-component \
  --directory=libs/shared/ui/my-component \
  --tags=scope:shared,type:ui \
  --prefix=guiders

# 2. Implement with signals
# 3. Export in index.ts
export { MyComponent } from './lib/my-component/my-component';

# 4. Import where needed
import { MyComponent } from '@guiders-frontend/shared/ui/my-component';
```

### 3. Add HTTP Service

```bash
# 1. Generate library
nx g @nx/angular:lib my-data-service \
  --directory=libs/chat/data-access/my-data-service \
  --tags=scope:chat,type:data-access

# 2. Create service
nx g @nx/angular:service my-data \
  --project=chat-data-access-my-data-service

# 3. Implement with HttpClient
@Injectable({ providedIn: 'root' })
export class MyDataService {
  private readonly http = inject(HttpClient);
  // ...
}

# 4. Export in index.ts
export { MyDataService } from './lib/my-data.service';
```

### 4. Connect WebSocket

```typescript
// 1. Inject service
private readonly ws = inject(WebSocketService);

// 2. Connect in ngOnInit
ngOnInit(): void {
  this.ws.connect();
}

// 3. Listen to events
this.ws.on<Message>('message:new')
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(msg => {
    // Handle message
  });

// 4. Emit events
this.ws.emit('chat:send-message', { chatId, content });
```

### 5. Mock API for Tests

```typescript
// In Vitest
const mockVisitors = [/* ... */];
const serviceSpy = jasmine.createSpyObj('Service', ['getVisitors']);
serviceSpy.getVisitors.and.returnValue(of(mockVisitors));

// In Playwright
await page.route('**/api/visitors', async route => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify(mockVisitors),
  });
});
```

---

## Testing

### Unit Tests (Vitest)

```typescript
describe('Badge', () => {
  let fixture: ComponentFixture<Badge>;
  let component: Badge;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Badge],
    }).compileComponents();

    fixture = TestBed.createComponent(Badge);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render text', () => {
    fixture.componentRef.setInput('text', 'Test');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Test');
  });
});
```

### E2E Tests (Playwright)

```typescript
test.describe('Visitors', () => {
  test('should display list', async ({ page }) => {
    await page.goto('/visitors');

    await expect(page.getByRole('heading', { name: 'Visitors' }))
      .toBeVisible();

    await expect(page.locator('.visitor-card'))
      .toHaveCount(10);
  });
});
```

### Running Tests

```bash
# Unit tests
npm run test                    # All
nx test chat-features-inbox     # Specific project

# E2E tests
npm run e2e                     # All
nx e2e console-e2e              # Specific app
nx e2e console-e2e --ui         # With Playwright UI
```

---

## Important References

📚 **Documentation index**: [`docs/README.md`](docs/README.md)

### Key Files

| File | Purpose |
|---------|-----------|
| `docs/README.md` | Índice único de documentación |
| `tsconfig.base.json` | Path mappings (`@guiders-frontend/*`) |
| `nx.json` | Nx configuration, generator defaults |
| `.eslintrc.json` | Linting rules and module boundaries |
| `apps/console/src/app/app.routes.ts` | Routes with lazy loading |
| `libs/shared/design-tokens/` | Design tokens (colors, spacing) |

### Code Examples

| Pattern | Location |
|--------|-----------|
| UI Component | `libs/shared/ui/badge/` |
| Feature with routes | `libs/chat/features/inbox/` |
| HTTP Service | `libs/chat/data-access/visitors-data-service/` |
| Functional guard | `libs/auth/features/login/src/lib/auth.guard.ts` |
| WebSocket | `libs/chat/data-access/websocket-service/` |

### External Documentation

- [Nx Documentation](https://nx.dev)
- [Angular Signals](https://angular.dev/guide/signals)
- [Vitest](https://vitest.dev)
- [Playwright](https://playwright.dev)

---

## Important Notes

### ⚠️ Anti-patterns to Avoid

- ❌ NgModules (use standalone)
- ❌ `@Input()` / `@Output()` decorators (use signals)
- ❌ Constructor injection (use `inject()`)
- ❌ Relative imports between libs (use `@guiders-frontend/*`)
- ❌ `ChangeDetectionStrategy.Default` (use `OnPush`)
- ❌ Hardcoding colors/spacing (use design tokens)
- ❌ Business logic in UI components

### ✅ Best Practices

- ✅ Always consult `.claude/rules/` before major changes
- ✅ Run `nx graph` to view dependencies
- ✅ Use `nx affected` in CI to optimize builds
- ✅ Barrel exports (`src/index.ts`) for each library
- ✅ Unit tests for all business logic
- ✅ E2E tests for critical user flows
- ✅ `withCredentials: true` in all HTTP requests

---

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

---

**Language**: Always respond in English 🇬🇧
