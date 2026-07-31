# Guía Rápida: Sistema de Mock Data

## 🚀 Comandos Rápidos

### Console (Puerto 4200)
```bash
npm run serve              # Datos reales del backend
npm run serve:mock         # Datos mock (100 visitantes simulados)
```

### Admin (Puerto 4201)
```bash
npm run serve:admin        # Datos reales del backend
npm run serve:admin:mock   # Datos mock (100 visitantes simulados)
```

## 💡 ¿Cuándo usar cada modo?

### Modo Real (`npm run serve`)
- Desarrollo con backend disponible
- Testing de integración
- Debugging de problemas del backend
- Desarrollo de funcionalidades que requieren datos reales

### Modo Mock (`npm run serve:mock`)
- Backend no disponible
- Desarrollo de UI/UX
- Demos y presentaciones
- Testing de paginación y navegación
- Desarrollo offline

## 📊 Datos Mock Disponibles

- **100 visitantes** con datos realistas en español
- **Paginación funcional** (10 items por página por defecto)
- **Estadísticas**: 23 online, 12 con chat, 8 leads
- **Latencia simulada**: 500ms carga, 300ms stats
- **Scroll preservado** en cambio de página

## 🔧 Variables de Entorno

Crear archivo `.env.local` (no commitear):

```bash
# Activar mock permanentemente
VITE_USE_MOCK_DATA=true
```

**Nota**: Los scripts `*:mock` ya configuran esta variable automáticamente.

## 📝 Implementación Técnica

El sistema usa **Angular 20 InjectionToken** para decidir en runtime qué implementación usar:

```typescript
// El componente inyecta el token
private readonly useMockData = inject(USE_MOCK_DATA);

// Y decide dinámicamente
if (this.useMockData) {
  // Usar mock
} else {
  // Usar servicio real
}
```

## ⚠️ Importante

- Cambiar entre modos **requiere reiniciar** el servidor
- Los mocks son **solo para desarrollo**, no para producción
- La configuración se lee en **tiempo de build** de Vite

## 📚 Más información

Ver `./MOCK-DATA-SYSTEM.md` para documentación completa.
