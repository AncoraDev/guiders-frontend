import { Route } from '@angular/router';
import { ClientsList } from './clients-list/clients-list';
import { ClientCreate } from './client-create/client-create';
import { ClientDetail } from './client-detail/client-detail';
import { ClientApiDocs } from './client-api-docs/client-api-docs';
import { SdkVersions } from './sdk-versions/sdk-versions';

export const clientsRoutes: Route[] = [
  { path: '', component: ClientsList },
  { path: 'new', component: ClientCreate },
  { path: ':companyId', component: ClientDetail },
];

export const apiDocsRoutes: Route[] = [
  { path: '', component: ClientApiDocs },
];

export const sdkVersionsRoutes: Route[] = [
  { path: '', component: SdkVersions },
];
