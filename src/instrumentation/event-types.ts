export interface AkiraEvent<TPayload = unknown> {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  entityId?: string;
  actor?: string;
  correlationId?: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
  version: string | number;
}

export interface EventInput<TPayload = unknown> {
  id?: string;
  type: string;
  timestamp?: string;
  source: string;
  entityId?: string;
  actor?: string;
  correlationId?: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
  version: string | number;
}
