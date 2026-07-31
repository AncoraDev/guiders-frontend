import { Route } from '@angular/router';
import { ClientsList } from './clients-list/clients-list';
import { ClientCreate } from './client-create/client-create';
import { ClientDetail } from './client-detail/client-detail';

export const clientsRoutes: Route[] = [
  { path: '', component: ClientsList },
  { path: 'new', component: ClientCreate },
  { path: ':companyId', component: ClientDetail },
];
