# AGENTS.md - Admin: Clients (plataforma Guiders)

**Parent**: [`../../../../AGENTS.md`](../../../../AGENTS.md)

## Overview

Feature de plataforma para el equipo Guiders (`superadmin`): listar/crear clients (companies) y gestionar API keys del widget.

## Routes

- `/clients` — listado
- `/clients/new` — alta
- `/clients/:companyId` — detalle + API keys

## Data access

`@guiders-frontend/platform-companies-service` → `/api/platform/companies`

## Access

`adminGuard` exige rol `superadmin`. Admins de cliente se redirigen a Console.

## Out of scope

- Gestión del equipo del cliente → Console `/usuarios`
- LeadCars / Leads (ocultos del nav hasta adaptar `companyId` de ruta)
