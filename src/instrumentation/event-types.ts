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
  /**
   * Marks an event that must travel the platform bus but must never be written
   * to the event store.
   *
   * Some platform signals are facts worth keeping ("this task was completed")
   * and some are momentary state ("presence changed again"). Both belong on the
   * one bus — every subscriber that wants them should get them — but only the
   * first belongs in an append-only log. Without this distinction a
   * high-frequency signal silently becomes the bulk of the durable record.
   *
   * The producer is the only party that knows which kind its event is, so the
   * declaration lives on the event rather than in a list held by the
   * persistence layer. `PersistenceSubscriber` is the sole enforcement point;
   * delivery, ordering and every other subscriber are unaffected.
   */
  transient?: boolean;
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

  /** See {@link AkiraEvent.transient}. Carried through the middleware untouched. */
  transient?: boolean;
}
