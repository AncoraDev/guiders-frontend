import { TourStepConfig } from '../tour-step.interface';

export const adminTour: TourStepConfig[] = [
  {
    element: '[data-tour="dashboard-content"]',
    route: '/dashboard',
    popover: {
      title: 'Panel de control',
      description:
        'Visión general del rendimiento del equipo: chats activos, tiempos de respuesta y métricas clave.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="users-content"]',
    route: '/users',
    popover: {
      title: 'Gestión de usuarios',
      description:
        'Administra los agentes del equipo, sus roles y permisos de acceso a la aplicación.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="integrations-content"]',
    route: '/integrations',
    popover: {
      title: 'Integraciones',
      description:
        'Conecta Guiders con tus herramientas externas: API Keys, sitios web y CRMs.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: '¡Ya lo tienes todo!',
      description:
        'Puedes volver a ver este tour cuando quieras desde el menú de tu perfil.',
      side: 'right',
      align: 'start',
    },
  },
];
