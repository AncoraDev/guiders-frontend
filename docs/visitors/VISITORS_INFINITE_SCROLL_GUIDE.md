# Exploración Completa: Sistema de Visitantes con Infinite Scroll

## 1. ARQUITECTURA GENERAL

### Estructura de Componentes
```
lib-visitors (Feature Component)
└── VisitorsListComponent (UI Component - lib-visitors-list)
    ├── Tabla con scroll infinito
    ├── Intersection Observer para lazy loading
    └── Sentinel element para detección de scroll
```

### Flujo de Datos
```
VisitorsComponent (contenedor)
  ↓
  state() - BehaviorSubject<VisitorState>
  ↓
  VisitorsListComponent (presentación)
  ↓
  VisitorsDataService (HTTP)
```

---

## 2. SERVICIO DE DATOS: VisitorsDataService

**Ubicación**: `libs/chat/data-access/visitors-data-service/src/lib/visitors-data-service.ts`

### Métodos Principales

#### searchVisitors() - Endpoint de Búsqueda
```typescript
searchVisitors(
  tenantId: string,
  request: VisitorSearchRequest = {}
): Observable<VisitorSearchResponse>
```
- **URL**: `POST /tenant-visitors/{tenantId}/visitors/search`
- **Parámetros**:
  - `filters`: VisitorSearchFilters (opcionales)
  - `sort`: VisitorSearchSort
  - `page`: número de página
  - `limit`: tamaño del lote (batch)
- **Respuesta**: 
  - `visitors`: VisitorSearchResult[]
  - `pagination`: { total, page, limit, totalPages, hasNextPage, hasPreviousPage }

#### getQuickFilters() / getSavedFilters()
```typescript
getQuickFilters(tenantId: string): Observable<QuickFiltersResponse>
getSavedFilters(tenantId: string): Observable<SavedFiltersResponse>
```
- Obtienen filtros predefinidos y guardados para filtrado avanzado

---

## 3. COMPONENTE PRINCIPAL: VisitorsComponent

**Ubicación**: `libs/chat/features/visitors/src/lib/visitors/visitors.ts` (2077 líneas)

### Estado Reactivo
```typescript
readonly state = signal<VisitorState>({
  visitors: [],           // Array actual de visitantes
  selectedVisitor: null,
  filters: {...},
  sort: { field: 'firstVisit', direction: 'desc' },
  pagination: {
    limit: 25 (batchSize),
    offset: 0,
    totalCount: 0,
    currentPage: 1,
  },
  loading: false,
  error: null,
  stats: null,
  searchQuery: '',
});
```

### Estados de Infinite Scroll
```typescript
readonly batchSize = 25;                  // Tamaño de cada lote
readonly isLoadingMore = signal<boolean>(false);
readonly hasMore = signal<boolean>(true); // ¿Hay más datos?
readonly lastBatchStartIndex = signal<number>(0); // Para animaciones
private infiniteOffset = 0;               // Offset actual para siguiente lote
private isResetting = false;              // Flag durante reset
private readonly _cancelLoadMore$ = new Subject<void>(); // Para cancelar en-flight
```

### Métodos Clave

#### loadVisitors()
- Carga la **primera página** de visitantes
- Usa `searchVisitors()` con `page: 1` y `limit: batchSize`
- Mapea resultados a formato `Visitor[]`
- Resetea `infiniteOffset = 0` y `hasMore`

```typescript
loadVisitors(options: { scrollToTop?: boolean } = {}): void {
  const request: VisitorSearchRequest = {
    filters: searchFilters,
    sort: { field: 'createdAt', direction: 'DESC' },
    page: 1,
    limit: this.batchSize,  // 25
  };
  
  this.visitorsService.searchVisitors(companyId, request)
    .subscribe((response) => {
      this.hasMore.set(response.pagination.hasNextPage);
      // Actualizar state.visitors
    });
}
```

#### onLoadMore()
- Método **clave para infinite scroll**
- Llamado cuando el Sentinel element se hace visible
- Carga el **siguiente lote** sin reemplazar los anteriores

```typescript
onLoadMore(): void {
  if (this.isResetting || this.isLoadingMore() || !this.hasMore()) return;

  const currentVisitors = this.state().visitors;
  const batchStart = currentVisitors.length;
  this.infiniteOffset = batchStart;  // Offset basado en cantidad actual
  this.isLoadingMore.set(true);

  const page = Math.floor(this.infiniteOffset / this.batchSize) + 1;

  const request: VisitorSearchRequest = {
    filters: searchFilters,
    sort: { field: 'createdAt', direction: 'DESC' },
    page,              // Página calculada
    limit: this.batchSize,
  };

  this.visitorsService.searchVisitors(companyId, request)
    .pipe(
      takeUntil(this._cancelLoadMore$),
      finalize(() => this.isLoadingMore.set(false))
    )
    .subscribe((response) => {
      if (this.isResetting) return;  // Descartar si hubo reset
      const newVisitors = this.mapSearchResultsToVisitors(response.visitors);
      const merged = [...currentVisitors, ...newVisitors];  // APPEND!
      this.lastBatchStartIndex.set(batchStart);
      this.hasMore.set(response.pagination.hasNextPage);
      this.updateState({ visitors: merged });  // Actualizar con merged array
    });
}
```

#### searchVisitorsWithFilters()
- Cuando se aplican filtros, cancela cargas pendientes y resetea
```typescript
private searchVisitorsWithFilters(): void {
  this._cancelLoadMore$.next();  // Cancelar cualquier loadMore en vuelo
  this.isResetting = true;       // Prevenir que loadMore aplique resultados antiguos
  this.infiniteOffset = 0;
  this.hasMore.set(true);
  this.lastBatchStartIndex.set(0);
  this.updateState({ visitors: [], loading: true });
  
  // Hacer nueva búsqueda con page: 1
  this.visitorsService.searchVisitors(companyId, request)
    .pipe(finalize(() => { this.isResetting = false; }))
    .subscribe((response) => {
      // Procesar respuesta...
    });
}
```

---

## 4. COMPONENTE UI: VisitorsListComponent

**Ubicación**: `libs/chat/ui/visitors-list/src/lib/visitors-list/visitors-list.ts` (788 líneas)

### Inputs
```typescript
readonly visitors = input<Visitor[]>([]);           // Array de visitantes
readonly isLoadingMore = input<boolean>(false);     // ¿Cargando más?
readonly hasMore = input<boolean>(true);            // ¿Hay más disponibles?
readonly lastBatchStartIndex = input<number>(0);    // Para animar filas nuevas
readonly loading = input<boolean>(false);           // Carga inicial
readonly config = input<VisitorListConfig>({...});
```

### Outputs
```typescript
readonly loadMore = output<void>();  // Emitido cuando sentinel es visible
readonly visitorClick = output<Visitor>();
readonly openChat = output<Visitor>();
```

### Referencias del DOM
```typescript
@ViewChild('scrollSentinel') scrollSentinelRef?: ElementRef<HTMLDivElement>;
@ViewChild('tableContainer') tableContainerRef?: ElementRef<HTMLDivElement>;
```

### Infinite Scroll Implementation
```typescript
private setupIntersectionObserver(): void {
  this.intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (this._destroyed) return;
      const entry = entries[0];
      
      // Emitir loadMore cuando:
      // 1. Sentinel es visible (isIntersecting)
      // 2. NO estamos ya cargando (isLoadingMore)
      // 3. Hay más datos (hasMore)
      if (entry.isIntersecting && !this.isLoadingMore() && this.hasMore() && !this._loadMorePending) {
        this._loadMorePending = true;
        this.loadMore.emit();  // Emit al contenedor
        
        // Debounce para evitar múltiples emisiones
        setTimeout(() => {
          this._loadMorePending = false;
        }, 300);
      }
    },
    {
      root: this.tableContainerRef?.nativeElement ?? null,  // Scroll container
      rootMargin: '0px 0px 200px 0px',  // Cargar 200px antes de llegar al final
      threshold: 0,                      // Cualquier visibilidad
    }
  );

  this.intersectionObserver.observe(this.scrollSentinelRef.nativeElement);
}
```

---

## 5. PLANTILLAS HTML Y ESTILOS

### Estructura del Container (visitors.html)

```html
<div class="visitors-panel__list-container">
  <!-- Scrollable container: flex con min-height: 0 -->
  <lib-visitors-list
    [visitors]="filteredVisitors()"
    [isLoadingMore]="isLoadingMore()"
    [hasMore]="hasMore()"
    [lastBatchStartIndex]="lastBatchStartIndex()"
    (loadMore)="onLoadMore()"
  />
</div>
```

### Estructura del Componente (visitors-list.html)

```html
<div class="visitors-list">
  <!-- Estado de carga o tabla -->
  
  <div class="visitors-list__table-container" #tableContainer>
    <!-- Scrollable container para la tabla -->
    
    <table class="visitors-table">
      <thead>
        <!-- Headers (sticky) -->
      </thead>
      <tbody>
        <!-- Filas reales -->
        @for (visitor of filteredVisitors(); track visitor.id; let i = $index) {
          <tr
            [class.visitors-table__row--new-batch]="isNewBatchRow(i)"
            [style.animation-delay]="getRowAnimationDelay(i) + 'ms'"
          >
            <!-- Celdas -->
          </tr>
        }

        <!-- Skeleton rows mientras carga más -->
        @if (isLoadingMore()) {
          @for (skeleton of [1, 2, 3]; track skeleton) {
            <tr class="visitors-table__row--skeleton">
              <!-- Skeleton cells -->
            </tr>
          }
        }
      </tbody>
    </table>

    <!-- SENTINEL ELEMENT - Crucial para infinite scroll -->
    <div #scrollSentinel class="visitors-list__sentinel" aria-hidden="true"></div>

    <!-- Mensaje de fin de lista -->
    @if (!hasMore() && filteredVisitors().length > 0) {
      <div class="visitors-list__end-message">
        Mostrando {{ filteredVisitors().length }} visitantes
      </div>
    }
  </div>
</div>
```

### Estilos Clave (visitors-list.scss)

#### Estructura Flexbox del Container

```scss
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;  // CRÍTICO: permite que contenedor se encoja
}

.visitors-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;  // CRÍTICO
}

.visitors-list__table-container {
  background: var(--color-surface-primary);
  overflow: auto;    // Scrollable
  flex: 1;
  min-height: 0;     // CRÍTICO
}
```

#### Tabla y Headers

```scss
.visitors-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.visitors-table__header {
  position: sticky;
  top: 0;           // Headers se quedan arriba al scroll
  z-index: 10;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border-subtle);
  height: 32px;
}

.visitors-table__row {
  cursor: pointer;
  height: 36px;
  transition: background-color 100ms ease;
  
  &:hover {
    background-color: var(--color-surface-hover);
    
    .visitor-actions-overlay {
      opacity: 1;  // Mostrar botones de acción al hover
      pointer-events: auto;
    }
  }
}
```

#### Sentinel y Animaciones

```scss
// Sentinel element: invisible, 1px de alto
.visitors-list__sentinel {
  height: 1px;
  visibility: hidden;
}

// Filas del nuevo lote: animación staggered
.visitors-table__row--new-batch {
  animation: vl-row-enter 180ms ease both;
  // Delay se calcula dinámicamente en el componente
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
```

#### Headers Sticky y Scrollable

```scss
.visitors-list__table-container {
  overflow: auto;  // Permite scroll
  
  .dropdown-menu {
    position: fixed;  // Menú flotante por encima del scroll
  }
}

.visitors-table__header {
  position: sticky;
  top: 0;          // Se queda arriba al scrollear
  z-index: 10;     // Por encima del contenido
}
```

---

## 6. FLUJO COMPLETO DE INFINITE SCROLL

### Secuencia de Carga Inicial

```
User lands on /visitors
        ↓
VisitorsComponent.ngOnInit()
        ↓
getCompanySites() → obtener companyId
        ↓
loadVisitors() con page: 1, limit: 25
        ↓
VisitorsDataService.searchVisitors()
        ↓
Actualizar state.visitors = [25 visitantes]
state.pagination.hasNextPage = true
hasMore.set(true)
        ↓
VisitorsListComponent renderiza 25 filas + sentinel
        ↓
IntersectionObserver registra el sentinel
```

### Secuencia de Carga Siguiente

```
User scrollea hacia abajo...
        ↓
Sentinel se vuelve visible (200px before end)
        ↓
IntersectionObserver callback dispara
        ↓
VisitorsListComponent.loadMore.emit()
        ↓
VisitorsComponent.onLoadMore()
  - isLoadingMore.set(true)
  - infiniteOffset = 25 (cantidad actual)
  - page = Math.floor(25/25) + 1 = 2
        ↓
searchVisitors(page: 2, limit: 25)
        ↓
Renderizar 3 skeleton rows mientras carga
        ↓
Respuesta llega con 25 nuevos visitantes
        ↓
state.visitors = [...25 anteriores, ...25 nuevos] = 50 total
lastBatchStartIndex.set(25) → animar nuevas filas
hasMore.set(response.pagination.hasNextPage)
isLoadingMore.set(false) → quitar skeletons
        ↓
Tabla ahora muestra 50 visitantes
Sentinel baja a la posición 50
```

### Cuando Aplica Filtros

```
User aplica filtro/búsqueda
        ↓
VisitorsComponent.searchVisitorsWithFilters()
  - _cancelLoadMore$.next() → cancela cualquier loadMore en vuelo
  - isResetting = true
  - infiniteOffset = 0
  - hasMore.set(true)
  - state.visitors = []
        ↓
searchVisitors(page: 1, limit: 25) con nuevos filtros
        ↓
Respuesta llega
  - Si isResetting = true (no hubo reset nuevo), procesar
  - state.visitors = [nuevos 25 resultados]
  - lastBatchStartIndex.set(0)
        ↓
Tabla resetea a los primeros 25 nuevos resultados
```

---

## 7. GUARDRAILS Y GUARDIAS

### Guard onLoadMore()

```typescript
onLoadMore(): void {
  // 4 condiciones de guarda:
  if (this.isResetting)           // ❌ No cargar si hay reset en progreso
    return;
  if (this.isLoadingMore())       // ❌ No cargar dos veces
    return;
  if (!this.hasMore())            // ❌ No cargar si no hay más
    return;
  if (this.state().loading)       // ❌ No cargar si carga inicial en progreso
    return;

  // ... proceder a cargar
}
```

### Guard del Observable

```typescript
this.visitorsService
  .searchVisitors(companyId, request)
  .pipe(
    takeUntil(this._cancelLoadMore$),  // Cancelar si hay nuevo filtro
    finalize(() => this.isLoadingMore.set(false))  // Limpiar siempre
  )
  .subscribe((response) => {
    if (this.isResetting) return;  // Descartar si resetearon durante la llamada
    // ... procesar respuesta
  });
```

---

## 8. CARACTERÍSTICAS AVANZADAS

### Auto-Refresh Reactivo
```typescript
private readonly _refreshInterval$ = new BehaviorSubject<number>(30000);

constructor() {
  this._refreshInterval$
    .pipe(
      switchMap(ms => ms === 0 ? EMPTY : interval(ms)),
      takeUntilDestroyed(this.destroyRef),
    )
    .subscribe(() => this.refreshVisitors());
}
```

### Presencia en Tiempo Real
```typescript
private setupPresenceListener(): void {
  this.presenceService.presenceChanged$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((event: PresenceChangedEvent) => {
      // Actualizar estado de visitante sin recargar lista
      const updatedVisitors = [...visitors];
      updatedVisitors[index] = {
        ...updatedVisitors[index],
        connectionStatus: event.status,
      };
      this.updateState({ visitors: updatedVisitors });
    });
}
```

### Animaciones Staggered de Filas Nuevas
```typescript
isNewBatchRow(index: number): boolean {
  const batchStart = this.lastBatchStartIndex();
  return batchStart > 0 && index >= batchStart && index < batchStart + 3;
}

getRowAnimationDelay(index: number): number {
  const batchStart = this.lastBatchStartIndex();
  return (index - batchStart) * 30;  // Delay de 30ms por fila
}
```

Template:
```html
<tr
  [class.visitors-table__row--new-batch]="isNewBatchRow(i)"
  [style.animation-delay]="getRowAnimationDelay(i) + 'ms'"
>
```

---

## 9. PUNTOS CLAVE DE IMPLEMENTACIÓN

### Scroll Container Correcto
- `.visitors-panel__list-container` en el padre
- `.visitors-list__table-container` en el hijo
- Ambos: `flex: 1; min-height: 0;` para flexbox correcto

### Sentinel Element
- Debe estar **dentro** del scroll container
- `height: 1px; visibility: hidden;`
- **Después** de todas las filas reales
- IntersectionObserver lo observa

### rootMargin en IntersectionObserver
```javascript
rootMargin: '0px 0px 200px 0px'
// Dispara cuando el sentinel está a 200px del fondo
// Permite cargar con anticipación antes de llegar al final
```

### Página Calculada
```typescript
const page = Math.floor(this.infiniteOffset / this.batchSize) + 1;
// infiniteOffset = 25, batchSize = 25
// page = Math.floor(25/25) + 1 = 2
```

### APPEND, no REPLACE
```typescript
const merged = [...currentVisitors, ...newVisitors];
this.updateState({ visitors: merged });
```

---

## 10. RESUMEN DE ARCHIVOS

| Archivo | Líneas | Propósito |
|---------|--------|-----------|
| `visitors-data-service.ts` | 865 | HTTP API calls, searchVisitors() |
| `visitors.ts` | 2077 | Componente contenedor, lógica de carga |
| `visitors.html` | 201 | Template con grid y panel |
| `visitors.scss` | 769 | Estilos del layout principal |
| `visitors-list.ts` | 788 | Componente tabla, IntersectionObserver |
| `visitors-list.html` | 442 | Template tabla con rows y sentinel |
| `visitors-list.scss` | 858 | Estilos tabla, sticky headers, animaciones |

---

## 11. DEBUGGING Y CHECKLIST

- [ ] Sentinel element renderizado al final de la tabla
- [ ] IntersectionObserver inicializado en ngAfterViewInit()
- [ ] `isLoadingMore()` input está conectado
- [ ] `hasMore()` input está conectado
- [ ] `loadMore.emit()` dispara al scroll
- [ ] `onLoadMore()` respeta todos los guards
- [ ] `state.visitors` se actualiza con APPEND (no replace)
- [ ] `lastBatchStartIndex` se actualiza para animaciones
- [ ] Cuando aplica filtro, `_cancelLoadMore$` se triggeriza
- [ ] `isResetting` previene que cargas viejas se apliquen
- [ ] Flexbox parents tienen `flex: 1; min-height: 0;`
- [ ] Table container tiene `overflow: auto;`
- [ ] Headers son `position: sticky; top: 0; z-index: 10;`

