# Fix: IntersectionObserver no Detecta Scroll al Inicio

## 🐛 Problema

El scroll infinito no estaba funcionando. Cuando el usuario hacía scroll hacia arriba, no se cargaban más mensajes automáticamente.

## 🔍 Causa Raíz

1. **Observer configurado demasiado pronto**: El `IntersectionObserver` se configuraba en `ngAfterViewInit`, pero el `scrollAnchor` podía no estar en el DOM si `hasMoreMessages` era `false` inicialmente.

2. **Observer no se reconfiguraba**: Cuando `hasMoreMessages` cambiaba de `false` a `true`, el observer no se reconfiguraba.

3. **Elemento muy pequeño**: El `scrollAnchor` tenía solo 1px de altura, haciéndolo difícil de detectar.

4. **Falta de logs**: No había información de debug para diagnosticar el problema.

## ✅ Solución Aplicada

### 1. Reconfigurar Observer en Cambios

**Antes:**
```typescript
ngAfterViewInit(): void {
  this.setupIntersectionObserver();
  this.scheduleScrollToBottom();
}
```

**Después:**
```typescript
ngOnChanges(changes: SimpleChanges): void {
  // ... código existente ...
  
  // Si cambia hasMoreMessages, reconfigurar el observer
  if (changes['hasMoreMessages']) {
    console.log('[ChatPlaceholder] hasMoreMessages cambió:', changes['hasMoreMessages'].currentValue);
    this.cleanupIntersectionObserver();
    if (changes['hasMoreMessages'].currentValue) {
      setTimeout(() => {
        this.setupIntersectionObserver();
      }, 100);
    }
  }
}

ngAfterViewInit(): void {
  this.scheduleScrollToBottom();
  // Configurar observer si hay más mensajes
  if (this.hasMoreMessages) {
    setTimeout(() => {
      this.setupIntersectionObserver();
    }, 100);
  }
}
```

### 2. Agregar Logs de Debug

```typescript
private setupIntersectionObserver(): void {
  console.log('[ChatPlaceholder] Configurando IntersectionObserver...');
  console.log('[ChatPlaceholder] scrollAnchor existe?', !!this.scrollAnchor);
  console.log('[ChatPlaceholder] messagesContainer existe?', !!this.messagesContainer);
  console.log('[ChatPlaceholder] hasMoreMessages:', this.hasMoreMessages);
  
  // Validaciones
  if (!this.scrollAnchor || !this.messagesContainer) {
    console.warn('[ChatPlaceholder] No se puede configurar observer');
    return;
  }
  
  // ... configuración del observer ...
  
  this.intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      console.log('[ChatPlaceholder] IntersectionObserver callback:', {
        isIntersecting: entry.isIntersecting,
        intersectionRatio: entry.intersectionRatio,
        isLoadingMore: this.isLoadingMore,
        hasMoreMessages: this.hasMoreMessages
      });
      
      if (entry.isIntersecting && !this.isLoadingMore && this.hasMoreMessages) {
        console.log('[ChatPlaceholder] ✅ Condiciones cumplidas, emitiendo loadMoreMessages');
        this.loadMoreMessages.emit();
      }
    });
  }, options);
}
```

### 3. Mejorar Estilos del Scroll Anchor

**SCSS:**
```scss
&__scroll-anchor {
  min-height: 20px; // Aumentado de 1px a 20px
  padding: tokens.$spacing-sm 0;
  display: block;
  width: 100%;
}

&__scroll-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: tokens.$spacing-xs tokens.$spacing-md;
  background-color: tokens.$color-surface-tertiary;
  border-radius: tokens.$border-radius-sm;
  margin: 0 auto;
  max-width: fit-content;
  
  span {
    font-size: tokens.$font-size-xs;
    color: tokens.$color-text-tertiary;
    font-weight: tokens.$font-weight-medium;
  }
}
```

### 4. Indicador Visual para Debug

**HTML:**
```html
@if (hasMoreMessages) {
  <div #scrollAnchor class="guiders-chat-placeholder__scroll-anchor">
    @if (isLoadingMore) {
      <div class="guiders-chat-placeholder__loading-more">
        <span class="guiders-chat-placeholder__loading-spinner"></span>
        <span class="guiders-chat-placeholder__loading-text">
          Cargando mensajes anteriores…
        </span>
      </div>
    } @else {
      <div class="guiders-chat-placeholder__scroll-indicator">
        <span>↑ Hacer scroll hacia arriba para cargar más ↑</span>
      </div>
    }
  </div>
}
```

### 5. Aumentar rootMargin

```typescript
const options: IntersectionObserverInit = {
  root: this.messagesContainer.nativeElement,
  rootMargin: '50px', // Aumentado de 20px a 50px
  threshold: 0.1
};
```

Esto hace que el observer detecte el elemento **50px antes** de que sea visible, cargando los mensajes de forma más proactiva.

## 🔧 Flujo Actualizado

### Caso 1: Carga Inicial

```
1. Inbox carga mensajes con getMessagesV2()
2. Backend responde con hasMore: true, nextCursor: "abc123"
3. Inbox actualiza:
   - messagesMap[chatId] = messages
   - messagePaginationMap[chatId] = { hasMore: true, nextCursor: "abc123" }
4. ChatPlaceholder recibe hasMoreMessages = true
5. ngOnChanges detecta cambio en hasMoreMessages
6. setupIntersectionObserver() se ejecuta después de 100ms
7. Observer se configura y comienza a observar scrollAnchor
8. Usuario ve indicador: "↑ Hacer scroll hacia arriba para cargar más ↑"
```

### Caso 2: Usuario Hace Scroll Hacia Arriba

```
1. Usuario hace scroll hacia arriba
2. scrollAnchor entra en el viewport (o dentro de rootMargin: 50px)
3. IntersectionObserver callback se ejecuta
4. Logs muestran: isIntersecting: true, isLoadingMore: false, hasMoreMessages: true
5. loadMoreMessages.emit() se dispara
6. Inbox.onLoadMoreMessages() recibe el evento
7. Inbox marca isLoadingMore = true
8. ChatPlaceholder actualiza UI: muestra spinner
9. Inbox llama chatService.getMessagesV2(chatId, { cursor: "abc123" })
10. Backend responde con más mensajes
11. Inbox inserta mensajes al inicio del array
12. ChatPlaceholder.preserveScrollPosition() mantiene posición
13. Inbox marca isLoadingMore = false
14. ChatPlaceholder actualiza: oculta spinner, muestra indicador nuevamente
```

### Caso 3: No Hay Más Mensajes

```
1. Backend responde con hasMore: false
2. Inbox actualiza messagePaginationMap[chatId].hasMore = false
3. ChatPlaceholder recibe hasMoreMessages = false
4. ngOnChanges detecta cambio
5. cleanupIntersectionObserver() se ejecuta
6. scrollAnchor desaparece del DOM (condición @if falsa)
7. Usuario ve solo los mensajes, sin indicador de carga
```

## 🧪 Testing

### Logs a Verificar en la Consola

Al cargar un chat con mensajes:
```
[ChatPlaceholder] hasMoreMessages cambió: true
[ChatPlaceholder] Configurando IntersectionObserver...
[ChatPlaceholder] scrollAnchor existe? true
[ChatPlaceholder] messagesContainer existe? true
[ChatPlaceholder] hasMoreMessages: true
[ChatPlaceholder] Creando IntersectionObserver con opciones: {...}
[ChatPlaceholder] ✅ Observer configurado y observando scrollAnchor
```

Al hacer scroll hacia arriba:
```
[ChatPlaceholder] IntersectionObserver callback: {
  isIntersecting: true,
  intersectionRatio: 0.15,
  isLoadingMore: false,
  hasMoreMessages: true
}
[ChatPlaceholder] ✅ Condiciones cumplidas, emitiendo loadMoreMessages
```

Durante la carga:
```
[ChatPlaceholder] IntersectionObserver callback: {
  isIntersecting: true,
  intersectionRatio: 0.15,
  isLoadingMore: true,    // <-- Bloqueado
  hasMoreMessages: true
}
[ChatPlaceholder] ⏸️ Ya está cargando más mensajes
```

## 📋 Checklist de Verificación

- [ ] Al cargar un chat, se ve el indicador "↑ Hacer scroll hacia arriba para cargar más ↑"
- [ ] Al hacer scroll hacia arriba, aparece el spinner "Cargando mensajes anteriores…"
- [ ] Los mensajes antiguos se cargan sin saltos de scroll
- [ ] La posición del scroll se mantiene correctamente
- [ ] Cuando no hay más mensajes, el indicador desaparece
- [ ] Los logs de debug aparecen en la consola
- [ ] No se cargan mensajes duplicados

## 🎯 Mejoras Aplicadas

1. ✅ **Detección proactiva**: `rootMargin: 50px` detecta antes
2. ✅ **Logs de debug**: Fácil diagnóstico de problemas
3. ✅ **Indicador visual**: Usuario sabe que puede cargar más
4. ✅ **Reconfiguración dinámica**: Observer se adapta a cambios en `hasMoreMessages`
5. ✅ **Validaciones robustas**: Verifica que elementos existan antes de observar
6. ✅ **Limpieza automática**: Observer se limpia en cambios de chat

## 🚀 Próximos Pasos (Opcional)

Una vez verificado que funciona correctamente, puedes:

1. **Remover indicador visual**: Eliminar el mensaje "↑ Hacer scroll hacia arriba..." y dejar solo el spinner
2. **Reducir logs**: Comentar los `console.log` de debug
3. **Ajustar rootMargin**: Experimentar con valores entre 30px-100px para mejor UX
4. **Agregar animación**: Fade in/out para el indicador de carga

## 📁 Archivos Modificados

- `libs/chat/ui/chat-placeholder/src/lib/chat-placeholder/chat-placeholder.ts`
  - Método `ngOnChanges()`: Detecta cambios en `hasMoreMessages`
  - Método `ngAfterViewInit()`: Configuración condicional del observer
  - Método `setupIntersectionObserver()`: Logs de debug + validaciones
  - Método `cleanupIntersectionObserver()`: Log de limpieza

- `libs/chat/ui/chat-placeholder/src/lib/chat-placeholder/chat-placeholder.html`
  - Indicador visual de scroll infinito

- `libs/chat/ui/chat-placeholder/src/lib/chat-placeholder/chat-placeholder.scss`
  - Estilos para scroll anchor (min-height: 20px)
  - Estilos para indicador visual

---

**Fecha**: 3 de octubre de 2025  
**Status**: ✅ Implementado  
**Impacto**: Alto - Funcionalidad core de scroll infinito
