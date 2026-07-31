# AGENTS-SYSTEM.md - Guiders Frontend Documentation Architecture

**Last Updated**: January 2026

## Overview

This document explains the hierarchical documentation system for AI agents working with Guiders Frontend. The system is organized into two levels:

1. **Root Level**: `AGENTS.md` - General guidelines, project structure, and navigation
2. **Feature Level**: `AGENTS.md` per feature - Detailed guides for each feature module

## Why This System?

**Traditional Approach Problems**:

- Single monolithic `AGENTS.md` becomes unwieldy with 10+ features
- Hard to find feature-specific information
- Difficult to maintain consistency across features
- No context for dependencies between features

**This System Benefits**:

- ✅ Each feature has dedicated documentation
- ✅ Developers quickly find what they need
- ✅ Documentation stays up-to-date with feature code
- ✅ Easy to navigate between features
- ✅ Consistent structure across all features

## Directory Structure

```
guiders-frontend/
├── AGENTS.md                              # Root documentation
├── AGENTS-SYSTEM.md                       # This file
│
├── libs/
│   ├── auth/
│   │   └── features/
│   │       └── login/
│   │           ├── src/
│   │           ├── project.json
│   │           └── AGENTS.md ← Feature-specific guide
│   │
│   ├── chat/
│   │   └── features/
│   │       ├── inbox/
│   │       │   └── AGENTS.md
│   │       ├── visitors/
│   │       │   └── AGENTS.md
│   │       ├── contacts/
│   │       │   └── AGENTS.md
│   │       └── escalations/
│   │           └── AGENTS.md
│   │
│   ├── admin/
│   │   └── features/
│   │       ├── dashboard/
│   │       │   └── AGENTS.md
│   │       ├── users/
│   │       │   └── AGENTS.md
│   │       ├── ai-config/
│   │       │   └── AGENTS.md
│   │       ├── integrations/
│   │       │   └── AGENTS.md
│   │       └── white-label-config/
│   │           └── AGENTS.md
│   │
│   └── analytics/
│       └── features/
│           └── admin-dashboard/
│               └── AGENTS.md
```

## Feature AGENTS.md Structure

Each feature documentation follows this consistent structure:

### 1. Header Section

```markdown
# AGENTS.md - [Domain]: [Feature Name]

**Parent Documentation**: [`../../AGENTS.md` (Root)](../../../../AGENTS.md)

## Overview

Brief description of what this feature does.

## Feature Structure

Visual representation of the directory layout.
```

### 2. Key Components & Services

Lists main components and services in the feature with brief descriptions.

### 3. Development Commands

Feature-specific commands for:

- Serving the app
- Running tests
- Linting
- Building

### 4. Common Tasks

Most frequent operations with code examples.

### 5. Architecture Rules

Explicit rules for what this feature can/cannot import from other features.

### 6. Testing Guidelines

Test examples using the project's testing approach.

### 7. Key Files to Know

Quick reference table of important files.

### 8. Performance Considerations

Notes on optimization strategies.

### 9. Debugging Guide

Common issues and solutions.

### 10. Related Features

Links to other features this one depends on or relates to.

### 11. Common Workflows

Step-by-step user workflows.

### 12. See Also

Links to parent docs and related resources.

## Navigation Pattern

### From Root to Feature

```
AGENTS.md (root)
├── General guidelines (code style, commands, structure)
├── Project structure
└── Feature Links
    └── Click on feature you want to work on
        └── Feature AGENTS.md
            ├── Feature-specific commands
            ├── Common tasks
            ├── Testing examples
            └── Related features (back to root for navigation)
```

### Feature Cross-References

Each feature documentation references:

- **Parent**: Link back to root `AGENTS.md`
- **Related**: Links to other feature AGENTS.md files
- **Dependencies**: Services and libraries this feature depends on

## How AI Agents Should Use This

### When Starting a New Task

1. **Read Root AGENTS.md First**

   - Understand project structure
   - Review code style guidelines
   - Know build/test commands

2. **Identify the Feature**

   - Which domain? (auth, chat, admin, analytics)
   - Which feature? (inbox, users, etc.)

3. **Go to Feature AGENTS.md**

   - Feature-specific setup
   - Common tasks for this feature
   - Testing guidelines
   - Related features

4. **Execute Using Feature Instructions**
   - Use feature-specific commands
   - Follow feature-specific patterns
   - Check architecture rules for imports

### When Debugging

```
Problem with feature?
↓
Check feature AGENTS.md "Debugging" section
↓
Not found?
↓
Check root AGENTS.md for general debugging
↓
Still need help?
↓
Check "Related Features" for dependencies
```

### When Adding New Code

```
Adding code to [Feature]?
↓
Read feature AGENTS.md section: "Architecture Rules"
↓
What can I import?
├── Listed as ✅ → OK to import
└── Listed as ❌ → Find alternative
↓
Follow code style from feature examples
↓
Check testing section for test patterns
```

## Maintaining This System

### Adding a New Feature

1. Create `libs/[domain]/features/[feature-name]/AGENTS.md`
2. Use the standard structure (see Feature AGENTS.md Structure above)
3. Add cross-references from root `AGENTS.md`
4. Add links in related features

### Updating Existing Feature Docs

- Keep structure consistent
- Update commands when they change
- Add new sections for new functionality
- Review and test code examples

### Keeping Documentation Current

- Update when feature significantly changes
- Verify commands still work
- Test code examples
- Fix broken links

## Example Feature Cross-Reference

**Inbox Feature** links to:

- ✅ Root AGENTS.md (parent documentation)
- ✅ Visitors Feature (related - start conversations)
- ✅ Escalations Feature (related - escalate conversations)
- ✅ Contacts Feature (related - contact information)
- ✅ Chat Data Access (dependency)
- ✅ Shared UI (dependency)

These cross-references help agents understand:

- Where to find related functionality
- What features depend on each other
- Where to navigate for related tasks

## Feature Dependency Map

```
Auth Domain
├── Login
    └── Used by: All other features

Chat Domain
├── Inbox
│   ├── Depends on: Visitors, Contacts
│   └── Used by: Escalations
├── Visitors
│   └── Used by: Inbox
├── Contacts
│   └── Used by: Inbox
└── Escalations
    ├── Depends on: Inbox
    └── Related to: Admin Dashboard

Admin Domain
├── Dashboard
│   ├── Depends on: All chat features for metrics
│   └── Related to: Users, Analytics
├── Users
│   └── Used by: All admin features
├── AI Config
│   └── Used by: Inbox (message generation)
├── Integrations
│   └── Can affect: Any feature
└── White Label Config
    └── Used by: All features (branding)

Analytics Domain
└── Admin Dashboard
    ├── Depends on: All chat features
    └── Related to: Admin Dashboard (metrics)
```

## Quick Reference: Using Feature Docs

### I need to work on feature X

1. Go to `libs/[domain]/features/[X]/AGENTS.md`
2. Read "Common Tasks" for typical operations
3. Check "Architecture Rules" before importing
4. Use "Development Commands" section
5. Check "Testing Guidelines" for test patterns

### I need to understand how feature X works

1. Go to `libs/[domain]/features/[X]/AGENTS.md`
2. Read "Overview" for high-level understanding
3. Check "Feature Structure" for file organization
4. Read "Key Components & Services"
5. See "Common Workflows" for typical usage patterns

### I need to debug an issue in feature X

1. Go to `libs/[domain]/features/[X]/AGENTS.md`
2. Jump to "Debugging" section
3. If not found, check root `AGENTS.md`
4. Check "Related Features" if issue might be in dependency

### I need to add a new component to feature X

1. Go to `libs/[domain]/features/[X]/AGENTS.md`
2. Check "Architecture Rules" for allowed imports
3. Look at code examples in "Common Tasks"
4. Follow patterns in "Testing Guidelines"
5. Reference "Key Files to Know" for where to add it

## Linking Convention

All feature AGENTS.md files use relative paths to enable local navigation:

```markdown
# Link from feature up to root

[Root AGENTS.md](../../../../AGENTS.md)

# Link from root to feature

[Login Feature](libs/auth/features/login/AGENTS.md)

# Link from one feature to another

[Visitors Feature](../visitors/AGENTS.md)

# Link to shared resources from feature

[Shared UI](../../../../libs/shared/ui/)
[TypeScript Guidelines](../../../../.claude/rules/typescript.md)
```

These relative links work:

- ✅ In VS Code (Ctrl+Click navigation)
- ✅ In GitHub (clickable links)
- ✅ In any markdown viewer

## Troubleshooting Documentation

### I can't find the feature I need to work on

1. Check root AGENTS.md "Feature Documentation" section
2. Search for feature name in quick navigation table
3. Each domain (Auth, Chat, Admin, Analytics) has its own section

### Links are broken

1. Verify feature exists at the path
2. Check relative path is correct
3. Ensure no typos in folder names
4. Test in VS Code with Ctrl+Click

### Information seems outdated

1. Check "Last Updated" date in feature AGENTS.md
2. Test code examples to verify they work
3. Check git history for recent changes
4. Create issue if documentation needs update

## Future Enhancements

Possible improvements to this system:

- [ ] Add architecture diagrams showing feature relationships
- [ ] Create index of all imports/dependencies
- [ ] Add estimated reading times for each section
- [ ] Create "Getting Started" quick start guides
- [ ] Add video/screenshot examples for complex features
- [ ] Generate dependency graph visualization
- [ ] Create API reference for each feature service

## Contact & Feedback

To improve this documentation system:

1. Test all links in each feature AGENTS.md
2. Verify code examples are current
3. Check for outdated information
4. Suggest improvements to structure
5. Report broken links or missing information

---

**System Version**: 1.0  
**Last Updated**: January 2026  
**Created For**: Guiders Frontend (Angular 20 + Nx 21)
