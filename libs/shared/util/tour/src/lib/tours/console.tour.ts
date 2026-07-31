import { TourStepConfig } from '../tour-step.interface';

/**
 * Console interactive tour.
 *
 * Guided walkthrough of the operator console. Every step is informational
 * and progresses via the Prev/Next buttons rendered by Shepherd — no step
 * waits for the user to perform a real action. This keeps the tour
 * resilient to DOM changes and lets the user read at their own pace.
 *
 * The tour seeds a sandboxed demo conversation/visitor (see TourSandbox)
 * so steps that point at "the first conversation" or "the first visitor"
 * always have something to highlight, even on a brand-new account.
 *
 * Order chosen to mirror the operator's daily flow:
 *   1. Orient (sidebar + agent status)
 *   2. Reactive work (inbox → conversation → ficha del visitante)
 *   3. Proactive work (live visitors)
 *   4. Wrap-up (where to relaunch the tour)
 */
export const consoleTour: TourStepConfig[] = [
  // 1. Welcome
  {
    element: '[data-tour="sidebar-header"]',
    route: '/atencion',
    popover: {
      title: 'Bienvenido a Guiders',
      description:
        'Esta es tu consola de trabajo: todo lo que necesitas para atender a tus clientes en tiempo real está a un clic. Te lleva menos de un minuto.',
      side: 'right',
      align: 'start',
    },
  },
  // 2. Agent status — first thing operators set every shift
  {
    element: '[data-tour="status-trigger"]',
    route: '/atencion',
    popover: {
      title: 'Tu estado de agente',
      description:
        'Marca si estás Disponible, Ocupado o Ausente. El sistema solo te asigna chats nuevos cuando estás Disponible, así controlas tu carga.',
      side: 'bottom',
      align: 'end',
    },
  },
  // 3. Colas de Atención
  {
    element: '[data-tour="atencion-queues"]',
    route: '/atencion',
    popover: {
      title: 'Tus colas de atención',
      description:
        'Pendientes, Míos y En la web. El contador te avisa de chats nuevos o sin leer para que ninguna se te escape.',
      side: 'right',
      align: 'start',
    },
  },
  // 4. Área de conversación
  {
    element: '[data-tour="atencion-main"]',
    route: '/atencion',
    popover: {
      title: 'Área de conversación',
      description:
        'Al abrir un chat, ves el hilo completo aquí. El historial se carga automáticamente conforme bajas, sin que tengas que recargar nada.',
      side: 'left',
      align: 'center',
    },
  },
  // 5. Message input — how operators reply
  {
    element: '[data-tour="message-input"]',
    route: '/atencion',
    popover: {
      title: 'Responde con un atajo',
      description:
        'Escribe tu mensaje y pulsa Enter para enviar (Shift+Enter para salto de línea). Tu cliente verá que estás escribiendo en tiempo real.',
      side: 'top',
      align: 'center',
    },
  },
  // 6. Visitor detail panel — context without leaving the chat
  {
    element: '[data-tour="visitor-detail-panel"]',
    route: '/atencion',
    popover: {
      title: 'Ficha del visitante',
      description:
        'Contacto, página actual, dispositivo y actividad reciente — todo el contexto del visitante a la derecha, sin abandonar la conversación.',
      side: 'left',
      align: 'start',
    },
  },
  // 7. Live visitors — proactive engagement
  {
    element: '[data-tour="nav-visitors"]',
    route: '/atencion',
    popover: {
      title: 'Visitantes en vivo',
      description:
        'Aquí ves quién está navegando tu sitio ahora mismo, antes incluso de que escriba. Puedes adelantarte e iniciar tú la conversación.',
      side: 'right',
      align: 'center',
    },
  },
  // 8. Wrap-up — where to relaunch
  {
    element: '[data-tour="sidebar-header"]',
    route: '/atencion',
    popover: {
      title: 'Listo para atender',
      description:
        'Ya conoces lo esencial. Puedes volver a lanzar este tour cuando quieras desde el botón "Tour de la app" en el menú lateral.',
      side: 'right',
      align: 'start',
    },
  },
];
