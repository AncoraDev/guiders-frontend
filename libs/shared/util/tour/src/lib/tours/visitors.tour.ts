import { TourStepConfig } from '../tour-step.interface';

/**
 * Visitors interactive tour.
 *
 * Guided walkthrough of the live visitors view (`/visitors`). Auto-starts the
 * first time an operator lands on this view. Every step is informational and
 * progresses via Prev/Next — no step waits for a real action so the tour stays
 * resilient to DOM changes.
 *
 * Flow chosen to mirror how operators discover the panel for the first time:
 *   1. Welcome to the live visitors panel
 *   2. Auto-refresh interval + manual refresh button
 *   3. Quick filters (status chips)
 *   4. Cancel an active filter via the chip's close button
 *   5. Advanced filters (build a custom filter)
 *   6. Open a chat by clicking a visitor row
 *   7. Contextual menu (six-dot handle) — covers "Tomar pendiente" and other actions
 *
 * Note: the contextual menu's "Tomar pendiente" item only renders when the
 * dropdown is open (it lives in a portal outside the table). To keep the tour
 * informational and immune to DOM presence, we describe the action from the
 * menu trigger instead of pointing at the menu item itself.
 */
export const visitorsTour: TourStepConfig[] = [
  // 1. Welcome
  {
    element: '[data-tour="visitors-panel"]',
    route: '/atencion',
    popover: {
      title: 'Visitantes en tiempo real',
      description:
        'Aquí ves quién está navegando tu sitio ahora mismo. Puedes filtrar, abrir un chat o adelantarte a una conversación pendiente sin salir de esta vista.',
      side: 'bottom',
      align: 'start',
    },
  },
  // 2. Auto-refresh + manual refresh
  {
    element: '[data-tour="visitors-refresh-controls"]',
    route: '/atencion',
    popover: {
      title: 'Recarga y frecuencia de actualización',
      description:
        'Elige cada cuánto se refresca la lista automáticamente o pulsa el botón de recargar para actualizarla al instante. Útil cuando esperas a un visitante concreto.',
      side: 'bottom',
      align: 'end',
    },
  },
  // 3. Quick filters (status chips)
  {
    element: '[data-tour="visitors-quick-filters"]',
    route: '/atencion',
    popover: {
      title: 'Filtros rápidos',
      description:
        'Acota la lista con un clic: visitantes en línea, chateando, con chats pendientes… Solo puedes tener un chip activo a la vez; si necesitas combinar criterios, usa los filtros avanzados.',
      side: 'bottom',
      align: 'start',
    },
  },
  // 4. Active filters — cancel via chip close button
  {
    element: '[data-tour="visitors-active-filters"]',
    route: '/atencion',
    popover: {
      title: 'Cancela filtros con un clic',
      description:
        'Cada filtro activo aparece como un chip (ej: Estado: En línea). Pulsa la "x" del chip para quitar ese filtro, o "Limpiar todos" para empezar de cero.',
      side: 'bottom',
      align: 'start',
    },
  },
  // 5. Advanced filters — create a custom filter
  {
    element: '[data-tour="visitors-advanced-btn"]',
    route: '/atencion',
    popover: {
      title: 'Crea tu filtro personalizado',
      description:
        'Abre los filtros avanzados para combinar criterios (estado, página, tiempo en sitio, etiquetas…) y guardarlos como filtro reutilizable.',
      side: 'bottom',
      align: 'end',
    },
  },
  // 6. Open chat by clicking a visitor row
  {
    element: '[data-tour="visitor-item-first"]',
    route: '/atencion',
    popover: {
      title: 'Abre un chat al instante',
      description:
        'Haz clic en cualquier fila de visitante para abrir su chat. Si aún no tiene conversación, se inicia una nueva; si ya hay hilo, lo retomas exactamente donde quedó.',
      side: 'top',
      align: 'start',
    },
  },
  // 7. Contextual menu — six-dot handle (covers "Tomar pendiente")
  {
    element: '[data-tour="visitor-row-menu-trigger"]',
    route: '/atencion',
    popover: {
      title: 'Menú contextual del visitante',
      description:
        'Pulsa el handle de seis puntos junto a cualquier fila para abrir un menú con ver perfil, historial, etiquetar y tomar conversaciones pendientes (si las hay) — todo sin salir de la lista.',
      side: 'right',
      align: 'start',
    },
  },
];
