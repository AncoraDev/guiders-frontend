# Documentación Guiders Frontend

Índice único de la documentación del repositorio. En la raíz solo quedan:

- [`README.md`](../README.md) — workspace Nx
- [`AGENTS.md`](../AGENTS.md) — instrucciones generales para agentes
- [`CLAUDE.md`](../CLAUDE.md) — arquitectura Angular/Nx
- [`CHANGELOG.md`](../CHANGELOG.md) — historial de cambios

Las features tienen además su propio `libs/**/AGENTS.md` (ver [AGENTS.md](../AGENTS.md)).

---

## Sistema de agentes (meta)

| Documento | Descripción |
|-----------|-------------|
| [AGENTS-INDEX.md](./agents/AGENTS-INDEX.md) | Índice del sistema AGENTS |
| [AGENTS-QUICK-REFERENCE.md](./agents/AGENTS-QUICK-REFERENCE.md) | Referencia rápida |
| [AGENTS-SYSTEM.md](./agents/AGENTS-SYSTEM.md) | Descripción del sistema |

---

## Chat / inbox / mensajes

| Documento | Descripción |
|-----------|-------------|
| [INBOX-MESSAGING-IMPLEMENTATION.md](./inbox/INBOX-MESSAGING-IMPLEMENTATION.md) | Implementación messaging inbox |
| [CHAT-WIDGET-IMPLEMENTATION.md](./chat/CHAT-WIDGET-IMPLEMENTATION.md) | Widget de chat |
| [UNREAD_MESSAGES_ANALYSIS.md](./chat/UNREAD_MESSAGES_ANALYSIS.md) | Análisis no leídos |
| [AUTO-TAKE-PENDING-CHAT.md](./chat/AUTO-TAKE-PENDING-CHAT.md) | Auto-take de pendientes |
| [OPTIMISTIC-UPDATE-PATTERN.md](./chat/OPTIMISTIC-UPDATE-PATTERN.md) | Patrón optimistic update |
| [OPTIMISTIC-UPDATE-TROUBLESHOOTING.md](./chat/OPTIMISTIC-UPDATE-TROUBLESHOOTING.md) | Troubleshooting optimistic |
| [OPTIMISTIC-BUTTON-DISABLED.md](./chat/OPTIMISTIC-BUTTON-DISABLED.md) | Botón disabled optimistic |
| [DEBUG-MESSAGE-OWNERSHIP.md](./chat/DEBUG-MESSAGE-OWNERSHIP.md) | Ownership de mensajes |
| [EMPTY-USERID-TROUBLESHOOTING.md](./chat/EMPTY-USERID-TROUBLESHOOTING.md) | userId vacío |
| [CHANGE-DETECTION-FIX.md](./chat/CHANGE-DETECTION-FIX.md) | Change detection |
| [LOADING-*.md](./chat/) | Animaciones y loading |

---

## WebSocket

| Documento | Descripción |
|-----------|-------------|
| [WEBSOCKET-INTEGRATION-SUMMARY.md](./websocket/WEBSOCKET-INTEGRATION-SUMMARY.md) | Resumen integración |
| [WEBSOCKET-TROUBLESHOOTING.md](./websocket/WEBSOCKET-TROUBLESHOOTING.md) | Troubleshooting |
| [WEBSOCKET-FIX-README.md](./websocket/WEBSOCKET-FIX-README.md) | Fix notes |

---

## Visitantes

| Documento | Descripción |
|-----------|-------------|
| [VISITORS_QUICK_START.md](./visitors/VISITORS_QUICK_START.md) | Quick start |
| [VISITORS_INFINITE_SCROLL_GUIDE.md](./visitors/VISITORS_INFINITE_SCROLL_GUIDE.md) | Scroll infinito |
| [VISITORS_COMPLETE_FILE_REFERENCE.md](./visitors/VISITORS_COMPLETE_FILE_REFERENCE.md) | Referencia de archivos |
| [INFINITE-SCROLL-*.md](./visitors/) | Implementación y fixes scroll |
| [VISITOR-SORTING-*.md](./visitors/) | Ordenación |
| [VISITOR-TABLE-UPDATE-POINTS.md](./visitors/VISITOR-TABLE-UPDATE-POINTS.md) | Update points tabla |
| [VISITOR-CURRENT-URL-FIX.md](./visitors/VISITOR-CURRENT-URL-FIX.md) | Current URL fix |

---

## Mock data

- [MOCK-QUICK-GUIDE.md](./mock/MOCK-QUICK-GUIDE.md)
- [MOCK-DATA-SYSTEM.md](./mock/MOCK-DATA-SYSTEM.md)

---

## Desarrollo, migraciones y reports

Carpeta [`development/`](./development/) — staging deploy, migration/implementation summaries, audits, verification.

---

## Fixes históricos

Carpeta [`fixes/`](./fixes/) — notas de bugs ya resueltos (Material theme, websocket namespace, pagination scroll, etc.).

---

## E2E

- [`apps/console-e2e/WEBSOCKET-TESTING.md`](../apps/console-e2e/WEBSOCKET-TESTING.md)
