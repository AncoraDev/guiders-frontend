# Índice de Documentación de AGENTS.md - Guiders Frontend

## 📚 Sistema de Documentación Jerárquico

La documentación del proyecto está organizada en **dos niveles**:

```
📄 AGENTS.md (Raíz)
├─ Guías generales
├─ Estructura del proyecto
├─ Código de estilo
└─ Enlaces a features

📁 Cada Feature
└─ 📄 AGENTS.md (Específico de feature)
   ├─ Comandos específicos
   ├─ Tareas comunes
   ├─ Patrones de testing
   └─ Guías de debugging
```

---

## 📍 Navegación Rápida

### Archivo Principal

- **[`AGENTS.md`](AGENTS.md)** - Documentación raíz (guías generales, estructura, comandos)

### Documentación del Sistema

- **[`AGENTS-SYSTEM.md`](AGENTS-SYSTEM.md)** - Cómo usar el sistema de documentación

---

## 🔐 Dominio de Autenticación

### Login

- **Feature**: User authentication & session management
- **Path**: `libs/auth/features/login/`
- **Documentación**: [📖 Login AGENTS.md](libs/auth/features/login/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve              # Ejecutar console con login
  nx test auth-login         # Tests de login
  nx lint auth-login         # Linter
  ```
- **Responsabilidades**:
  - OAuth 2.0 PKCE flow
  - Session management
  - Token persistence
  - Authentication guards

---

## 💬 Dominio de Chat

### Inbox

- **Feature**: Main messaging interface for operators
- **Path**: `libs/chat/features/inbox/`
- **Documentación**: [📖 Inbox AGENTS.md](libs/chat/features/inbox/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve              # Port 4200 with inbox
  nx test chat-inbox         # Inbox tests
  nx e2e console-e2e         # E2E tests
  ```
- **Responsabilidades**:
  - Conversation list & management
  - Message display & composition
  - Real-time message updates
  - Conversation state handling

### Visitors

- **Feature**: Active website visitor tracking
- **Path**: `libs/chat/features/visitors/`
- **Documentación**: [📖 Visitors AGENTS.md](libs/chat/features/visitors/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve              # Serve with visitors
  nx test chat-visitors      # Visitor tests
  nx e2e console-e2e -- --grep "visitor"
  ```
- **Responsabilidades**:
  - Visitor list display
  - Session tracking
  - Filtering & search
  - Visitor selection

### Contacts

- **Feature**: Contact/customer information management
- **Path**: `libs/chat/features/contacts/`
- **Documentación**: [📖 Contacts AGENTS.md](libs/chat/features/contacts/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve              # Serve with contacts
  nx test chat-contacts      # Contact tests
  ```
- **Responsabilidades**:
  - Contact list & directory
  - Contact creation/editing
  - Contact groups/tags
  - Contact search

### Escalations

- **Feature**: Ticket escalation workflow management
- **Path**: `libs/chat/features/escalations/`
- **Documentación**: [📖 Escalations AGENTS.md](libs/chat/features/escalations/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve              # Serve with escalations
  nx test chat-escalations   # Escalation tests
  ```
- **Responsabilidades**:
  - Escalation creation
  - Team assignment
  - Status tracking
  - SLA monitoring

---

## ⚙️ Dominio de Administración

### Dashboard

- **Feature**: System overview & metrics
- **Path**: `libs/admin/features/dashboard/`
- **Documentación**: [📖 Dashboard AGENTS.md](libs/admin/features/dashboard/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Port 4201 with admin
  nx test admin-dashboard    # Dashboard tests
  ```
- **Responsabilidades**:
  - System metrics display
  - Team overview
  - Activity feed
  - Real-time updates

### Users

- **Feature**: User & role management
- **Path**: `libs/admin/features/users/`
- **Documentación**: [📖 Users AGENTS.md](libs/admin/features/users/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Admin app
  nx test admin-users        # User tests
  ```
- **Responsabilidades**:
  - User CRUD operations
  - Role assignment
  - Permission management
  - Team organization

### AI Config

- **Feature**: AI model configuration
- **Path**: `libs/admin/features/ai-config/`
- **Documentación**: [📖 AI Config AGENTS.md](libs/admin/features/ai-config/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Admin app
  nx test admin-ai-config    # AI config tests
  ```
- **Responsabilidades**:
  - Model selection
  - Prompt customization
  - Parameter tuning
  - AI capability toggles

### Integrations

- **Feature**: Third-party service integration
- **Path**: `libs/admin/features/integrations/`
- **Documentación**: [📖 Integrations AGENTS.md](libs/admin/features/integrations/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Admin app
  nx test admin-integrations # Integration tests
  ```
- **Responsabilidades**:
  - OAuth setup
  - API key management
  - Webhook configuration
  - Integration status monitoring

### White Label Config

- **Feature**: Branding & appearance customization
- **Path**: `libs/admin/features/white-label-config/`
- **Documentación**: [📖 White Label AGENTS.md](libs/admin/features/white-label-config/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Admin app
  nx test admin-white-label-config
  ```
- **Responsabilidades**:
  - Logo management
  - Color customization
  - Theme configuration
  - Custom domain setup

---

## 📊 Dominio de Analytics

### Admin Dashboard

- **Feature**: Detailed metrics & reporting
- **Path**: `libs/analytics/features/admin-dashboard/`
- **Documentación**: [📖 Analytics Dashboard AGENTS.md](libs/analytics/features/admin-dashboard/AGENTS.md)
- **Comandos**:
  ```bash
  npm run serve:admin        # Admin app
  nx test analytics-admin-dashboard
  ```
- **Responsabilidades**:
  - Conversation metrics
  - Operator performance
  - Customer satisfaction
  - Trend analysis & reports

---

## 🗺️ Mapa de Dependencias

```
Auth (Login)
    ↓
    Usada por: Todas las features

Chat
├─ Inbox
│   ├─ Depende de: Visitors, Contacts
│   └─ Usada por: Escalations
├─ Visitors
│   └─ Usada por: Inbox
├─ Contacts
│   └─ Usada por: Inbox
└─ Escalations
    ├─ Depende de: Inbox
    └─ Relacionada con: Admin Dashboard

Admin
├─ Dashboard
│   ├─ Depende de: Chat features (métricas)
│   └─ Relacionada con: Users, Analytics
├─ Users
│   └─ Usada por: Todas las admin features
├─ AI Config
│   └─ Usada por: Inbox (generación de mensajes)
├─ Integrations
│   └─ Puede afectar: Cualquier feature
└─ White Label Config
    └─ Usada por: Todas las features (branding)

Analytics
└─ Admin Dashboard
    ├─ Depende de: Chat features
    └─ Relacionada con: Admin Dashboard
```

---

## 🎯 Cómo Usar Este Índice

### Necesito trabajar en una feature específica

1. Encuentra la feature en este índice
2. Haz clic en el enlace 📖
3. Abre su `AGENTS.md` específica
4. Sigue las instrucciones y ejemplos

### Necesito encontrar comandos para una feature

1. Ubica la feature en el índice
2. Expande la sección "Comandos"
3. Usa el comando específico

### Necesito entender dependencias

1. Consulta el "Mapa de Dependencias"
2. Ve a la documentación de dependencias
3. Verifica qué puede importar

### Necesito debuggear un problema

1. Ve a la feature específica
2. Abre su `AGENTS.md`
3. Ve a la sección "Debugging"
4. Sigue los pasos de resolución

---

## 📋 Resumen: 11 Features Documentadas

| #    | Dominio   | Feature            | Documentación                                                  |
| ---- | --------- | ------------------ | -------------------------------------------------------------- |
| 1️⃣   | Auth      | Login              | [AGENTS.md](libs/auth/features/login/AGENTS.md)                |
| 2️⃣   | Chat      | Inbox              | [AGENTS.md](libs/chat/features/inbox/AGENTS.md)                |
| 3️⃣   | Chat      | Visitors           | [AGENTS.md](libs/chat/features/visitors/AGENTS.md)             |
| 4️⃣   | Chat      | Contacts           | [AGENTS.md](libs/chat/features/contacts/AGENTS.md)             |
| 5️⃣   | Chat      | Escalations        | [AGENTS.md](libs/chat/features/escalations/AGENTS.md)          |
| 6️⃣   | Admin     | Dashboard          | [AGENTS.md](libs/admin/features/dashboard/AGENTS.md)           |
| 7️⃣   | Admin     | Users              | [AGENTS.md](libs/admin/features/users/AGENTS.md)               |
| 8️⃣   | Admin     | AI Config          | [AGENTS.md](libs/admin/features/ai-config/AGENTS.md)           |
| 9️⃣   | Admin     | Integrations       | [AGENTS.md](libs/admin/features/integrations/AGENTS.md)        |
| 🔟   | Admin     | White Label Config | [AGENTS.md](libs/admin/features/white-label-config/AGENTS.md)  |
| 1️⃣1️⃣ | Analytics | Admin Dashboard    | [AGENTS.md](libs/analytics/features/admin-dashboard/AGENTS.md) |

---

## 📞 Archivos de Referencia

| Archivo                                      | Propósito                                |
| -------------------------------------------- | ---------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                     | Documentación raíz (guías generales)     |
| [`AGENTS-SYSTEM.md`](AGENTS-SYSTEM.md)       | Explicación del sistema de documentación |
| **Este archivo**                             | Índice visual y navegación rápida        |
| `libs/[domain]/features/[feature]/AGENTS.md` | Documentación específica de feature      |

---

## ✨ Ventajas del Sistema

✅ **Fácil de Navegar**: Encuentra rápidamente lo que necesitas  
✅ **Bien Organizado**: Por dominio y por feature  
✅ **Actualizable**: Cada feature puede actualizarse independientemente  
✅ **Consistente**: Todas las features siguen la misma estructura  
✅ **Enlazado**: Referencias cruzadas entre features  
✅ **Específico**: Comandos y ejemplos personalizados por feature

---

**Sistema de Documentación Versión 1.0**  
**Creado para**: Guiders Frontend (Angular 20 + Nx 21)  
**Actualizado**: Enero 2026
