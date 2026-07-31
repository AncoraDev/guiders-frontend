# Atención = superficie principal de Console

## Regla

Para cambios de UX / producto del comercial en **Console**, implementar y verificar primero en:

`libs/chat/features/atencion`

**No** usar `inbox` (Bandeja), `visitors` ni `escalations` como destino por defecto: son legacy o secundarios. Solo tocarlos si el usuario lo pide explícitamente o hay un bug compartido inevitable.

## Dependencias compartidas que Atención consume

Estos libs se usan desde Atención; al cambiarlos, validar el flujo en `/atencion`:

| Lib | Uso en Atención |
|-----|-----------------|
| `libs/chat/ui/visitor-detail-panel` | Panel lateral (contacto, navegación, actividad) |
| `libs/chat/ui/contact-data-form` | Edición de contacto (incl. alias) |
| `libs/chat/ui/chat-placeholder` | Chat embebido |
| `libs/chat/data-access/lead-contact-service` | Guardar/cargar contacto |
| `libs/shared/util/visitor-display-name` | Nombre en listas / header (`alias` > nombre > email) |

## Checklist al terminar un cambio de consola

- [ ] Wiring en `atencion.ts` / `atencion.html`
- [ ] Probar en `/atencion` (no en Bandeja)
- [ ] Si hay display name: propagar a colas Pendientes / Míos / En la web + chat abierto
