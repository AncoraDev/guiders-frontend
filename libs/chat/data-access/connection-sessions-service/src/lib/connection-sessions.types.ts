export type ConnectionSessionEndReason =
  | 'manual'
  | 'logout'
  | 'browser_close'
  | 'unknown';

export type ConnectionSessionStatusFilter = 'open' | 'closed';

export interface ConnectionSession {
  id: string;
  commercialId: string;
  companyId: string;
  commercialDisplayName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  endReason: ConnectionSessionEndReason | null;
}

export interface ConnectionSessionsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConnectionSessionsListResponse {
  sessions: ConnectionSession[];
  pagination: ConnectionSessionsPagination;
}

export interface ConnectionSessionsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  endReason?: ConnectionSessionEndReason;
  status?: ConnectionSessionStatusFilter;
  commercialId?: string;
}
