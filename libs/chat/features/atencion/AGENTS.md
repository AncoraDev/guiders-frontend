# AGENTS.md - Chat: Atención Feature

**Parent**: [Root AGENTS.md](../../../../AGENTS.md)

## Overview

Espacio operativo único para comerciales. Sustituye el flujo diario
Bandeja + Visitantes con tres colas en una pantalla:

| Cola | Contenido | Acción |
|------|-----------|--------|
| Pendientes | Chats `PENDING` sin asignar | Abrir = claim + chat |
| Míos | Chats asignados a mí | Continuar conversación |
| En la web | Visitantes online sin chat | Iniciar contacto → mío |

## Routes

- `/atencion` — workspace principal
- Query `?cola=pendientes|mios|en-web` — cola inicial

## Key files

- `src/lib/atencion/atencion.ts` — coordinador
- `src/lib/atencion.routes.ts` — rutas

## Claim flow

1. Comercial selecciona fila en Pendientes
2. `PUT /v2/chats/:id/assign/:commercialId`
3. Chat pasa a Míos y se abre el panel embebido

## APIs

- Pending: `GET /v2/chats/queue/pending`
- Mine: `GET /v2/commercials/:id/chats`
- Online: `POST /tenant-visitors/:tenantId/visitors/search`
