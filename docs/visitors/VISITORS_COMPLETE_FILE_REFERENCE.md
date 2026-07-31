# Referencia Completa de Archivos - Sistema de Visitantes

## Archivo 1: VisitorsDataService (servicio HTTP)

**Ruta**: `/libs/chat/data-access/visitors-data-service/src/lib/visitors-data-service.ts`
**Líneas**: 865 total
**Propósito**: API HTTP para obtener, buscar y gestionar visitantes

### Métodos más relevantes para infinite scroll:

```typescript
/**
 * Buscar visitantes con filtros complejos
 * POST /tenant-visitors/:tenantId/visitors/search
 */
searchVisitors(
  tenantId: string,
  request: VisitorSearchRequest = {}
): Observable<VisitorSearchResponse>

// Ejemplo de request:
{
  filters: {
    connectionStatus: ['online'],
    lifecycle: ['LEAD', 'CONVERTED']
  },
  sort: {
    field: 'createdAt',
    direction: 'DESC'
  },
  page: 1,
  limit: 25
}

// Ejemplo de response:
{
  visitors: [
    {
      id: 'visitor-123',
      name: 'John Doe',
      email: 'john@example.com',
      lifecycle: 'LEAD',
      connectionStatus: 'online',
      // ... más campos
    }
  ],
  pagination: {
    total: 250,
    page: 1,
    limit: 25,
    totalPages: 10,
    hasNextPage: true,
    hasPreviousPage: false
  }
}
```

---

## Archivo 2: VisitorsComponent (contenedor principal)

**Ruta**: `/libs/chat/features/visitors/src/lib/visitors/visitors.ts`
**Líneas**: 2077 total
**Propósito**: Contenedor que maneja toda la lógica de infinite scroll

### Métodos esenciales:

```typescript
// ========== CARGA INICIAL ==========
loadVisitors(options: { scrollToTop?: boolean } = {}): void {
  // Carga la primera página (página 1) de visitantes
  // Resetea infiniteOffset = 0
  // Resetea hasMore = true
  const request: VisitorSearchRequest = {
    filters: searchFilters,
    sort: { field: 'createdAt', direction: 'DESC' },
    page: 1,
    limit: this.batchSize,  // 25
  };
  
  this.visitorsService.searchVisitors(companyId, request)
    .subscribe((response) => {
      const mappedVisitors = this.mapSearchResultsToVisitors(response.visitors);
      this.hasMore.set(response.pagination.hasNextPage);
      this.updateState({ visitors: mappedVisitors });
      this.lastRefreshTime.set(new Date());
    });
}

// ========== CARGAR MÁS (INFINITE SCROLL) ==========
onLoadMore(): void {
  // Guardias de seguridad
  if (this.isResetting || this.isLoadingMore() || !this.hasMore()) return;

  const currentVisitors = this.state().visitors;
  const batchStart = currentVisitors.length;
  this.infiniteOffset = batchStart;  // 25, 50, 75, etc.
  this.isLoadingMore.set(true);

  // Calcular número de página basado en offset
  const page = Math.floor(this.infiniteOffset / this.batchSize) + 1;

  const request: VisitorSearchRequest = {
    filters: this.activeSearchFilters(),
    sort: this.activeSearchSort(),
    page,
    limit: this.batchSize,
  };

  this.visitorsService
    .searchVisitors(companyId, request)
    .pipe(
      takeUntil(this._cancelLoadMore$),  // Cancelar si hay nuevo filtro
      finalize(() => this.isLoadingMore.set(false))
    )
    .subscribe((response) => {
      if (this.isResetting) return;  // Descartar si reseteo durante carga
      
      const newVisitors = this.mapSearchResultsToVisitors(response.visitors);
      const merged = [...currentVisitors, ...newVisitors];  // APPEND!
      
      this.lastBatchStartIndex.set(batchStart);  // Para animar
      this.hasMore.set(response.pagination.hasNextPage);
      this.updateState({ visitors: merged });
      this.lastRefreshTime.set(new Date());
    });
}

// ========== CUANDO APLICA FILTROS ==========
private searchVisitorsWithFilters(): void {
  // Cancelar cualquier carga en progreso
  this._cancelLoadMore$.next();
  this.isResetting = true;  // Prevenir que loadMore aplique resultados viejos
  
  // Resetear estado
  this.infiniteOffset = 0;
  this.hasMore.set(true);
  this.lastBatchStartIndex.set(0);
  this.updateState({ visitors: [], loading: true });

  const companyId = this.companyId();
  if (!companyId) return;

  const request = {
    filters: this.activeSearchFilters(),
    sort: this.activeSearchSort(),
    page: 1,
    limit: this.batchSize,
  };

  this.visitorsService
    .searchVisitors(companyId, request)
    .pipe(
      finalize(() => {
        this.isResetting = false;  // Ya puede procesar nuevo loadMore
        this.updateState({ loading: false });
      })
    )
    .subscribe((response) => {
      const mappedVisitors = this.applyDemoVisitorIfActive(
        this.mapSearchResultsToVisitors(response.visitors)
      );
      
      this.hasMore.set(response.pagination.hasNextPage);
      this.updateState({
        visitors: mappedVisitors,
        pagination: {
          ...this.state().pagination,
          totalCount: response.pagination.total,
        },
      });
      
      this.lastRefreshTime.set(new Date());
      this.loadQuickFilters();  // Actualizar contadores
    });
}
```

### Señales de Estado Clave

```typescript
readonly batchSize = 25;  // Tamaño de cada lote
readonly isLoadingMore = signal<boolean>(false);  // ¿Está cargando?
readonly hasMore = signal<boolean>(true);  // ¿Hay más datos?
readonly lastBatchStartIndex = signal<number>(0);  // Para animar filas nuevas

private infiniteOffset = 0;  // Offset actual (25, 50, 75, etc.)
private isResetting = false;  // Flag para bloquear loadMore durante reset
private readonly _cancelLoadMore$ = new Subject<void>();  // Cancela cargas en vuelo
```

---

## Archivo 3: VisitorsListComponent (tabla con IntersectionObserver)

**Ruta**: `/libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.ts`
**Líneas**: 788 total
**Propósito**: Tabla Notion-style con infinite scroll via IntersectionObserver

### Infinite Scroll Implementation

```typescript
private setupIntersectionObserver(): void {
  if (!this.scrollSentinelRef?.nativeElement) return;

  const root = this.tableContainerRef?.nativeElement ?? null;

  this.intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (this._destroyed) return;
      const entry = entries[0];
      
      // Condiciones para emitir loadMore:
      // 1. Sentinel es visible (isIntersecting)
      // 2. NO estamos ya cargando (isLoadingMore)
      // 3. Hay más datos disponibles (hasMore)
      // 4. No hay otra carga pendiente (_loadMorePending)
      if (entry.isIntersecting && 
          !this.isLoadingMore() && 
          this.hasMore() && 
          !this._loadMorePending) {
        
        this._loadMorePending = true;
        this.loadMore.emit();  // Emit al contenedor
        
        // Debounce de 300ms para evitar múltiples emisiones
        setTimeout(() => {
          this._loadMorePending = false;
        }, 300);
      }
    },
    {
      root,                              // Scroll container (tableContainer)
      rootMargin: '0px 0px 200px 0px',  // Cargar 200px antes del final
      threshold: 0,                      // Cualquier visibilidad
    }
  );

  this.intersectionObserver.observe(this.scrollSentinelRef.nativeElement);
}
```

### Métodos de Utilidad para Animaciones

```typescript
/**
 * Determina si una fila pertenece al lote recientemente añadido
 * Se usa para animar solo las primeras 3 filas nuevas
 */
isNewBatchRow(index: number): boolean {
  const batchStart = this.lastBatchStartIndex();
  return batchStart > 0 && index >= batchStart && index < batchStart + 3;
}

/**
 * Calcula el delay para la animación staggered
 * Cada fila se anima con 30ms de delay adicional
 */
getRowAnimationDelay(index: number): number {
  const batchStart = this.lastBatchStartIndex();
  return (index - batchStart) * 30;  // 0ms, 30ms, 60ms
}
```

---

## Archivo 4: visitors.html (Template del Contenedor)

**Ruta**: `/libs/chat/features/visitors/src/lib/visitors/visitors.html`
**Líneas**: 201 total

### Fragmento Esencial - Container

```html
<div class="visitors-page">
  <div class="visitors-grid bento-grid bento-grid--4-cols">
    <div class="bento-card bento-card--4x3 visitors-panel">
      <div class="bento-card-header">
        <h3>Lista de Visitantes</h3>
        <!-- Controles de refresh -->
      </div>
      
      <div class="bento-card-content visitors-panel__content">
        <!-- Filtros -->
        <div class="visitors-panel__filters">
          <!-- componentes de filtro -->
        </div>

        <!-- CONTENEDOR SCROLLABLE - CRUCIAL -->
        <div class="visitors-panel__list-container">
          <lib-visitors-list
            [visitors]="filteredVisitors()"
            [loading]="state().loading"
            [isLoadingMore]="isLoadingMore()"
            [hasMore]="hasMore()"
            [lastBatchStartIndex]="lastBatchStartIndex()"
            (loadMore)="onLoadMore()"
          />
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Archivo 5: visitors-list.html (Template de Tabla)

**Ruta**: `/libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.html`
**Líneas**: 442 total

### Estructura Esencial

```html
<div class="visitors-list">
  <!-- Estado de carga o tabla -->
  
  <div class="visitors-list__table-container" #tableContainer>
    <!-- Scrollable container -->
    
    <table class="visitors-table">
      <thead>
        <tr>
          <!-- Headers con sorteo (sticky) -->
        </tr>
      </thead>
      
      <tbody>
        <!-- FILAS DE VISITANTES -->
        @for (visitor of filteredVisitors(); track visitor.id; let i = $index) {
          <tr
            class="visitors-table__row"
            [class.visitors-table__row--new-batch]="isNewBatchRow(i)"
            [style.animation-delay]="getRowAnimationDelay(i) + 'ms'"
          >
            <!-- Celdas de la fila -->
          </tr>
        }

        <!-- SKELETON ROWS - Se muestran mientras isLoadingMore() = true -->
        @if (isLoadingMore()) {
          @for (skeleton of [1, 2, 3]; track skeleton) {
            <tr class="visitors-table__row--skeleton">
              <!-- Celdas skeleton con animación shimmer -->
            </tr>
          }
        }
      </tbody>
    </table>

    <!-- SENTINEL ELEMENT - CRUCIAL PARA INFINITE SCROLL -->
    <!-- Cuando este elemento es visible, se dispara loadMore -->
    <div #scrollSentinel class="visitors-list__sentinel" aria-hidden="true"></div>

    <!-- Mensaje al final de la lista -->
    @if (!hasMore() && filteredVisitors().length > 0 && !isLoadingMore()) {
      <div class="visitors-list__end-message">
        Mostrando {{ filteredVisitors().length }} visitantes
      </div>
    }
  </div>
</div>
```

---

## Archivo 6: visitors.scss (Estilos del Contenedor)

**Ruta**: `/libs/chat/features/visitors/src/lib/visitors/visitors.scss`
**Líneas**: 769 total

### Fragmentos Críticos para Scroll

```scss
:host {
  display: block;
  height: 100%;
  overflow: hidden;  // NO scroll aquí, scroll en el contenedor
}

.visitors-page {
  display: flex;
  flex-direction: column;
  gap: tokens.$spacing-md;
  padding: tokens.$spacing-xl;
  max-width: 100%;
  height: 100%;          // Ocupar toda la altura
  overflow: hidden;      // NO scroll global
}

.bento-grid {
  display: grid;
  flex: 1;               // Ocupar espacio disponible
  min-height: 0;         // CRÍTICO: permitir contracción
}

.visitors-panel {
  height: 100%;          // Altura fija
  min-height: 0;         // CRÍTICO
  display: flex;
  flex-direction: column;
}

.bento-card-content {
  overflow: visible;     // Contenido visible, scroll lo maneja el container
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;         // CRÍTICO
}

.visitors-panel__content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;         // CRÍTICO
  flex: 1;
  padding: 0;            // Sin padding
  overflow: visible;
}

// CONTENEDOR CON SCROLL - Lo más importante
.visitors-panel__list-container {
  flex: 1;               // Ocupar espacio disponible
  display: flex;
  flex-direction: column;
  overflow: hidden;      // Clipea sin crear scroll - scroll lo maneja visitors-list
  padding: 0 tokens.$spacing-md;
  min-height: 0;         // CRÍTICO: permite flex con overflow
}
```

---

## Archivo 7: visitors-list.scss (Estilos de Tabla)

**Ruta**: `/libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.scss`
**Líneas**: 858 total

### Fragmentos Críticos

```scss
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;         // CRÍTICO
  width: 100%;
}

.visitors-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;         // CRÍTICO
  background-color: transparent;
  width: 100%;
}

// CONTENEDOR SCROLLABLE
.visitors-list__table-container {
  background: var(--color-surface-primary);
  overflow: auto;        // AQUÍ ESTÁ EL SCROLL
  flex: 1;
  min-height: 0;         // CRÍTICO

  .dropdown-menu {
    position: fixed;     // Menú flota sobre el scroll
  }
}

// TABLA
.visitors-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
}

// HEADERS STICKY
.visitors-table__header {
  position: sticky;
  top: 0;               // Se queda arriba
  z-index: 10;          // Encima del contenido
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border-subtle);
  height: 32px;
}

// FILAS
.visitors-table__row {
  cursor: pointer;
  position: relative;
  height: 36px;
  transition: background-color 100ms ease;

  &:hover {
    background-color: var(--color-surface-hover);
    
    .visitor-actions-overlay {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

// SENTINEL ELEMENT (invisible, 1px)
.visitors-list__sentinel {
  height: 1px;
  visibility: hidden;
}

// ANIMACIÓN DE FILAS NUEVAS
.visitors-table__row--new-batch {
  animation: vl-row-enter 180ms ease both;
}

@keyframes vl-row-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// SKELETON ROWS CON SHIMMER
.skeleton {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--color-surface-secondary) 25%,
    var(--color-surface-hover) 50%,
    var(--color-surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: vl-shimmer 1.4s infinite linear;
}

@keyframes vl-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## RESUMEN DE FLUJO

```
1. Usuario llega a /visitors
   └─ VisitorsComponent.ngOnInit()
      └─ loadVisitors() → page 1, limit 25
         └─ VisitorsDataService.searchVisitors()
            └─ Response: 25 visitantes + hasNextPage: true
               └─ state.visitors = [25 items]
                  └─ hasMore.set(true)
                     └─ VisitorsListComponent renderiza tabla
                        └─ IntersectionObserver observa sentinel

2. Usuario scrollea hacia abajo
   └─ Sentinel se vuelve visible (200px antes del final)
      └─ IntersectionObserver callback
         └─ VisitorsListComponent.loadMore.emit()
            └─ VisitorsComponent.onLoadMore()
               └─ infiniteOffset = 25
                  page = 2
                  isLoadingMore.set(true)
                  └─ searchVisitors(page: 2, limit: 25)
                     └─ Mostrar 3 skeleton rows
                        └─ Response: 25 nuevos visitantes
                           └─ state.visitors = [...50 anteriores, ...25 nuevos]
                              lastBatchStartIndex.set(25)
                              isLoadingMore.set(false)
                              └─ Tabla ahora tiene 50 items, anima los nuevos

3. Usuario aplica filtro
   └─ VisitorsComponent.searchVisitorsWithFilters()
      └─ _cancelLoadMore$.next() (cancelar cualquier carga)
         isResetting = true (bloquear procesamiento de cargas viejas)
         infiniteOffset = 0
         hasMore.set(true)
         state.visitors = []
         └─ searchVisitors(page: 1, limit: 25) con nuevos filtros
            └─ isResetting = false (puede procesar)
               └─ Response llega
                  └─ state.visitors = [25 nuevos resultados]
                     lastBatchStartIndex.set(0)
                     └─ Tabla resetea
```

---

## CHECKLIST DE IMPLEMENTACIÓN

- [x] Sentinel element en el HTML (después de todas las filas)
- [x] IntersectionObserver con rootMargin: '0px 0px 200px 0px'
- [x] Emit `loadMore` cuando sentinel es visible
- [x] Guard en `onLoadMore()` para bloquear múltiples cargas
- [x] APPEND visitors, no REPLACE (const merged = [...current, ...new])
- [x] Actualizar `lastBatchStartIndex` para animar nuevas filas
- [x] Actualizar `hasMore` con `response.pagination.hasNextPage`
- [x] Resetear con `_cancelLoadMore$` cuando aplica filtros
- [x] Usar `isResetting` flag para descartar cargas viejas
- [x] Headers sticky con `position: sticky; top: 0; z-index: 10;`
- [x] Flexbox correcto con `flex: 1; min-height: 0;` en containers
- [x] Skeleton rows mientras `isLoadingMore() = true`
- [x] Animación staggered para nuevas filas
- [x] Mensaje de "fin de lista" cuando `!hasMore()`

