# AGENTS.md - Chat: Atención Feature

**Parent**: [Root AGENTS.md](../../../../AGENTS.md)

## Overview

**Superficie principal de Console para comerciales.** Implementar aquí
las features operativas (contacto, alias, navegación, chat). No usar
`inbox` / Bandeja como destino por defecto.

Tres colas en una pantalla:

| Cola | Contenido | Acción |
|------|-----------|--------|
| Pendientes | Chats `PENDING` sin asignar (también vacíos al entrar en la web vía SDK `createChatAuto`) | Abrir = claim + chat |
| Míos | Chats asignados a mí | Continuar conversación |
| En la web | Visitantes online **sin** chat abierto | Residual; click = iniciar sin mensaje; **Saludar** = con saludo → Míos |

Tras identify el SDK crea un PENDING (`metadata.source: sdk-site-entry`), así que la mayoría de visitantes activos aparecen en **Pendientes**, no en En la web.

## Routes

- `/atencion` — workspace principal
- Query `?cola=pendientes|mios|en-web` — cola inicial
- Query `?chat=` — deep-link a un chat en Míos

## Key files

- `src/lib/atencion/atencion.ts` — coordinador
- `src/lib/atencion/atencion.html` — layout (colas + lista + chat + panel + toast-host)
- `src/lib/atencion.routes.ts` — rutas

## Shared UI used by Atención

| Lib | Rol |
|-----|-----|
| `visitor-detail-panel` | Panel lateral (contacto, alias, navegación) |
| `contact-data-form` | Formulario de contacto |
| `chat-placeholder` | Chat embebido |
| `lead-contact-service` | API contacto |
| `visitor-display-name` | Nombre en listas/header (`alias` > nombre > email) |
| `shared/ui/toast` | Toasts locales (`guiders-toast-host` montado en Atención) |

## Filas (`AtencionListItem`)

- `preview` — último mensaje truncado (~80 chars); Pendientes cae en “Esperando atención”
- `pageLabel` — URL/página corta (`currentUrl` en web; `metadata.initialUrl` en pending/mine si existe)
- `isLead` — contacto con nombre + (email|tel) **o** lifecycle `LEAD`/`CONVERTED`

## Toast Pendientes

- Escucha WS `chat:created` (tenant room) si `status === PENDING`
- Fallback: poll 4s detecta `chatId` nuevos vs baseline
- Dedup con `notifiedPendingChatIds`; no auto-abre el chat
- Texto: `Nuevo mensaje de {nombre}`

## Saludar (En la web)

- Botón en la fila con `stopPropagation`
- `POST /v2/chats/with-message` vía `createChatWithVisitor({ firstMessage })`
- Mensaje por defecto: `¡Hola! ¿En qué puedo ayudarte?`
- Luego assign + abrir en Míos
- Click en el resto de la fila: `POST /v2/chats` con `visitorInfo.visitorId` + assign

## Contacto / alias

- Guardar: `onSaveContactData` → `LeadContactService`
- Propagar título: `applyContactDisplayName` → chat abierto + Pendientes / Míos / En la web
- Tras refresh: `ensureContacts` enriquece nombres + chip Lead
- Prioridad display: **alias** → nombre+apellidos → email → teléfono

## Claim flow

1. Comercial selecciona fila en Pendientes
2. `PUT /v2/chats/:id/assign/:commercialId`
3. Chat pasa a Míos y se abre el panel embebido

## APIs

- Pending: `GET /v2/chats/queue/pending`
- Mine: `GET /v2/commercials/:id/chats`
- Online: `POST /tenant-visitors/:tenantId/visitors/search`
- Create chat: `POST /v2/chats` (sin mensaje; commercial debe enviar `visitorInfo.visitorId`) / `POST /v2/chats/with-message` (Saludar)
- Contact: `POST/GET /leads/contact-data/:visitorId`
- Page history: `GET /visitors/:visitorId/page-history`
