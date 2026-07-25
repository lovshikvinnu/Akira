export interface TelemetryCorrelation {
  readonly correlationId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly capabilityId?: string;
  readonly eventId?: string;
}
