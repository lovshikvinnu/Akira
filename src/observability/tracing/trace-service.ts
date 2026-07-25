import { AbstractTelemetryService } from "../services/abstract-telemetry-service";
import { telemetryService, telemetryFactory } from "../telemetry-service";
import { telemetryClock } from "../utils/clock";
import { TelemetryCorrelation } from "../models/correlation";
import { TelemetrySeverity } from "../models/severity";
import { TracingValidator } from "./tracing-validator";
import { TraceStateError } from "../errors/telemetry-errors";

/**
 * Simple in‑memory span state tracking. Keys are span IDs.
 * State machine: created → running → completed | cancelled
 */
interface SpanInfo {
  traceId: string;
  parentSpanId: string | null;
  name: string;
  start: bigint;
  state: "created" | "running" | "completed" | "cancelled";
}

/**
 * TraceService – public API for distributed tracing.
 * All operations are lock‑free; the internal map is a plain JavaScript object
 * (writes are atomic in V8) and never exposed externally.
 */
export class TraceService extends AbstractTelemetryService {
  private readonly spanMap = new Map<string, SpanInfo>();

  constructor() {
    super(new TracingValidator());
  }

  /** Generate a new trace identifier and install it into the async context. */
  startTrace(): string {
    const traceId = telemetryService.generateTrace();
    // Run with a fresh correlation that only contains the traceId.
    this.context.runWith({ traceId }, () => {});
    return traceId;
  }

  /** Start a new span under the current context. */
  startSpan(name: string, severity: TelemetrySeverity = TelemetrySeverity.INFO): string {
    const correlation = this.getCorrelation();
    const traceId = correlation.traceId ?? this.startTrace();
    const parentSpanId = correlation.spanId ?? null;
    const spanId = telemetryService.generateSpan();

    const spanInfo: SpanInfo = {
      traceId,
      parentSpanId,
      name,
      start: telemetryClock.monotonicNow(),
      state: "created",
    };
    // Validate state transition: created → running
    (this.validator as any).validateState(spanId, "created", "running");
    spanInfo.state = "running";
    this.spanMap.set(spanId, spanInfo);

    // Update async context with new span information
    this.context.runWith({ traceId, spanId, parentSpanId }, () => {});
    return spanId;
  }

  /** Finish a running span, emit a TraceRecord. */
  async finishSpan(
    spanId: string,
    status: "ok" | "error" = "ok",
    events: any[] = [],
  ): Promise<void> {
    const span = this.spanMap.get(spanId);
    if (!span) {
      throw new TraceStateError(`Span not found: ${spanId}`);
    }
    // Validate transition running → completed
    (this.validator as any).validateState(spanId, span.state, "completed");
    const end = telemetryClock.monotonicNow();
    const durationMs = telemetryClock.elapsedMs(span.start, end);
    const record = telemetryFactory.createTrace(
      "runtime", // moduleId – generic for visibility core
      "trace-service",
      spanId,
      span.parentSpanId,
      span.name,
      durationMs,
      status,
      events,
      TelemetrySeverity.INFO,
    );
    span.state = "completed";
    this.spanMap.delete(spanId);
    await this.record(record);
  }

  /** Record an error event for a span (does not finish it). */
  async recordError(spanId: string, error: Error, extraEvents: any[] = []): Promise<void> {
    const span = this.spanMap.get(spanId);
    if (!span) {
      throw new TraceStateError(`Span not found: ${spanId}`);
    }
    // No state change; just emit a trace record with status "error" and the error as an event.
    const event = { type: "error", message: error.message, stack: error.stack };
    await this.finishSpan(spanId, "error", [event, ...extraEvents]);
  }

  /** Cancel a running span – no TraceRecord emitted. */
  cancelSpan(spanId: string): void {
    const span = this.spanMap.get(spanId);
    if (!span) {
      throw new TraceStateError(`Span not found: ${spanId}`);
    }
    (this.validator as any).validateState(spanId, span.state, "cancelled");
    span.state = "cancelled";
    this.spanMap.delete(spanId);
  }
}
