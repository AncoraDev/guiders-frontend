# Quick Reference - Sistema de AGENTS.md

## 🚀 Empieza Aquí

### Para principiantes

1. Lee: [`AGENTS-INDEX.md`](AGENTS-INDEX.md) - Índice visual
2. Lee: [`AGENTS.md`](AGENTS.md) - Guías generales
3. Ve a tu feature específica

### Para desarrolladores experimentados

1. Ve directamente a `libs/[domain]/features/[feature]/AGENTS.md`
2. Lee sección relevante (Commands, Common Tasks, etc.)
3. Consulta "Related Features" para dependencias

---

## 📂 Estructura de Archivos

```
AGENTS.md (root)              ← Guías generales, código, build
├── docs/agents/AGENTS-SYSTEM.md   ← Cómo funciona el sistema
├── docs/agents/AGENTS-INDEX.md    ← Índice visual y navegación
│
└── libs/[domain]/features/[feature]/AGENTS.md
    ├── auth/features/login/AGENTS.md
    ├── chat/features/
    │   ├── inbox/AGENTS.md
    │   ├── visitors/AGENTS.md
    │   ├── contacts/AGENTS.md
    │   └── escalations/AGENTS.md
    ├── admin/features/
    │   ├── dashboard/AGENTS.md
    │   ├── users/AGENTS.md
    │   ├── ai-config/AGENTS.md
    │   ├── integrations/AGENTS.md
    │   └── white-label-config/AGENTS.md
    └── analytics/features/
        └── admin-dashboard/AGENTS.md
```

---

## 🎯 Secciones de Cada Feature AGENTS.md

| Sección                  | Qué encontrarás                   |
| ------------------------ | --------------------------------- |
| **Overview**             | Qué hace esta feature             |
| **Feature Structure**    | Cómo está organizado              |
| **Key Components**       | Componentes/servicios principales |
| **Development Commands** | `nx test`, `npm run serve`, etc.  |
| **Common Tasks**         | Ejemplos de código típicos        |
| **Architecture Rules**   | Qué puedo/no puedo importar       |
| **Testing Guidelines**   | Cómo escribir tests               |
| **Key Files**            | Archivos importantes              |
| **Performance**          | Tips de optimización              |
| **Debugging**            | Solución de problemas comunes     |
| **Related Features**     | Otras features relacionadas       |
| **Workflows**            | Pasos usuario típicos             |

---

## 💡 Preguntas Comunes

### "¿Dónde está la feature X?"

→ AGENTS-INDEX.md

### "¿Cómo hago X en esta feature?"

→ Feature AGENTS.md → Common Tasks

### "¿Qué comando uso para testear?"

→ Feature AGENTS.md → Development Commands

### "¿Puedo importar de otra feature?"

→ Feature AGENTS.md → Architecture Rules

### "Mi código no funciona, ¿cómo debuggeo?"

→ Feature AGENTS.md → Debugging

### "¿Qué archivo debo modificar?"

→ Feature AGENTS.md → Key Files to Know

### "¿Cómo escribo un test?"

→ Feature AGENTS.md → Testing Guidelines

### "¿Cuáles son las dependencias?"

→ AGENTS-INDEX.md → Mapa de Dependencias

---

## 🔧 Comandos Rápidos

### Serve (Correr la app)

```bash
npm run serve              # Console (puerto 4200)
npm run serve:admin        # Admin (puerto 4201)
npm run serve:mock         # Console con mock data
```

### Test

```bash
nx test [project]          # Tests del proyecto
nx test [project] -- --grep "pattern"   # Tests específicos
npm run test:coverage      # Tests con cobertura
```

### Lint

```bash
nx lint [project]          # Revisar código
nx lint [project] -- --fix # Auto-arreglar
```

### Build

```bash
nx build [project]         # Build específico
npm run build:all          # Build todos en paralelo
npm run build:prod         # Build producción
```

### E2E Tests

```bash
nx e2e console-e2e         # E2E de console
nx e2e admin-e2e           # E2E de admin
nx e2e [project] --ui      # Con interfaz gráfica
```

---

## 🏗️ Estructura de Imports

### ✅ Permitido

```typescript
// Desde otra feature en el mismo dominio (si permite)
import { ServiceA } from '@guiders-frontend/chat/data-access/...';

// Desde shared
import { Button } from '@guiders-frontend/shared/ui/button';
import { DateUtil } from '@guiders-frontend/shared/util/date';

// Types siempre permitidos
import { User } from '@guiders-frontend/shared/types';
```

### ❌ NO Permitido

```typescript
// Importar de otra feature directamente
import { Dashboard } from '@guiders-frontend/admin/features/dashboard';

// Usar rutas relativas entre features
import { Service } from '../../../../admin/services/';

// Imports que violen architecture rules
import { Inbox } from '@guiders-frontend/chat/features/inbox'; // Si no está permitido
```

---

## 🐛 Debugging Rápido

### Problema de imports

→ Feature AGENTS.md → Architecture Rules

### Tests fallan

→ Feature AGENTS.md → Testing Guidelines

### Comando no existe

→ Feature AGENTS.md → Development Commands

### Performance lenta

→ Feature AGENTS.md → Performance Considerations

### API returns error

→ Root AGENTS.md → HTTP Services pattern

### WebSocket no conecta

→ Feature AGENTS.md → Debugging

---

## 📊 Mapa Mental de Features

```
Auth: Login
  ↓ (prerequisito)

Chat: Inbox ← Visitors, Contacts, Escalations
  ├─ Visitors
  ├─ Contacts
  └─ Escalations

Admin: Dashboard ← All Chat features
  ├─ Users
  ├─ AI Config
  ├─ Integrations
  └─ White Label Config

Analytics: Admin Dashboard ← Chat features
```

---

## 🎓 Aprender Patrones

### Pattern de componente

```typescript
// En cualquier Feature AGENTS.md → Common Tasks
@Component({
  selector: 'guiders-my-component',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyComponent {
  readonly input = input<string>();
  readonly output = output<void>();
}
```

### Pattern de servicio

```typescript
// Busca en Root AGENTS.md → HTTP Services
@Injectable({ providedIn: 'root' })
export class MyService {
  private readonly http = inject(HttpClient);

  getData(): Observable<Data[]> {
    return this.http.get<Data[]>(...).pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
```

### Pattern de test

```typescript
// En Feature AGENTS.md → Testing Guidelines
it('should do X when Y', fakeAsync(() => {
  component.doSomething();
  tick();
  expect(component.property()).toBe(expected);
}));
```

---

## 🔗 Navegación de Links

Todos los links usan rutas relativas:

- ✅ Funcionan en VS Code (Ctrl+Click)
- ✅ Funcionan en GitHub
- ✅ Funcionan en cualquier markdown viewer

**Ejemplo desde feature**:

```markdown
[Root AGENTS.md](../../../../AGENTS.md) ← Sube 4 niveles
[Inbox AGENTS.md](../inbox/AGENTS.md) ← Hermana
```

---

## 📚 Documentación Relacionada

| Archivo              | Para qué                               |
| -------------------- | -------------------------------------- |
| `AGENTS.md`          | Guías generales, código, build         |
| `AGENTS-SYSTEM.md`   | Explicación de la arquitectura de docs |
| `AGENTS-INDEX.md`    | Índice visual y mapa de features       |
| `.claude/rules/`     | Reglas de arquitectura específicas     |
| `tsconfig.base.json` | Path aliases y configuración TS        |
| `nx.json`            | Configuración de Nx                    |

---

## 🚀 Flujo de Trabajo Típico

1. **Recibir tarea**: "Agregar feature X a Y"
2. **Entender contexto**: AGENTS-INDEX.md
3. **Ir a feature**: libs/.../features/.../AGENTS.md
4. **Revisar** Architecture Rules
5. **Revisar** Common Tasks para ejemplos
6. **Escribir código** siguiendo patrones
7. **Revisar** Testing Guidelines
8. **Escribir tests**
9. **Debuggear** usando Debugging section si es necesario

---

## ⚡ Tips

- **VS Code**: `Ctrl+P` → busca "AGENTS" → ve a archivo
- **Markdown**: Usa links con `Ctrl+Click` para navegar
- **Branches**: Cada feature docs se actualiza con el código
- **Mantén actualizado**: Si cambias código, actualiza el AGENTS.md

---

## 📞 Soporte

Si necesitas ayuda:

1. Revisa el AGENTS.md de la feature
2. Revisa el AGENTS.md raíz
3. Revisa AGENTS-SYSTEM.md
4. Consulta `.claude/rules/` para arquitectura
5. Pregunta en el equipo

---

**Sistema de Documentación v1.0 - Guiders Frontend**  
**Actualizado**: Enero 2026
